import { afterEach, expect, it, vi } from 'vitest';
import { courseDigest } from '../../shared/sim/digest';
import { NO_INPUT, createWorld, stepWorld } from '../../shared/sim/world';
import { debugState, gameDebug, installDebugHook, reportGame, worldDebug } from '../../src/game/debug';

const NO_GAME = { phase: null, step: 0, score: 0, hp: 0, trex: null, night: 0, skills: null, canvas: null };

afterEach(() => {
  vi.unstubAllGlobals();
});

it('worldDebug: what the tests read from a world', () => {
  const w = createWorld({ seed: 1, playerId: 'solo' });
  for (let i = 0; i < 10; i++) stepWorld(w, NO_INPUT);
  expect(worldDebug(w)).toEqual({
    phase: 'running',
    step: 10,
    score: w.score,
    hp: 3,
    trex: { x: w.trex.x, y: w.trex.y, jumping: false, ducking: false },
    night: 0,
    skills: { doubleJump: 0, ghost: 0, speed: 0 },
  });
  const ghost = createWorld({ seed: 1, playerId: 'solo', forcedSkill: 'ghost', invincible: true });
  while (worldDebug(ghost).skills.ghost === 0) stepWorld(ghost, NO_INPUT);
  expect(worldDebug(ghost).skills.ghost).toBe(300); // what is left of it, in steps
});

it('reports the game on the screen, and nulls once it is gone', () => {
  expect(gameDebug()).toEqual(NO_GAME);
  const a = { ...NO_GAME, phase: 'running' as const, step: 1 };
  const b = { ...NO_GAME, phase: 'waiting' as const, step: 2 };
  const stopA = reportGame(() => a);
  expect(gameDebug()).toBe(a);
  const stopB = reportGame(() => b);
  stopA(); // a game that has gone stops reporting, without silencing the one after it
  expect(gameDebug()).toBe(b);
  stopB();
  expect(gameDebug()).toEqual(NO_GAME);
});

it('installDebugHook puts a live window.__dwf on the page, and takes it away', () => {
  vi.stubGlobal('window', {});
  let step = 0;
  const remove = installDebugHook(() => ({ ...debugState('solo', 120, true), step: ++step }));
  expect(window.__dwf!.step).toBe(1);
  expect(window.__dwf!.step).toBe(2); // read fresh on every access
  expect(window.__dwf).toMatchObject({ screen: 'solo', hi: 120, muted: true, phase: null, canvas: null });
  expect(window.__dwf!.courseDigest(7, 300)).toBe(courseDigest(7, 300));
  remove();
  expect(window.__dwf).toBeUndefined();
});
