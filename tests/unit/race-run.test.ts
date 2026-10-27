import { beforeEach, expect, it, vi } from 'vitest';
import type { RunState } from '../../shared/lobby/protocol';
import { STEP_MS, TREX_X } from '../../shared/sim/constants';
import { NO_INPUT, createWorld, skipSteps, stepWorld } from '../../shared/sim/world';
import { InputState } from '../../src/game/input-state';
import { RaceRun } from '../../src/game/race-run';
import { readNumber, setStorageForTests } from '../../src/game/storage';
import { NO_TEST_MODE } from '../../src/game/test-mode';
import type { TestMode } from '../../src/game/test-mode';
import { callsOf } from './helpers/fake-ctx';
import { fakeDc } from './helpers/fake-dc';
import { memoryStorage } from './helpers/fake-storage';

const START = 10_000;
const SEED = 7;

// Writes down what it plays. A class, as the real Sound is, so a play() called without its object fails here too.
class FakeSound {
  readonly played: string[] = [];
  play(name: string): void {
    this.played.push(name);
  }
}

// A race on seed 7 that starts at 10 s by the fake server clock, with what it plays and sends written down.
function setUp(test: Partial<TestMode> = {}, o: { coarse?: boolean } = {}) {
  const sound = new FakeSound();
  const states: RunState[] = [];
  const deaths: number[] = [];
  const run = new RaceRun({
    seed: SEED,
    you: 'p2',
    startAt: START,
    sound,
    testMode: { ...NO_TEST_MODE, ...test },
    coarse: o.coarse ?? false,
    hi: 0,
    send: { state: (s) => states.push(s), dead: (d) => deaths.push(d) },
    rand: () => 0.5,
  });
  return { run, input: new InputState(), played: sound.played, states, deaths };
}

/** Frame times 60 a second by the server's clock, from `from` to `to`, both included. */
const frameTimes = (from: number, to: number): number[] =>
  Array.from({ length: Math.round((to - from) / STEP_MS) + 1 }, (_, i) => from + i * STEP_MS);

/** Frames 60 a second from `from` until `done`, for at most `ms`; a run that never gets there fails the test. */
function frameUntil(run: RaceRun, input: InputState, from: number, done: () => boolean, ms: number): number {
  let t = from;
  for (let i = 0; !done() && i * STEP_MS <= ms; i++) {
    t = from + i * STEP_MS;
    run.frame(t, input);
  }
  expect(done()).toBe(true);
  return t;
}

// What GAME OVER draws from the 1x sheet: its text at source (655, 15), and the restart button, 36 wide at source y 68.
function gameOverParts(run: RaceRun) {
  const { dc, calls } = fakeDc(1, 1, 40);
  run.scene.draw(dc, run.world, run.hi);
  const images = callsOf(calls, 'drawImage');
  return {
    text: images.some((c) => c[1] === 655 && c[2] === 15),
    button: images.some((c) => c[2] === 68 && c[3] === 36),
  };
}

beforeEach(() => {
  setStorageForTests(memoryStorage());
});

it('counts down 3, 2, 1 with one beep each, and runs nothing yet', () => {
  const { run, input, played, states } = setUp();
  const counts: (number | null)[] = [];
  for (const t of [6_500, 7_000, 7_500, 8_000, 9_000, 9_999]) {
    run.frame(t, input);
    counts.push(run.view().count);
  }
  expect(counts).toEqual([null, 3, 3, 2, 1, 1]);
  expect(played).toEqual(['countdown', 'countdown', 'countdown']);
  expect(run.view()).toEqual({ phase: 'countdown', count: 1, inverted: false, hints: false });
  // The dino waits where it will run from, and the round has not begun.
  expect(run.world).toMatchObject({ phase: 'waiting', step: 0, distance: 0 });
  expect(run.world.trex.x).toBe(TREX_X);
  expect(states).toEqual([]);
});

it('keeps the waiting dino blinking through the countdown: a scene step a 60 Hz step, 15 at most', () => {
  const { run, input } = setUp();
  const step = vi.spyOn(run.scene, 'step');
  run.frame(6_500, input);
  run.frame(7_000, input); // 30 steps on: 15 of them
  run.frame(7_000 + STEP_MS, input);
  expect(step).toHaveBeenCalledTimes(16);
  expect(step.mock.calls.every(([w]) => w.phase === 'waiting')).toBe(true);
});

it('throws away what is pressed during the countdown', () => {
  const { run, input } = setUp();
  run.frame(9_400, input);
  input.keyDown('Space', false);
  run.frame(9_500, input);
  input.keyUp('Space');
  run.frame(10_100, input);
  expect(run.world).toMatchObject({ phase: 'running', step: 6 });
  expect(run.world.trex.jumping).toBe(false);
  // Once the round runs, a press jumps.
  input.keyDown('Space', false);
  run.frame(10_200, input);
  expect(run.world.trex.jumping).toBe(true);
});

it('starts at startAt on the round seed and sends the run 10 times a second', () => {
  const { run, input, states } = setUp();
  run.frame(9_990, input);
  expect(run.view().phase).toBe('countdown');
  for (const t of frameTimes(START, START + 1000)) run.frame(t, input);
  expect(run.view()).toEqual({ phase: 'running', count: null, inverted: false, hints: false });
  expect(run.world).toMatchObject({ phase: 'running', seed: SEED, playerId: 'p2', step: 60 });
  const ref = createWorld({ seed: SEED, playerId: 'p2', phase: 'running' });
  for (let i = 0; i < 60; i++) stepWorld(ref, NO_INPUT);
  expect(run.world.distance).toBe(ref.distance);
  expect(states.map((s) => s.t)).toEqual([100, 200, 300, 400, 500, 600, 700, 800, 900, 1000]);
  expect(states.at(-1)!.d).toBe(run.world.distance);
});

it('drops the time a hidden tab was away, and what was held in it', () => {
  const { run, input, states } = setUp();
  run.frame(START, input);
  input.keyDown('Space', false);
  run.frame(START + 2000, input);
  // 120 steps are due: 105 are skipped and 15 run, with nothing pressed.
  const ref = createWorld({ seed: SEED, playerId: 'p2', phase: 'running' });
  skipSteps(ref, 105);
  for (let i = 0; i < 15; i++) stepWorld(ref, NO_INPUT);
  expect(run.world.step).toBe(120);
  expect(run.world.distance).toBe(ref.distance);
  expect(run.world.distance).toBeLessThan(16 * 7);
  expect(run.world.trex.jumping).toBe(false);
  expect(states.map((s) => s.t)).toEqual([2000]);
});

it('sends the death once and keeps GAME OVER without a restart button', () => {
  const { run, input, played, states, deaths } = setUp();
  const last = frameUntil(run, input, START, () => run.view().phase === 'dead', 60_000);
  expect(run.world.phase).toBe('dead');
  expect(deaths).toEqual([run.world.distance]);
  expect(played.at(-1)).toBe('hit');
  expect(run.hi).toBe(run.world.score);
  expect(readNumber('dwf.hi', -1)).toBe(run.world.score);
  const sent = states.length;
  const { step } = run.world;
  for (const t of frameTimes(last + STEP_MS, last + 2000)) run.frame(t, input);
  expect(states).toHaveLength(sent);
  expect(deaths).toHaveLength(1);
  expect(run.world.step).toBe(step);
  expect(gameOverParts(run)).toEqual({ text: true, button: false });
});

it('sends a last state with no hearts left, then the death', () => {
  const { run, input, states, deaths } = setUp(); // nobody jumps: hit after hit until the last heart is gone
  frameUntil(run, input, START, () => deaths.length === 1, 120_000);
  const last = states.at(-1)!;
  expect(last.hp).toBe(0); // only the state sent at the death has no hearts
  expect(last.t).toBe(Math.round(run.world.step * STEP_MS));
  expect(last.hit!.step).toBe(run.world.step);
  expect(deaths[0]).toBe(last.d);
});

it('stops when the server says this player is out', () => {
  const { run, input, deaths } = setUp();
  for (const t of frameTimes(START, START + 1000)) run.frame(t, input);
  run.serverDead();
  expect(run.view().phase).toBe('dead');
  expect(run.world.phase).toBe('dead');
  run.frame(START + 1100, input);
  expect(run.world.step).toBe(60);
  expect(deaths).toEqual([]);
  expect(run.hi).toBe(run.world.score);
  expect(readNumber('dwf.hi', -1)).toBe(run.world.score);
  expect(gameOverParts(run)).toEqual({ text: true, button: false });
});

it('stops at the end of the round and keeps the score as HI', () => {
  const { run, input, states } = setUp();
  for (const t of frameTimes(START, START + 1000)) run.frame(t, input);
  expect(run.world.score).toBeGreaterThan(0);
  run.end();
  expect(run.view().phase).toBe('over');
  run.frame(START + 2000, input);
  expect(run.world.step).toBe(60);
  expect(states).toHaveLength(10);
  expect(run.hi).toBe(run.world.score);
  expect(readNumber('dwf.hi', -1)).toBe(run.world.score);
});

it('shows the touch areas through the countdown and the first 3 s of the round, on a touch screen', () => {
  const { run, input } = setUp({}, { coarse: true });
  run.frame(8_000, input);
  expect(run.view().hints).toBe(true);
  for (const t of frameTimes(START, START + 2990)) run.frame(t, input);
  expect(run.world.step).toBe(179);
  expect(run.view().hints).toBe(true);
  run.frame(START + 3000, input);
  expect(run.view().hints).toBe(false);
});

it('lets the bot play in the dev test mode', () => {
  const { run, input, played } = setUp({ autopilot: true });
  frameUntil(run, input, START, () => run.world.trex.jumping, 20_000);
  expect(played).toContain('press');
});
