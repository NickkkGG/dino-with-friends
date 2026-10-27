import { boxDigest, courseDigest } from '../../shared/sim/digest';
import { skillRemaining } from '../../shared/sim/world';
import type { LobbyPhase } from '../../shared/lobby/protocol';
import type { Phase, World } from '../../shared/sim/world';
import type { SessionView } from '../net/session';
import type { RaceView } from './race-run';

// window.__dwf: what the end-to-end tests read from the page in the dev build. Nothing here runs in production.

/** What the game on the screen shows the tests: the solo round, the title's demo or a race. */
export interface GameDebug {
  phase: Phase | null;
  step: number;
  score: number;
  hp: number;
  trex: { x: number; y: number; jumping: boolean; ducking: boolean } | null;
  night: number;
  /** The steps left of each timed skill. */
  skills: { doubleJump: number; ghost: number; speed: number } | null;
  canvas: { width: number; height: number; cssWidth: number; k: number; sprite: 1 | 2 } | null;
  /** A race on the screen: its phase and countdown, when it starts and the server's clock now. */
  race?: { phase: RaceView['phase']; count: RaceView['count']; startAt: number; serverNow: number };
  /** Another runner's screen, watched: whose, and how far its ground has scrolled. */
  watch?: { target: string; scroll: number };
}

/** The lobby this page is in, as the tests see it. */
export interface LobbyDebug {
  status: SessionView['status'];
  code: string;
  you: string | null;
  phase: LobbyPhase;
  round: number;
  players: number;
  /** Whether this player is the host. */
  host: boolean;
}

export interface DebugState extends GameDebug {
  screen: string;
  hi: number;
  muted: boolean;
  /** This page's build, which a hello to the lobby server must carry. */
  version: string;
  lobby: LobbyDebug | null;
  courseDigest(seed: number, n: number): string;
  boxDigest(seed: number, playerId: string, n: number): string;
}

declare global {
  interface Window {
    __dwf?: DebugState;
  }
}

const NO_GAME: Readonly<GameDebug> = Object.freeze({
  phase: null, step: 0, score: 0, hp: 0, trex: null, night: 0, skills: null, canvas: null,
});

let current: (() => GameDebug) | null = null;
let lobby: (() => LobbyDebug) | null = null;

/** What a world shows the tests, all but the canvas. */
export function worldDebug(w: World): Omit<GameDebug, 'canvas'> & { skills: NonNullable<GameDebug['skills']> } {
  const { x, y, jumping, ducking } = w.trex;
  const skills = {
    doubleJump: skillRemaining(w, 'doubleJump'), ghost: skillRemaining(w, 'ghost'), speed: skillRemaining(w, 'speed'),
  };
  return { phase: w.phase, step: w.step, score: w.score, hp: w.hp, trex: { x, y, jumping, ducking }, night: w.night, skills };
}

/** The game that starts running reports here. The function it gets back stops the report, if it is still this one. */
export function reportGame(f: () => GameDebug): () => void {
  current = f;
  return () => {
    if (current === f) current = null;
  };
}

/** The lobby the page has joined reports here. The function it gets back stops the report, if it is still this one. */
export function reportLobby(f: () => LobbyDebug): () => void {
  lobby = f;
  return () => {
    if (lobby === f) lobby = null;
  };
}

/** The state of the game on the screen, or nothing when none runs. */
export function gameDebug(): GameDebug {
  return current?.() ?? NO_GAME;
}

/** Everything window.__dwf holds, on the given screen. */
export function debugState(screen: string, hi: number, muted: boolean): DebugState {
  return { screen, ...gameDebug(), hi, muted, version: __BUILD_VERSION__, lobby: lobby?.() ?? null, courseDigest, boxDigest };
}

/** Puts window.__dwf on the page, read fresh from `get` on every access, in the dev build only. Returns its removal. */
export function installDebugHook(get: () => DebugState): () => void {
  if (!import.meta.env.DEV) return () => {};
  Object.defineProperty(window, '__dwf', { configurable: true, get });
  return () => {
    delete window.__dwf;
  };
}
