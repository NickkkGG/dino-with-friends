import type {
  ClientMessage, LobbyPhase, LobbyPlayer, ResultRow, RunState, ServerMessage, TowerRow,
} from '../../shared/lobby/protocol';
import { parseServerMessage } from '../../shared/lobby/protocol';
import { wsUrl } from './api';
import { CLOCK_SAMPLES, ClockSync } from './clock';

/** The part of a WebSocket a session uses, so tests can hand it a fake. */
export interface SocketLike {
  readyState: number;
  send(data: string): void;
  close(code?: number): void;
  onopen: (() => void) | null;
  onmessage: ((e: { data: unknown }) => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
}

export type SessionError = 'CANT_CONNECT' | 'LOBBY_NOT_FOUND' | 'LOBBY_FULL' | 'CONNECTION_LOST';

/** Everything the screens show of a lobby, as the server last told it. */
export interface SessionView {
  status: 'connecting' | 'joined' | 'failed';
  error: SessionError | null;
  code: string;
  /** This player's id, from the welcome. */
  you: string | null;
  players: readonly LobbyPlayer[];
  phase: LobbyPhase;
  round: number;
  countdown: { round: number; seed: number; startAt: number } | null;
  tower: readonly TowerRow[];
  end: { round: number; results: readonly ResultRow[] } | null;
  /** The name of every player seen in this lobby, by id, also of those who have left. */
  names: ReadonlyMap<string, string>;
}

export interface SessionOptions {
  code: string;
  name: string;
  open?: (url: string) => SocketLike;
  /** This page's clock, for the pings. */
  now?: () => number;
  /** The date's clock, for before the first pong. */
  wall?: () => number;
  location?: { protocol: string; host: string };
  /** The build this page says it is, which the lobby server must be too. Default this build. */
  version?: string;
}

const OPEN = 1;

/** A browser WebSocket behind the SocketLike handlers. */
function browserSocket(url: string): SocketLike {
  const ws = new WebSocket(url);
  const socket: SocketLike = {
    get readyState() {
      return ws.readyState;
    },
    send: (data) => ws.send(data),
    close: (code) => ws.close(code),
    onopen: null,
    onmessage: null,
    onclose: null,
    onerror: null,
  };
  ws.onopen = () => socket.onopen?.();
  ws.onmessage = (e) => socket.onmessage?.({ data: e.data });
  ws.onclose = () => socket.onclose?.();
  ws.onerror = () => socket.onerror?.();
  return socket;
}

/**
 * One player's connection to one lobby. It says hello, keeps the server's clock with bursts of pings, and holds what
 * the server last said as a view that only changes when something in it does, for useSyncExternalStore.
 */
export class LobbySession {
  private readonly code: string;
  private readonly name: string;
  private readonly open: (url: string) => SocketLike;
  private readonly now: () => number;
  private readonly wall: () => number;
  private readonly location: { protocol: string; host: string } | null;
  private readonly version: string;
  private readonly clock = new ClockSync();
  private readonly listeners = new Set<() => void>();
  private socket: SocketLike | null = null;
  private current: SessionView;
  private pingsLeft = 0;
  /** The `c` of the ping waiting for its pong. */
  private pingOut: number | null = null;
  /** Set once the game itself ends the connection, by leave() or dispose(). */
  private done = false;

  constructor(o: SessionOptions) {
    this.code = o.code;
    this.name = o.name;
    this.open = o.open ?? browserSocket;
    this.now = o.now ?? (() => performance.now());
    this.wall = o.wall ?? (() => Date.now());
    this.location = o.location ?? null;
    this.version = o.version ?? __BUILD_VERSION__;
    this.current = {
      status: 'connecting', error: null, code: o.code, you: null, players: [], phase: 'lobby', round: 0,
      countdown: null, tower: [], end: null, names: new Map(),
    };
  }

  connect(): void {
    const socket = this.open(wsUrl(this.code, this.location ?? window.location));
    this.socket = socket;
    socket.onopen = () => {
      this.send({ type: 'hello', v: this.version, name: this.name, token: null });
      this.pingBurst();
    };
    socket.onmessage = (e) => this.receive(e.data);
    socket.onclose = () => this.closed();
    socket.onerror = null; // a close always follows
  }

  view(): SessionView {
    return this.current;
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  start(): void {
    this.send({ type: 'start' });
  }

  leave(): void {
    this.send({ type: 'leave' });
    this.finish();
  }

  sendState(s: RunState): void {
    this.send({ type: 'state', ...s });
  }

  sendDead(d: number): void {
    this.send({ type: 'dead', d });
  }

  /** The server's clock now: from the pongs once there is one, from the date before that. */
  serverNow(): number {
    return this.clock.count > 0 ? this.clock.toServer(this.now()) : this.wall();
  }

  /** Ends the connection without a word, for when the screen goes away. */
  dispose(): void {
    this.finish();
  }

  private finish(): void {
    this.done = true;
    this.socket?.close();
  }

  private send(msg: ClientMessage): void {
    if (this.socket?.readyState === OPEN) this.socket.send(JSON.stringify(msg));
  }

  private pingBurst(): void {
    this.pingsLeft = CLOCK_SAMPLES;
    if (this.pingOut === null) this.ping();
  }

  private ping(): void {
    this.pingsLeft -= 1;
    this.pingOut = this.now();
    this.send({ type: 'ping', c: this.pingOut });
  }

  private update(patch: Partial<SessionView>): void {
    this.current = { ...this.current, ...patch };
    for (const fn of this.listeners) fn();
  }

  private receive(data: unknown): void {
    const msg: ServerMessage | null = parseServerMessage(data);
    if (msg === null) return;
    switch (msg.type) {
      case 'welcome':
        this.update({ status: 'joined', you: msg.you });
        break;
      case 'lobby': {
        const names = new Map(this.current.names);
        for (const p of msg.players) names.set(p.id, p.name);
        this.update({ players: msg.players, phase: msg.phase, round: msg.round, names });
        break;
      }
      case 'countdown':
        this.update({ countdown: { round: msg.round, seed: msg.seed, startAt: msg.startAt } });
        this.pingBurst();
        break;
      case 'tower':
        this.update({ tower: msg.rows });
        break;
      case 'end':
        this.update({ end: { round: msg.round, results: msg.results } });
        break;
      case 'pong':
        if (msg.c !== this.pingOut) break;
        this.clock.add({ sent: msg.c, received: this.now(), server: msg.s });
        this.pingOut = null;
        if (this.pingsLeft > 0) this.ping();
        break;
      case 'error':
        if (msg.code === 'LOBBY_NOT_FOUND' || msg.code === 'LOBBY_FULL') {
          this.update({ status: 'failed', error: msg.code });
          this.socket?.close();
        }
        break;
    }
  }

  private closed(): void {
    if (this.done || this.current.status === 'failed') return;
    this.update({ status: 'failed', error: this.current.you === null ? 'CANT_CONNECT' : 'CONNECTION_LOST' });
  }
}
