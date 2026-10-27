import { expect, it } from 'vitest';
import { botInput, earliestSafe } from '../../shared/sim/autopilot';
import { NO_INPUT, createWorld, stepWorld } from '../../shared/sim/world';
import type { StepInput, World } from '../../shared/sim/world';
import { STATE_EVERY_STEPS, runState } from '../../src/game/run-state';

const solo = (): World => createWorld({ seed: 1, playerId: 'p1', boxes: false });
const steps = (w: World, n: number, input: StepInput = NO_INPUT) => {
  for (let i = 0; i < n; i++) stepWorld(w, input);
};

it('describes a new round', () => {
  expect(runState(createWorld({ seed: 1, playerId: 'p1' }))).toEqual({
    t: 0, d: 0, y: 93, pose: 'run', hp: 3, hurt: 0, fx: { doubleJump: 0, ghost: 0, speed: 0 }, got: 0, spd: 6,
    x: 0, first: 0, end: 0, birds: [], night: 0, airJumped: false, hit: null, skill: null,
  });
});

it('says where the ground, the obstacles in the world and the birds are', () => {
  const w = createWorld({ seed: 7, playerId: 'p1', invincible: true });
  for (let i = 0; i < 20_000 && w.drift.size === 0; i++) stepWorld(w, botInput(w, earliestSafe));
  const s = runState(w);
  expect(s.birds.length).toBeGreaterThan(0);
  expect([s.x, s.first, s.end]).toEqual([w.scroll, w.first, w.end]);
  expect(s.birds).toEqual([...w.drift].sort((a, b) => a[0] - b[0]));
});

it('gives the last hit and the last skill with their steps, the night and the air jump', () => {
  const w = solo();
  steps(w, 10);
  w.hitStep = 4;
  w.hitPoint = { x: 60.5, y: 101 };
  w.lastSkill = { id: 'speed', step: 7 };
  w.night = 12;
  w.trex.airJumpUsed = true;
  expect(runState(w)).toMatchObject({
    hit: { step: 4, x: 60.5, y: 101 }, skill: { id: 'speed', step: 7 }, night: 12, airJumped: true,
  });
});

it('sends ten states a second', () => {
  expect(STATE_EVERY_STEPS).toBe(6);
});

it('gives the round time in whole ms, and the distance and the next box as they are', () => {
  const w = solo();
  steps(w, 60);
  w.boxIndex = 4;
  const s = runState(w);
  expect(s.t).toBe(1000);
  expect(s.d).toBe(w.distance);
  expect(s.d).toBeGreaterThan(360);
  expect(s.got).toBe(4);
});

it('describes a jump and a duck', () => {
  const jumping = solo();
  stepWorld(jumping, { ...NO_INPUT, jumpPressed: true });
  steps(jumping, 5);
  expect(runState(jumping).pose).toBe('jump');
  expect(runState(jumping).y).toBe(jumping.trex.y);
  expect(runState(jumping).y).toBeLessThan(93);
  const ducking = solo();
  steps(ducking, 3, { ...NO_INPUT, duckHeld: true });
  expect(runState(ducking).pose).toBe('duck');
});

it('counts down the ms of being safe after a hit', () => {
  const w = solo();
  for (let i = 0; i < 5000 && w.hitStep === null; i++) stepWorld(w, NO_INPUT);
  expect(runState(w)).toMatchObject({ hp: 2, hurt: 1500 }); // 90 steps
  steps(w, 89);
  expect(runState(w).hurt).toBe(17); // the last safe step
  steps(w, 1);
  expect(runState(w).hurt).toBe(0);
});

it('gives the ms each skill has left, and the speed it gives', () => {
  const w = solo();
  steps(w, 10);
  const plain = runState(w).spd;
  w.skillUntil = { doubleJump: w.step + 600, ghost: w.step + 300, speed: w.step + 180 };
  const s = runState(w);
  expect(s.fx).toEqual({ doubleJump: 10_000, ghost: 5000, speed: 3000 });
  expect(s.spd).toBeCloseTo(plain * 1.5, 9);
});
