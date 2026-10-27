import type {
  ClientMessage, LobbyPhase, LobbyPlayer, ResultRow, RunState, ServerMessage, TowerRow, WatchPair,
} from '../../shared/lobby/protocol';
import { parseServerMessage } from '../../shared/lobby/protocol';
import { wsUrl } from './api';
import { CLOCK_SAMPLES, ClockSync } from './clock';
import { sessionTokens } from './tokens';
import type { TokenStore } from './tokens';

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

export type SessionError = 'CANT_CONNECT' | 'LOBBY_NOT_FOUND' | 'LOBBY_FULL' | 'CONNECTION_LOST' | 'VERSION_MISMATCH';

/** How long after a drop a session tries again, and again after each try that fails. */
export const RETRY_MS = 1000;

/** How long it keeps trying after a drop in a round: the lobby counts a runner out 10 s after their last state. */
export const ROUND_RETRY_MS = 10_000;

/** How long it keeps trying after a drop outside a round: as long as the lobby keeps the seat. */
export const LOBBY_RETRY_MS = 120_000;

/** How often a watcher says again whom it watches, for a lobby that has forgotten since, as after a restart. */
export const WATCH_AGAIN_MS = 5000;

/** Everything the screens show of a lobby, as the server last told it. */
export interface SessionView {
  /** 'reconnecting': the connection dropped, and the session is trying to get its seat back. */
  status: 'connecting' | 'joined' | 'reconnecting' | 'failed';
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
  /** Who watches whom in the round on, in the order they began. */
  watching: readonly WatchPair[];
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
  /** Where the tab keeps the token of its seat. Default sessionStorage. */
  tokens?: TokenStore;
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
 * the server last said as a view that only changes when something in it does, for useSyncExternalStore. When the
 * connection drops it tries again every second with the token of its seat, for as long as the lobby keeps the seat.
 */
export class LobbySession {
  private readonly code: string;
  private readonly name: string;
  private readonly open: (url: string) => SocketLike;
  private readonly now: () => number;
  private readonly wall: () => number;
  private readonly location: { protocol: string; host: string } | null;
  private readonly version: string;
  private readonly tokens: TokenStore;
  private readonly clock = new ClockSync();
  private readonly listeners = new Set<() => void>();
  private readonly relayListeners = new Set<(id: string, s: RunState) => void>();
  private socket: SocketLike | null = null;
  private current: SessionView;
  private pingsLeft = 0;
  /** The `c` of the ping waiting for its pong. */
  private pingOut: number | null = null;
  /** Set once the game itself ends the connection, by leave() or dispose(). */
  private done = false;
  /** When the connection dropped, by this page's clock, and whether a round was on then; null while it is up. */
  private away: { at: number; inRound: boolean } | null = null;
  private retry: ReturnType<typeof setTimeout> | null = null;
  /** The runner this player watches, said again after each welcome and every WATCH_AGAIN_MS. */
  private watched: string | null = null;
  private watchAgain: ReturnType<typeof setInterval> | null = null;

  constructor(o: SessionOptions) {
    this.code = o.code;
    this.name = o.name;
    this.open = o.open ?? browserSocket;
    this.now = o.now ?? (() => performance.now());
    this.wall = o.wall ?? (() => Date.now());
    this.location = o.location ?? null;
    this.version = o.version ?? __BUILD_VERSION__;
    this.tokens = o.tokens ?? sessionTokens();
    this.current = {
      status: 'connecting', error: null, code: o.code, you: null, players: [], phase: 'lobby', round: 0,
      countdown: null, tower: [], end: null, names: new Map(), watching: [],
    };
  }

  connect(): void {
    const socket = this.open(wsUrl(this.code, this.location ?? window.location));
    this.socket = socket;
    this.pingOut = null; // a ping out on a socket that dropped gets no pong
    socket.onopen = () => {
      if (socket !== this.socket) return;
      this.send({ type: 'hello', v: this.version, name: this.name, token: this.tokens.get(this.code) });
      this.pingBurst();
    };
    socket.onmessage = (e) => {
      if (socket === this.socket) this.receive(e.data);
    };
    socket.onclose = () => {
      if (socket === this.socket) this.closed();
    };
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

  /** Asks to watch a runner, and asks again after each new welcome and every WATCH_AGAIN_MS until the round ends. */
  watch(target: string): void {
    this.watched = target;
    this.send({ type: 'watch', target });
    this.watchAgain ??= setInterval(() => {
      if (this.watched !== null) this.send({ type: 'watch', target: this.watched });
    }, WATCH_AGAIN_MS);
  }

  /** Each relayed state, as it comes; gives back the way to stop. Relays never go through the view. */
  onRelay(fn: (id: string, s: RunState) => void): () => void {
    this.relayListeners.add(fn);
    return () => this.relayListeners.delete(fn);
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
    this.stopRetrying();
    this.stopWatching();
    this.socket?.close();
  }

  private stopRetrying(): void {
    if (this.retry !== null) clearTimeout(this.retry);
    this.retry = null;
  }

  private stopWatching(): void {
    this.watched = null;
    if (this.watchAgain !== null) clearInterval(this.watchAgain);
    this.watchAgain = null;
  }

  /** Over for good: nothing is tried again. */
  private fail(error: SessionError): void {
    this.stopRetrying();
    this.stopWatching();
    this.update({ status: 'failed', error });
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
        this.tokens.set(this.code, msg.token);
        this.away = null;
        this.update({ status: 'joined', you: msg.you });
        if (this.watched !== null) this.send({ type: 'watch', target: this.watched });
        break;
      case 'lobby': {
        const names = new Map(this.current.names);
        for (const p of msg.players) names.set(p.id, p.name);
        this.update({ players: msg.players, phase: msg.phase, round: msg.round, names });
        break;
      }
      case 'countdown': {
        const names = new Map(this.current.names);
        for (const r of msg.runners) names.set(r.id, r.name);
        // The round already held keeps its object, so a race that comes back after a drop does not start again.
        const held = this.current.countdown;
        const same = held !== null && held.round === msg.round && held.seed === msg.seed && held.startAt === msg.startAt;
        this.update({ countdown: same ? held : { round: msg.round, seed: msg.seed, startAt: msg.startAt }, names });
        this.pingBurst();
        break;
      }
      case 'watching':
        this.update({ watching: msg.pairs });
        break;
      case 'relay':
        for (const fn of this.relayListeners) fn(msg.id, msg.state);
        break;
      case 'tower':
        this.update({ tower: msg.rows });
        break;
      case 'end':
        this.stopWatching(); // the lobby has forgotten who watched whom
        this.update({ end: { round: msg.round, results: msg.results } });
        break;
      case 'pong':
        if (msg.c !== this.pingOut) break;
        this.clock.add({ sent: msg.c, received: this.now(), server: msg.s });
        this.pingOut = null;
        if (this.pingsLeft > 0) this.ping();
        break;
      case 'error':
        if (msg.code === 'LOBBY_NOT_FOUND' || msg.code === 'LOBBY_FULL' || msg.code === 'VERSION_MISMATCH') {
          this.fail(msg.code);
        } else if (msg.code === 'REPLACED') {
          this.fail('CONNECTION_LOST'); // another tab has the seat: trying again would take it back, and so on
        }
        break;
    }
  }

  private closed(): void {
    if (this.done || this.current.status === 'failed') return;
    if (this.current.you === null) {
      this.fail('CANT_CONNECT');
      return;
    }
    if (this.away === null) {
      const { phase } = this.current;
      this.away = { at: this.now(), inRound: phase === 'countdown' || phase === 'playing' };
      this.update({ status: 'reconnecting' });
    }
    this.tryAgainLater();
  }

  /** A new socket RETRY_MS from now while there is time left, by the clock; CONNECTION LOST once there is none. */
  private tryAgainLater(): void {
    if (this.timeUp()) {
      this.fail('CONNECTION_LOST');
      return;
    }
    this.retry = setTimeout(() => {
      this.retry = null;
      if (this.timeUp()) this.fail('CONNECTION_LOST');
      else this.connect();
    }, RETRY_MS);
  }

  private timeUp(): boolean {
    if (this.away === null) return false;
    return this.now() - this.away.at >= (this.away.inRound ? ROUND_RETRY_MS : LOBBY_RETRY_MS);
  }
}
