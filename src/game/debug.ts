import { boxDigest, courseDigest } from '../../shared/sim/digest';
import { skillRemaining } from '../../shared/sim/world';
import type { Phase, World } from '../../shared/sim/world';

// window.__dwf: what the end-to-end tests read from the page in the dev build. Nothing here runs in production.

/** What the game on the screen shows the tests: the solo round now, the title's demo later. */
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
}

export interface DebugState extends GameDebug {
  screen: string;
  hi: number;
  muted: boolean;
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

/** The state of the game on the screen, or nothing when none runs. */
export function gameDebug(): GameDebug {
  return current?.() ?? NO_GAME;
}

/** Everything window.__dwf holds, on the given screen. */
export function debugState(screen: string, hi: number, muted: boolean): DebugState {
  return { screen, ...gameDebug(), hi, muted, courseDigest, boxDigest };
}

/** Puts window.__dwf on the page, read fresh from `get` on every access, in the dev build only. Returns its removal. */
export function installDebugHook(get: () => DebugState): () => void {
  if (!import.meta.env.DEV) return () => {};
  Object.defineProperty(window, '__dwf', { configurable: true, get });
  return () => {
    delete window.__dwf;
  };
}
