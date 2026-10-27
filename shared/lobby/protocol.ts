import { HP_MAX } from '../sim/constants';

/** Where a lobby is: waiting for the host, counting down, racing, or showing the round's results. */
export type LobbyPhase = 'lobby' | 'countdown' | 'playing' | 'results';

/** What the dino is doing, for drawing it on someone else's screen. */
export type Pose = 'run' | 'duck' | 'jump';

export type ErrorCode = 'LOBBY_NOT_FOUND' | 'LOBBY_FULL' | 'VERSION_MISMATCH' | 'NOT_HOST' | 'BAD_MESSAGE';

/** The ms each skill has left. */
export interface Fx {
  doubleJump: number;
  ghost: number;
  speed: number;
}

/** A player's run, as the game sends it ten times a second. */
export interface RunState {
  /** Time into the round, in ms. */
  t: number;
  /** Distance run, in world px. */
  d: number;
  /** The top of the dino, in world px. */
  y: number;
  pose: Pose;
  hp: number;
  /** The ms left of being safe from hits. */
  hurt: number;
  fx: Fx;
  /** The number of the next box: every box before it was taken or passed. */
  got: number;
  /** The speed right now, in world px a step. */
  spd: number;
}

export type ClientMessage =
  | { type: 'hello'; name: string }
  | { type: 'start' }
  | ({ type: 'state' } & RunState)
  | { type: 'dead'; d: number }
  | { type: 'leave' }
  | { type: 'ping'; c: number };

export interface LobbyPlayer {
  id: string;
  name: string;
  host: boolean;
  connected: boolean;
  /** Whether the player is in the round being played: false in the lobby phase, and for whoever came in during it. */
  playing: boolean;
}

/** One line of the leaderboard while a round is on. */
export interface TowerRow {
  id: string;
  score: number;
  hp: number;
  alive: boolean;
}

export interface ResultRow {
  id: string;
  name: string;
  score: number;
  place: number;
}

export type ServerMessage =
  | { type: 'welcome'; you: string; code: string }
  | { type: 'lobby'; players: LobbyPlayer[]; phase: LobbyPhase; round: number }
  | { type: 'countdown'; round: number; seed: number; startAt: number }
  | { type: 'tower'; rows: TowerRow[] }
  | { type: 'end'; round: number; results: ResultRow[] }
  | { type: 'pong'; c: number; s: number }
  | { type: 'error'; code: ErrorCode };

/** The longest text a player may send; anything longer is not read at all. */
export const MAX_CLIENT_CHARS = 1024;

// What a player's message may hold. The name is cut to its real length later, when the lobby cleans it.
const HELLO_NAME_CHARS = 64;
const T_MAX = 3_600_000;
const D_MAX = 1e9;
const Y_LIMIT = 1000;
const HURT_MAX = 10_000;
const FX_MAX = 60_000;
const GOT_MAX = 10_000;
const SPD_MAX = 100;

type Fields = Record<string, unknown>;

/** A text read as a JSON object, or null when it is not one. */
function readObject(raw: unknown): Fields | null {
  if (typeof raw !== 'string') return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  return isObject(value) ? value : null;
}

function isObject(value: unknown): value is Fields {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function inRange(value: unknown, min: number, max: number): value is number {
  return isNumber(value) && value >= min && value <= max;
}

function isWhole(value: unknown, min: number, max: number): value is number {
  return inRange(value, min, max) && Number.isInteger(value);
}

/** A check for a union of strings, from an object that lists each of its members once. */
function oneOf<T extends string>(members: Record<T, true>): (value: unknown) => value is T {
  return (value): value is T => typeof value === 'string' && Object.hasOwn(members, value);
}

const isPhase = oneOf<LobbyPhase>({ lobby: true, countdown: true, playing: true, results: true });
const isPose = oneOf<Pose>({ run: true, duck: true, jump: true });
const isErrorCode = oneOf<ErrorCode>({
  LOBBY_NOT_FOUND: true,
  LOBBY_FULL: true,
  VERSION_MISMATCH: true,
  NOT_HOST: true,
  BAD_MESSAGE: true,
});

/** Every item of a list read by `read`, or null when it is not a list or any item is wrong. */
function readList<T>(value: unknown, read: (item: unknown) => T | null): T[] | null {
  if (!Array.isArray(value)) return null;
  const items: readonly unknown[] = value;
  const out: T[] = [];
  for (const item of items) {
    const row = read(item);
    if (row === null) return null;
    out.push(row);
  }
  return out;
}

function readRunState(m: Fields): ({ type: 'state' } & RunState) | null {
  const { t, d, y, pose, hp, hurt, fx, got, spd } = m;
  if (!isObject(fx)) return null;
  const { doubleJump, ghost, speed } = fx;
  if (
    !inRange(t, 0, T_MAX) ||
    !inRange(d, 0, D_MAX) ||
    !inRange(y, -Y_LIMIT, Y_LIMIT) ||
    !isPose(pose) ||
    !isWhole(hp, 0, HP_MAX) ||
    !inRange(hurt, 0, HURT_MAX) ||
    !inRange(doubleJump, 0, FX_MAX) ||
    !inRange(ghost, 0, FX_MAX) ||
    !inRange(speed, 0, FX_MAX) ||
    !isWhole(got, 0, GOT_MAX) ||
    !inRange(spd, 0, SPD_MAX)
  ) {
    return null;
  }
  return { type: 'state', t, d, y, pose, hp, hurt, fx: { doubleJump, ghost, speed }, got, spd };
}

/** A player's message, holding only its own fields, or null when it is anything else or out of bounds. */
export function parseClientMessage(raw: unknown): ClientMessage | null {
  if (typeof raw === 'string' && raw.length > MAX_CLIENT_CHARS) return null;
  const m = readObject(raw);
  if (m === null) return null;
  switch (m.type) {
    case 'hello': {
      const { name } = m;
      return typeof name === 'string' && name.length <= HELLO_NAME_CHARS ? { type: 'hello', name } : null;
    }
    case 'start':
      return { type: 'start' };
    case 'state':
      return readRunState(m);
    case 'dead': {
      const { d } = m;
      return inRange(d, 0, D_MAX) ? { type: 'dead', d } : null;
    }
    case 'leave':
      return { type: 'leave' };
    case 'ping': {
      const { c } = m;
      return isNumber(c) ? { type: 'ping', c } : null;
    }
    default:
      return null;
  }
}

function readPlayer(value: unknown): LobbyPlayer | null {
  if (!isObject(value)) return null;
  const { id, name, host, connected, playing } = value;
  return typeof id === 'string' &&
    typeof name === 'string' &&
    typeof host === 'boolean' &&
    typeof connected === 'boolean' &&
    typeof playing === 'boolean'
    ? { id, name, host, connected, playing }
    : null;
}

function readTowerRow(value: unknown): TowerRow | null {
  if (!isObject(value)) return null;
  const { id, score, hp, alive } = value;
  return typeof id === 'string' && isNumber(score) && isNumber(hp) && typeof alive === 'boolean'
    ? { id, score, hp, alive }
    : null;
}

function readResultRow(value: unknown): ResultRow | null {
  if (!isObject(value)) return null;
  const { id, name, score, place } = value;
  return typeof id === 'string' && typeof name === 'string' && isNumber(score) && isNumber(place)
    ? { id, name, score, place }
    : null;
}

/** A message from the lobby server, holding only its own fields, or null when it is anything else. */
export function parseServerMessage(raw: unknown): ServerMessage | null {
  const m = readObject(raw);
  if (m === null) return null;
  switch (m.type) {
    case 'welcome': {
      const { you, code } = m;
      return typeof you === 'string' && typeof code === 'string' ? { type: 'welcome', you, code } : null;
    }
    case 'lobby': {
      const { phase, round } = m;
      const players = readList(m.players, readPlayer);
      return players !== null && isPhase(phase) && isNumber(round) ? { type: 'lobby', players, phase, round } : null;
    }
    case 'countdown': {
      const { round, seed, startAt } = m;
      return isNumber(round) && isNumber(seed) && isNumber(startAt) ? { type: 'countdown', round, seed, startAt } : null;
    }
    case 'tower': {
      const rows = readList(m.rows, readTowerRow);
      return rows !== null ? { type: 'tower', rows } : null;
    }
    case 'end': {
      const { round } = m;
      const results = readList(m.results, readResultRow);
      return results !== null && isNumber(round) ? { type: 'end', round, results } : null;
    }
    case 'pong': {
      const { c, s } = m;
      return isNumber(c) && isNumber(s) ? { type: 'pong', c, s } : null;
    }
    case 'error': {
      const { code } = m;
      return isErrorCode(code) ? { type: 'error', code } : null;
    }
    default:
      return null;
  }
}
