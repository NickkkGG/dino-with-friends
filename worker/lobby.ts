import { DurableObject } from 'cloudflare:workers';
import { LobbyCore } from '../shared/lobby/core';
import type { LobbyEvent, LobbyStep, SavedLobby } from '../shared/lobby/core';
import { parseClientMessage } from '../shared/lobby/protocol';
import type { ServerMessage } from '../shared/lobby/protocol';
import { applyStep } from './apply-step';
import type { StepStorage } from './apply-step';
import type { Env } from './env';

const STORAGE_KEY = 'lobby';

/** A random 32-bit whole number, for a round's seed. */
const seeds = (): number => crypto.getRandomValues(new Uint32Array(1))[0]!;

/** A new secret for a seat. */
const tokens = (): string => crypto.randomUUID();

/** The id a socket was given when it came in, kept on the socket so it survives the object sleeping. */
function connOf(ws: WebSocket): string {
  const attachment: unknown = ws.deserializeAttachment();
  const ok = typeof attachment === 'object' && attachment !== null && 'conn' in attachment;
  return ok && typeof attachment.conn === 'string' ? attachment.conn : '';
}

/**
 * One lobby. Its rules are a LobbyCore; the runtime keeps its players' sockets open while the object sleeps between
 * messages, the lobby's state is in storage for when it wakes, and its timers are one alarm. A lobby left empty for
 * long enough wipes itself, and is no lobby any more.
 */
export class Lobby extends DurableObject<Env> {
  private core: LobbyCore | null = null;
  private alarmAt: number | null = null;
  private readonly storage: StepStorage = {
    put: (saved) => this.ctx.storage.put(STORAGE_KEY, saved),
    setAlarm: (at) => this.ctx.storage.setAlarm(at),
    deleteAlarm: () => this.ctx.storage.deleteAlarm(),
    deleteAll: () => this.ctx.storage.deleteAll(),
  };

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    void ctx.blockConcurrencyWhile(async () => {
      const saved = await ctx.storage.get<SavedLobby>(STORAGE_KEY);
      this.alarmAt = await ctx.storage.getAlarm();
      // A deploy or a restart ends every socket without a close event: the seats whose sockets are gone are away now.
      const open = new Set(ctx.getWebSockets().map(connOf));
      if (saved) this.core = LobbyCore.restore(saved, { seeds, tokens, version: __BUILD_VERSION__ }, Date.now(), open);
      // What fell due while the object slept is dealt with at once.
      await this.run({ kind: 'alarm' });
    });
  }

  /** Makes this the lobby `code`, unless it is a lobby already. */
  async create(code: string): Promise<boolean> {
    if (this.core) return false;
    this.core = new LobbyCore({ code, seeds, tokens, version: __BUILD_VERSION__, now: Date.now() });
    await this.run({ kind: 'alarm' }); // saves the new lobby, and sets the alarm for when it is left empty
    return true;
  }

  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('Upgrade Required', { status: 426 });
    }
    const { 0: client, 1: server } = new WebSocketPair();
    if (this.core) {
      this.ctx.acceptWebSocket(server);
      server.serializeAttachment({ conn: crypto.randomUUID() });
    } else {
      // Not kept while the object sleeps: a hibernatable socket closed this early would linger until the object did.
      server.accept();
      const notFound: ServerMessage = { type: 'error', code: 'LOBBY_NOT_FOUND' };
      server.send(JSON.stringify(notFound));
      server.close(4004, 'LOBBY_NOT_FOUND');
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  override async webSocketMessage(ws: WebSocket, data: string | ArrayBuffer): Promise<void> {
    const conn = connOf(ws);
    const msg = parseClientMessage(data);
    await this.run(msg ? { kind: 'message', conn, msg } : { kind: 'bad', conn });
  }

  override async webSocketClose(ws: WebSocket): Promise<void> {
    try {
      ws.close(1000, 'bye'); // finishes the closing handshake, where the runtime does not answer a close by itself
    } catch {
      // Answered already.
    }
    await this.run({ kind: 'close', conn: connOf(ws) });
  }

  override async webSocketError(ws: WebSocket): Promise<void> {
    await this.run({ kind: 'close', conn: connOf(ws) });
  }

  override async alarm(): Promise<void> {
    this.alarmAt = null;
    await this.run({ kind: 'alarm' });
  }

  private async run(ev: LobbyEvent): Promise<void> {
    if (this.core) await this.apply(this.core, this.core.handle(ev, Date.now()));
  }

  // Everything that changes in memory happens before the first await, so two events that overlap there stay in order.
  private async apply(core: LobbyCore, step: LobbyStep): Promise<void> {
    const sockets = new Map<string, WebSocket>();
    for (const ws of this.ctx.getWebSockets()) sockets.set(connOf(ws), ws);
    const { alarmAt, done } = applyStep({ sockets, storage: this.storage, core, step, alarmAt: this.alarmAt });
    this.alarmAt = alarmAt;
    if (step.expired) this.core = null;
    await done;
  }
}
