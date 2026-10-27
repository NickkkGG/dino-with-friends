import { expect, it } from 'vitest';
import { SKILL_STEPS, STEP_MS } from '../../shared/sim/constants';
import { NO_INPUT, createWorld, stepWorld } from '../../shared/sim/world';
import type { StepInput, World, WorldOptions } from '../../shared/sim/world';
import { TrexView } from '../../src/game/draw/trex-view';
import type { TrexPose } from '../../src/game/draw/trex-view';

const JUMP: StepInput = { ...NO_INPUT, jumpPressed: true };
const DUCK: StepInput = { ...NO_INPUT, duckHeld: true };

const world = (o: Partial<WorldOptions> = {}): World =>
  createWorld({ seed: 1, playerId: 'solo', invincible: true, boxes: false, ...o });

// Steps the world and the view together n times and gives the pose after each step.
function run(w: World, view: TrexView, n: number, input: StepInput = NO_INPUT): TrexPose[] {
  const poses: TrexPose[] = [];
  for (let i = 0; i < n; i++) {
    stepWorld(w, input);
    view.step(w);
    poses.push(view.pose(w));
  }
  return poses;
}

const repeat = <T,>(v: T, n: number): T[] => Array<T>(n).fill(v);

it('trex pose: running frames 88/132 switch every 5 steps; ducking 264/323 every 8 steps, 59 wide; jumping 0; dead 220', () => {
  const w = world();
  const view = new TrexView(() => 0.5);
  const running = run(w, view, 20);
  expect(running.map((p) => p.frame)).toEqual([...repeat(88, 5), ...repeat(132, 5), ...repeat(88, 5), ...repeat(132, 5)]);
  expect(running.every((p) => p.width === 44 && p.row === 'normal' && p.visible && !p.ghost)).toBe(true);
  expect(running[0]).toMatchObject({ x: w.trex.x, y: w.trex.y });

  const ducking = run(w, view, 24, DUCK);
  expect(ducking.map((p) => p.frame)).toEqual([...repeat(264, 8), ...repeat(323, 8), ...repeat(264, 8)]);
  expect(ducking.every((p) => p.width === 59)).toBe(true);

  run(w, view, 1); // a ducking dino cannot jump, so it lets go of ↓ first
  const jumping = run(w, view, 6, JUMP);
  expect(jumping.map((p) => [p.frame, p.width])).toEqual(repeat([0, 44], 6));
  expect(jumping.at(-1)!.y).toBe(w.trex.y);

  w.phase = 'dead';
  view.step(w);
  expect(view.pose(w)).toMatchObject({ frame: 220, width: 44, row: 'normal', x: w.trex.x });
});

it('trex pose: dead while ducking stands up one pixel to the right', () => {
  const w = world();
  const view = new TrexView(() => 0.5);
  run(w, view, 10, DUCK);
  w.phase = 'dead';
  view.step(w);
  expect(view.pose(w)).toMatchObject({ frame: 220, width: 44, x: w.trex.x + 1, y: w.trex.y });
});

it('trex pose: hurt row for 21 steps after a hit, then blinks every 6 steps until protection ends', () => {
  const w = world();
  const view = new TrexView(() => 0.5);
  run(w, view, 10);
  w.hitStep = w.step - 1; // as if the last step was a hit
  w.hp = 2;
  view.step(w);
  const poses = [view.pose(w), ...run(w, view, 99)]; // poses[s]: s steps since the hit
  poses.forEach((p, s) => {
    expect(p.row, `step ${s}`).toBe(s < 21 ? 'hurt' : 'normal');
    const visible = s < 21 || s >= 90 || Math.floor((s - 21) / 6) % 2 === 0;
    expect(p.visible, `step ${s}`).toBe(visible);
  });
});

it('trex pose: low row with one heart while running; ghost flag while GHOST, blinking in its last 60 steps', () => {
  const w = world();
  const view = new TrexView(() => 0.5);
  w.hp = 1;
  expect(run(w, view, 5).every((p) => p.row === 'low')).toBe(true);
  const waiting = world({ phase: 'waiting' });
  waiting.hp = 1;
  expect(run(waiting, new TrexView(() => 0.5), 5).every((p) => p.row === 'normal')).toBe(true); // only while running

  w.skillUntil.ghost = w.step + 200;
  const ghost = run(w, view, 210);
  ghost.forEach((p, i) => {
    const left = Math.max(0, 200 - 1 - i); // skillRemaining after the step
    expect(p.ghost, `left ${left}`).toBe(left > 0);
    expect(p.visible, `left ${left}`).toBe(left === 0 || left > 60 || Math.floor(left / 6) % 2 === 0);
  });
});

it('trex pose: the ghost look through the first 120 steps of SPEED too, blinking in the last 60 of them', () => {
  const w = world();
  const view = new TrexView(() => 0.5);
  w.skillUntil.speed = w.step + SKILL_STEPS.speed; // as a box picked up on the step before gives it
  const poses = run(w, view, 130);
  poses.forEach((p, i) => {
    const left = Math.max(0, 120 - 1 - i); // what is left of the safe start after the step
    expect(p.ghost, `left ${left}`).toBe(left > 0);
    expect(p.visible, `left ${left}`).toBe(left === 0 || left > 60 || Math.floor(left / 6) % 2 === 0);
  });
});

it('waiting dino blinks forever at random times up to 7 s', () => {
  // The step numbers on which the eyes close, over n steps of a waiting world.
  const blinks = (r: number, n: number): number[] => {
    const w = world({ phase: 'waiting' });
    const view = new TrexView(() => r);
    const poses = run(w, view, n);
    expect(poses[0]!.frame).toBe(0);
    expect(poses.every((p) => p.frame === 0 || p.frame === 44)).toBe(true);
    return poses.flatMap((p, i) => (p.frame === 44 && (i === 0 || poses[i - 1]!.frame !== 44) ? [i] : []));
  };
  const often = blinks(0.001, 3600); // a delay of 7 ms: the eyes close again every time the frame comes round
  expect(often.length).toBeGreaterThan(50); // the original stops after 3 blinks; this one never does
  const rare = blinks(0.999, 7200); // a delay of 6993 ms
  expect(rare.length).toBeGreaterThan(3);
  expect((rare[0]! + 1) * STEP_MS).toBeGreaterThanOrEqual(6993);
  for (let i = 1; i < rare.length; i++) expect((rare[i]! - rare[i - 1]!) * STEP_MS).toBeGreaterThanOrEqual(6993);
});
