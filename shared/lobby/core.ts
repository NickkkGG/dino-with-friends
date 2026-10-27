import { HP_START } from '../sim/constants';
import { scoreOf } from '../sim/timeline';
import { cleanName, uniqueName } from './name';
import type { ClientMessage, LobbyPhase, LobbyPlayer, ResultRow, RunState, ServerMessage } from './protocol';
import { clampRun, rankStandings, roundOver } from './standings';

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

/** How long a seat whose connection dropped is kept. */
export const SEAT_MS = 120_000;

/** How long a lobby with nobody connected lives. */
export const EMPTY_MS = 600_000;

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

/**
 * What an event leads to: the messages to send, the connections to close, and when to wake next (null: no need); or,
 * when nobody has been connected for EMPTY_MS, that the lobby is gone.
 */
export interface LobbyStep {
  send: Send[];
  close: string[];
  wakeAt: number | null;
  expired: boolean;
}

/**
 * The alarm to set after a step, given the one set now (null: none): the step's wakeAt when that is sooner, and null
 * when the one set will do. An alarm only moves sooner, so a state, which pushes the soonest stale time a little later,
 * costs no write; one that goes off early does no harm, since the lobby goes by the clock on every alarm and says then
 * when to wake next.
 */
export function alarmToSet(set: number | null, wakeAt: number | null): number | null {
  return wakeAt !== null && (set === null || wakeAt < set) ? wakeAt : null;
}

/** What a lobby is made with. */
export interface LobbyOptions {
  code: string;
  /** A random 32-bit whole number for each round's seed. */
  seeds: () => number;
  /** A new secret for each seat, which gives the seat back to a new connection. */
  tokens: () => string;
  /** The build this lobby runs: a hello from any other is turned away. */
  version: string;
  /** When the lobby is made. */
  now: number;
}

/** A seat in the lobby. It outlives its connection: a player whose socket drops comes back to it with its token. */
export interface SavedPlayer {
  id: string;
  conn: string;
  name: string;
  joinOrder: number;
  host: boolean;
  playing: boolean;
  token: string;
  connected: boolean;
  /** When the connection dropped; null while it is open. */
  awaySince: number | null;
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
  /** Since when nobody has been connected; null while someone is. */
  emptySince: number | null;
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
  private readonly tokens: () => string;
  private readonly version: string;
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
  private emptySince: number | null;
  // A new lobby has to be saved: it is a lobby from now on.
  private dirty = true;
  private lastTowerAt = -Infinity;
  private towerDue = false;
  private out: Send[] = [];
  private toClose: string[] = [];

  constructor(o: LobbyOptions) {
    this.code = o.code;
    this.seeds = o.seeds;
    this.tokens = o.tokens;
    this.version = o.version;
    this.emptySince = o.now;
  }

  /**
   * The lobby `saved` was taken from, woken at `now`. `open`: the connections whose sockets are still open; every
   * other seat is away from `now` on, unless it was away already.
   */
  static restore(saved: SavedLobby, o: Omit<LobbyOptions, 'code' | 'now'>, now: number, open: ReadonlySet<string>): LobbyCore {
    const core = new LobbyCore({ ...o, code: saved.code, now });
    core.dirty = false;
    core.nextJoin = saved.nextJoin;
    core.round = saved.round;
    core.phase = saved.phase;
    core.seed = saved.seed;
    core.startAt = saved.startAt;
    core.endsAt = saved.endsAt;
    core.players = saved.players.map((p) => {
      // A seat saved by the build before seats had tokens has none: it is away from now on, and cannot be taken back.
      if (typeof p.connected !== 'boolean') {
        core.dirty = true;
        return { ...p, token: '', connected: false, awaySince: now };
      }
      if (open.has(p.conn) || !p.connected) return { ...p };
      core.dirty = true;
      return { ...p, connected: false, awaySince: now };
    });
    core.runners = saved.runners.map((r) => ({ ...r, t: 0, lastStateAt: Math.max(now, saved.startAt) }));
    core.results = saved.results.map((r) => ({ ...r }));
    core.emptySince = saved.emptySince ?? (core.players.some((p) => p.connected) ? null : now);
    if (core.emptySince !== saved.emptySince) core.dirty = true;
    return core;
  }

  handle(ev: LobbyEvent, now: number): LobbyStep {
    this.out = [];
    this.toClose = [];
    this.towerDue = false;
    this.freeSeats(now);
    switch (ev.kind) {
      case 'message':
        this.onMessage(ev.conn, ev.msg, now);
        break;
      case 'bad':
        this.sendTo(ev.conn, { type: 'error', code: 'BAD_MESSAGE' });
        break;
      case 'close':
        this.drop(ev.conn, now);
        break;
      case 'alarm':
        this.onAlarm(now);
        break;
    }
    if (this.phase === 'playing') this.dropStale(now);
    if (this.towerDue) this.sendTower(now);
    if (this.inRound() && roundOver(this.standings())) this.finish(now);
    this.noteEmpty(now);
    if (ev.kind === 'alarm' && this.emptySince !== null && now - this.emptySince >= EMPTY_MS) {
      return { send: [], close: [], wakeAt: null, expired: true };
    }
    return { send: this.out, close: this.toClose, wakeAt: this.wakeAt(), expired: false };
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
      emptySince: this.emptySince,
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
        this.join(conn, msg);
        break;
      case 'leave':
        this.toClose.push(conn);
        this.remove(conn, now);
        break;
      case 'start':
        this.start(conn, now);
        break;
      case 'state':
        this.onState(conn, msg, now);
        break;
      case 'dead':
        this.onDead(conn, msg.d, now);
        break;
    }
  }

  private join(conn: string, hello: Extract<ClientMessage, { type: 'hello' }>): void {
    if (this.playerOn(conn)) return;
    if (hello.v !== this.version) {
      this.sendTo(conn, { type: 'error', code: 'VERSION_MISMATCH' });
      this.toClose.push(conn);
      return;
    }
    const seat = hello.token === null ? undefined : this.players.find((p) => p.token === hello.token);
    if (seat) {
      this.takeBack(seat, conn);
      return;
    }
    const clean = cleanName(hello.name);
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
      token: this.tokens(),
      connected: true,
      awaySince: null,
    };
    this.players.push(player);
    this.dirty = true;
    this.welcome(player);
  }

  // A seat back on a new connection, by its token. A connection still open on it is told and closed: the tab came
  // back before its old socket's close got here, or a copy of the tab has taken the seat.
  private takeBack(seat: SavedPlayer, conn: string): void {
    if (seat.connected) {
      this.sendTo(seat.conn, { type: 'error', code: 'REPLACED' });
      this.toClose.push(seat.conn);
    }
    seat.conn = conn;
    seat.connected = true;
    seat.awaySince = null;
    this.dirty = true;
    this.welcome(seat);
  }

  /** What a player coming in is sent: the welcome, the lobby (to everyone), and the round on, if there is one. */
  private welcome(p: SavedPlayer): void {
    this.sendTo(p.conn, { type: 'welcome', you: p.id, token: p.token, code: this.code });
    this.sendLobby();
    if (this.inRound()) this.sendTo(p.conn, this.countdown());
    if (this.phase !== 'lobby') this.sendTo(p.conn, this.tower());
  }

  /** A connection that closed. Its seat stays, away, for its player to come back to, and so does a place in the round. */
  private drop(conn: string, now: number): void {
    const seat = this.playerOn(conn);
    if (!seat?.connected) return;
    seat.connected = false;
    seat.awaySince = now;
    this.dirty = true;
    this.sendLobby();
  }

  /** A player who leaves by LEAVE. */
  private remove(conn: string, now: number): void {
    const gone = this.playerOn(conn);
    if (gone) this.removeSeat(gone, now);
  }

  /** Seats away for SEAT_MS are freed, as by LEAVE. */
  private freeSeats(now: number): void {
    for (const seat of this.players.filter((p) => p.awaySince !== null && now - p.awaySince >= SEAT_MS)) {
      this.removeSeat(seat, now);
    }
  }

  /** A seat gone for good. One in the round is out with the distance they had, and stays on the board. */
  private removeSeat(gone: SavedPlayer, now: number): void {
    const runner = this.runners.find((r) => r.id === gone.id && r.alive);
    this.players = this.players.filter((p) => p !== gone);
    if (gone.host) this.handHost();
    this.dirty = true;
    this.sendLobby();
    if (runner && this.inRound()) this.knockOut(runner, now);
  }

  /** The host's seat is gone: the seat that came in earliest hosts now, the earliest connected one first. */
  private handHost(): void {
    const next = this.players.find((p) => p.connected) ?? this.players[0];
    if (next) next.host = true;
  }

  private start(conn: string, now: number): void {
    const player = this.playerOn(conn);
    if (!player) return;
    if (!player.host) {
      this.sendTo(conn, { type: 'error', code: 'NOT_HOST' });
      return;
    }
    // A seat whose player is away keeps its place in the lobby, but the round goes without it.
    const ready = this.players.filter((p) => p.connected);
    if (this.phase !== 'lobby' || ready.length < MIN_PLAYERS) return;
    this.round += 1;
    this.seed = this.seeds() >>> 0;
    this.startAt = now + COUNTDOWN_MS;
    this.phase = 'countdown';
    for (const p of this.players) p.playing = p.connected;
    this.runners = ready.map((p) => ({
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
    this.results = [];
    this.dirty = true;
    this.broadcast(this.countdown());
    this.sendLobby();
    this.sendTower(now);
  }

  private onState(conn: string, run: RunState, now: number): void {
    const runner = this.phase === 'playing' ? this.aliveRunnerOn(conn) : undefined;
    if (!runner) return;
    const { t, d } = clampRun(runner, run, now - this.startAt);
    runner.t = t;
    runner.d = d;
    runner.hp = run.hp;
    runner.lastStateAt = now;
    if (now - this.lastTowerAt >= TOWER_MS) this.towerDue = true;
  }

  /** A runner out of HP. The message has no round time of its own, so the distance is held to the round's. */
  private onDead(conn: string, d: number, now: number): void {
    const runner = this.phase === 'playing' ? this.aliveRunnerOn(conn) : undefined;
    if (!runner) return;
    const roundMs = now - this.startAt;
    runner.d = clampRun(runner, { t: roundMs, d }, roundMs).d;
    this.knockOut(runner, now);
  }

  /** Runners who have sent no state for STALE_MS are out with the distance they had. */
  private dropStale(now: number): void {
    for (const runner of this.runners) {
      if (runner.alive && now - runner.lastStateAt >= STALE_MS) this.knockOut(runner, now);
    }
  }

  private knockOut(runner: Runner, now: number): void {
    runner.alive = false;
    runner.hp = 0;
    runner.diedAt = now;
    this.dirty = true;
    this.towerDue = true;
  }

  private finish(now: number): void {
    this.phase = 'results';
    this.endsAt = now + RESULTS_MS;
    this.results = rankStandings(this.standings()).map(({ id, name, score }, i) => ({ id, name, score, place: i + 1 }));
    this.dirty = true;
    this.broadcast({ type: 'end', round: this.round, results: this.results });
    this.sendLobby();
  }

  private onAlarm(now: number): void {
    if (this.phase === 'countdown' && now >= this.startAt) {
      this.phase = 'playing';
      this.dirty = true;
      this.sendLobby();
    } else if (this.phase === 'results' && now >= this.endsAt) {
      this.phase = 'lobby';
      for (const p of this.players) p.playing = false;
      this.runners = [];
      this.dirty = true;
      this.sendLobby();
    }
  }

  /** Since when nobody has been connected: from when the last one connected dropped or left. */
  private noteEmpty(now: number): void {
    const since = this.players.some((p) => p.connected) ? null : (this.emptySince ?? now);
    if (since === this.emptySince) return;
    this.emptySince = since;
    this.dirty = true;
  }

  /** The soonest of the phase's own time, a seat to free and the lobby's end, if nobody is connected. */
  private wakeAt(): number | null {
    let soonest = this.phaseWakeAt();
    const sooner = (at: number) => {
      if (soonest === null || at < soonest) soonest = at;
    };
    for (const p of this.players) if (p.awaySince !== null) sooner(p.awaySince + SEAT_MS);
    if (this.emptySince !== null) sooner(this.emptySince + EMPTY_MS);
    return soonest;
  }

  private phaseWakeAt(): number | null {
    switch (this.phase) {
      case 'lobby':
        return null;
      case 'countdown':
        return this.startAt;
      case 'playing': {
        let soonest: number | null = null;
        for (const runner of this.runners) {
          const staleAt = runner.lastStateAt + STALE_MS;
          if (runner.alive && (soonest === null || staleAt < soonest)) soonest = staleAt;
        }
        return soonest;
      }
      case 'results':
        return this.endsAt;
    }
  }

  private inRound(): boolean {
    return this.phase === 'countdown' || this.phase === 'playing';
  }

  private playerOn(conn: string): SavedPlayer | undefined {
    return this.players.find((p) => p.conn === conn);
  }

  private aliveRunnerOn(conn: string): Runner | undefined {
    const player = this.playerOn(conn);
    return player && this.runners.find((r) => r.id === player.id && r.alive);
  }

  private standings(): (Runner & { score: number })[] {
    return this.runners.map((r) => ({ ...r, score: scoreOf(r.d) }));
  }

  private countdown(): ServerMessage {
    return { type: 'countdown', round: this.round, seed: this.seed, startAt: this.startAt };
  }

  private tower(): ServerMessage {
    const rows = rankStandings(this.standings()).map(({ id, score, hp, alive }) => ({ id, score, hp, alive }));
    return { type: 'tower', rows };
  }

  private sendTower(now: number): void {
    this.broadcast(this.tower());
    this.lastTowerAt = now;
  }

  private sendLobby(): void {
    const players: LobbyPlayer[] = this.players.map(({ id, name, host, connected, playing }) => ({
      id,
      name,
      host,
      connected,
      playing,
    }));
    this.broadcast({ type: 'lobby', players, phase: this.phase, round: this.round });
  }

  /** To every seat whose player is connected. */
  private broadcast(msg: ServerMessage): void {
    for (const p of this.players) if (p.connected) this.out.push({ to: p.conn, msg });
  }

  private sendTo(conn: string, msg: ServerMessage): void {
    this.out.push({ to: conn, msg });
  }
}
