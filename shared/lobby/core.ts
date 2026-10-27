import { HP_START } from '../sim/constants';
import { scoreOf } from '../sim/timeline';
import { cleanName, uniqueName } from './name';
import type { ClientMessage, LobbyPhase, LobbyPlayer, ResultRow, ServerMessage } from './protocol';
import { rankStandings } from './standings';

/** The most players a lobby holds, watching or not. */
export const MAX_PLAYERS = 8;

/** The fewest players a round can start with. */
export const MIN_PLAYERS = 2;

/** From START to the first step of the round. */
export const COUNTDOWN_MS = 3500;

/** How long the results stay up before the lobby is back. */
export const RESULTS_MS = 5000;

/** The least time between two leaderboards sent because of states. */
export const TOWER_MS = 250;

/** How long a runner may go without sending a state before they are out. */
export const STALE_MS = 10_000;

/** What can happen to a lobby: a message, a message that could not be read, a connection closing, or its alarm. */
export type LobbyEvent =
  | { kind: 'message'; conn: string; msg: ClientMessage }
  | { kind: 'bad'; conn: string }
  | { kind: 'close'; conn: string }
  | { kind: 'alarm' };

/** A message for one connection. */
export interface Send {
  to: string;
  msg: ServerMessage;
}

/** What an event leads to: the messages to send, the connections to close, and when to wake next (null: no need). */
export interface LobbyStep {
  send: Send[];
  close: string[];
  wakeAt: number | null;
}

export interface SavedPlayer {
  id: string;
  conn: string;
  name: string;
  joinOrder: number;
  host: boolean;
  playing: boolean;
}

/** A player in the round, under the name they had at START. */
export interface SavedRunner {
  id: string;
  name: string;
  joinOrder: number;
  alive: boolean;
  diedAt: number | null;
  d: number;
  hp: number;
}

/** Everything a lobby keeps in storage, to come back the same after it has slept. */
export interface SavedLobby {
  code: string;
  nextJoin: number;
  round: number;
  phase: LobbyPhase;
  seed: number;
  startAt: number;
  endsAt: number;
  players: SavedPlayer[];
  runners: SavedRunner[];
  results: ResultRow[];
}

/** A runner as the round keeps them: what is saved, plus the round time of their last state and when it came. */
interface Runner extends SavedRunner {
  t: number;
  lastStateAt: number;
}

/**
 * The rules of one lobby, without sockets, storage or a clock of its own: each event comes in with the time it
 * happened, and what to send, what to close and when to wake come out.
 */
export class LobbyCore {
  readonly code: string;
  private readonly seeds: () => number;
  private nextJoin = 1;
  private round = 0;
  private phase: LobbyPhase = 'lobby';
  private seed = 0;
  private startAt = 0;
  private endsAt = 0;
  // In the order they came in, so the first is always the one who came in earliest.
  private players: SavedPlayer[] = [];
  private runners: Runner[] = [];
  private results: ResultRow[] = [];
  private dirty = false;
  private out: Send[] = [];
  private toClose: string[] = [];

  /** `seeds` gives a random 32-bit whole number for each round's seed. */
  constructor(code: string, seeds: () => number) {
    this.code = code;
    this.seeds = seeds;
  }

  /** The lobby `saved` was taken from, woken at `now`. */
  static restore(saved: SavedLobby, seeds: () => number, now: number): LobbyCore {
    const core = new LobbyCore(saved.code, seeds);
    core.nextJoin = saved.nextJoin;
    core.round = saved.round;
    core.phase = saved.phase;
    core.seed = saved.seed;
    core.startAt = saved.startAt;
    core.endsAt = saved.endsAt;
    core.players = saved.players.map((p) => ({ ...p }));
    core.runners = saved.runners.map((r) => ({ ...r, t: 0, lastStateAt: Math.max(now, saved.startAt) }));
    core.results = saved.results.map((r) => ({ ...r }));
    return core;
  }

  handle(ev: LobbyEvent, now: number): LobbyStep {
    this.out = [];
    this.toClose = [];
    switch (ev.kind) {
      case 'message':
        this.onMessage(ev.conn, ev.msg, now);
        break;
      case 'bad':
        this.sendTo(ev.conn, { type: 'error', code: 'BAD_MESSAGE' });
        break;
      case 'close':
        this.remove(ev.conn);
        break;
      case 'alarm':
        this.onAlarm(now);
        break;
    }
    return { send: this.out, close: this.toClose, wakeAt: this.phase === 'countdown' ? this.startAt : null };
  }

  saved(): SavedLobby {
    return {
      code: this.code,
      nextJoin: this.nextJoin,
      round: this.round,
      phase: this.phase,
      seed: this.seed,
      startAt: this.startAt,
      endsAt: this.endsAt,
      players: this.players.map((p) => ({ ...p })),
      runners: this.runners.map(({ id, name, joinOrder, alive, diedAt, d, hp }) => ({
        id,
        name,
        joinOrder,
        alive,
        diedAt,
        d,
        hp,
      })),
      results: this.results.map((r) => ({ ...r })),
    };
  }

  /** Whether saved() has changed since the last call. */
  takeDirty(): boolean {
    const changed = this.dirty;
    this.dirty = false;
    return changed;
  }

  private onMessage(conn: string, msg: ClientMessage, now: number): void {
    switch (msg.type) {
      case 'ping':
        this.sendTo(conn, { type: 'pong', c: msg.c, s: now });
        break;
      case 'hello':
        this.join(conn, msg.name);
        break;
      case 'leave':
        this.toClose.push(conn);
        this.remove(conn);
        break;
      case 'start':
        this.start(conn, now);
        break;
      case 'state':
      case 'dead':
        break;
    }
  }

  private join(conn: string, name: string): void {
    if (this.playerOn(conn)) return;
    const clean = cleanName(name);
    if (clean === '') {
      this.sendTo(conn, { type: 'error', code: 'BAD_MESSAGE' });
      return;
    }
    if (this.players.length >= MAX_PLAYERS) {
      this.sendTo(conn, { type: 'error', code: 'LOBBY_FULL' });
      this.toClose.push(conn);
      return;
    }
    const joinOrder = this.nextJoin++;
    const player: SavedPlayer = {
      id: `p${joinOrder}`,
      conn,
      name: uniqueName(clean, this.players.map((p) => p.name)),
      joinOrder,
      host: !this.players.some((p) => p.host),
      playing: false,
    };
    this.players.push(player);
    this.dirty = true;
    this.sendTo(conn, { type: 'welcome', you: player.id, code: this.code });
    this.sendLobby();
    if (this.phase !== 'lobby') this.sendTo(conn, this.tower());
  }

  private remove(conn: string): void {
    const gone = this.playerOn(conn);
    if (!gone) return;
    this.players = this.players.filter((p) => p !== gone);
    const next = this.players[0];
    if (gone.host && next) next.host = true;
    this.dirty = true;
    this.sendLobby();
  }

  private start(conn: string, now: number): void {
    const player = this.playerOn(conn);
    if (!player) return;
    if (!player.host) {
      this.sendTo(conn, { type: 'error', code: 'NOT_HOST' });
      return;
    }
    if (this.phase !== 'lobby' || this.players.length < MIN_PLAYERS) return;
    this.round += 1;
    this.seed = this.seeds() >>> 0;
    this.startAt = now + COUNTDOWN_MS;
    this.phase = 'countdown';
    for (const p of this.players) p.playing = true;
    this.runners = this.players.map((p) => ({
      id: p.id,
      name: p.name,
      joinOrder: p.joinOrder,
      alive: true,
      diedAt: null,
      d: 0,
      hp: HP_START,
      t: 0,
      lastStateAt: this.startAt,
    }));
    this.dirty = true;
    this.broadcast({ type: 'countdown', round: this.round, seed: this.seed, startAt: this.startAt });
    this.sendLobby();
    this.broadcast(this.tower());
  }

  private onAlarm(now: number): void {
    if (this.phase === 'countdown' && now >= this.startAt) {
      this.phase = 'playing';
      this.dirty = true;
      this.sendLobby();
    }
  }

  private playerOn(conn: string): SavedPlayer | undefined {
    return this.players.find((p) => p.conn === conn);
  }

  private tower(): ServerMessage {
    const ranked = rankStandings(this.runners.map((r) => ({ ...r, score: scoreOf(r.d) })));
    return { type: 'tower', rows: ranked.map(({ id, score, hp, alive }) => ({ id, score, hp, alive })) };
  }

  private sendLobby(): void {
    // A player whose socket closes leaves, so everyone still on the list is connected.
    const players: LobbyPlayer[] = this.players.map(({ id, name, host, playing }) => ({
      id,
      name,
      host,
      connected: true,
      playing,
    }));
    this.broadcast({ type: 'lobby', players, phase: this.phase, round: this.round });
  }

  private broadcast(msg: ServerMessage): void {
    for (const p of this.players) this.out.push({ to: p.conn, msg });
  }

  private sendTo(conn: string, msg: ServerMessage): void {
    this.out.push({ to: conn, msg });
  }
}
