import { beforeEach, expect, it, vi } from 'vitest';
import { CLEAR_STEPS, STEP_MS } from '../../shared/sim/constants';
import { NO_EVENTS, NO_INPUT } from '../../shared/sim/world';
import type { StepInput } from '../../shared/sim/world';
import type { InputFrame } from '../../src/game/input-state';
import { SoloRun } from '../../src/game/solo-run';
import { readNumber, setStorageForTests } from '../../src/game/storage';
import { NO_TEST_MODE } from '../../src/game/test-mode';
import type { TestMode } from '../../src/game/test-mode';
import { memoryStorage } from './helpers/fake-storage';

const NO_RESTART = { jumpKey: false, enter: false, pointer: false };
const frame = (step: Partial<StepInput> = {}, restart: Partial<InputFrame['restart']> = {}): InputFrame => ({
  step: { ...NO_INPUT, ...step },
  restart: { ...NO_RESTART, ...restart },
});
const IDLE = frame();
const JUMP = frame({ jumpPressed: true });

// Writes down what it plays. A class, as the real Sound is, so a play() called without its object fails here too.
class FakeSound {
  readonly played: string[] = [];
  play(name: string): void {
    this.played.push(name);
  }
}

// A run on seed 7 unless the test mode says otherwise, with its sounds written down.
function setUp(test: Partial<TestMode> = {}, o: { coarse?: boolean; hi?: number; seeds?: number[] } = {}) {
  const sound = new FakeSound();
  const { played } = sound;
  const seeds = [...(o.seeds ?? [])];
  const run = new SoloRun({
    sound,
    testMode: { ...NO_TEST_MODE, seed: 7, ...test },
    coarse: o.coarse ?? false,
    hi: o.hi ?? 0,
    newSeed: () => seeds.shift() ?? 99,
    rand: () => 0.5,
  });
  return { run, played };
}

// Steps with the same frame until `done`; a round that never gets there fails the test.
function until(run: SoloRun, done: () => boolean, f: InputFrame = IDLE, limit = 20000): void {
  for (let i = 0; i < limit && !done(); i++) run.step(f);
  expect(done()).toBe(true);
}

function die(run: SoloRun): void {
  if (run.world.phase === 'waiting') run.step(JUMP);
  until(run, () => run.world.phase === 'dead');
}

beforeEach(() => {
  setStorageForTests(memoryStorage());
});

it('waits for the first jump, then plays the intro and runs; touches jump anywhere only while waiting', () => {
  const { run, played } = setUp();
  expect(run.world.phase).toBe('waiting');
  expect(run.touchMode()).toBe('any');
  for (let i = 0; i < 30; i++) run.step(IDLE);
  expect(run.world.phase).toBe('waiting');
  expect(played).toEqual([]);
  run.step(JUMP);
  expect(played).toEqual(['press']);
  until(run, () => run.world.phase === 'intro');
  expect(run.touchMode()).toBe('split');
  until(run, () => run.world.phase === 'running');
  expect(run.view()).toEqual({ phase: 'running', inverted: false, hints: false, deadMs: 0 });
});

it('on a touch screen the touch areas show from the intro until CLEAR_STEPS', () => {
  const { run } = setUp({}, { coarse: true });
  expect(run.view().hints).toBe(false);
  run.step(JUMP);
  until(run, () => run.world.phase === 'intro');
  expect(run.view().hints).toBe(true);
  until(run, () => run.world.phase === 'running' && run.world.step === CLEAR_STEPS - 1);
  expect(run.view().hints).toBe(true);
  run.step(IDLE);
  expect(run.view().hints).toBe(false);
});

it('plays press on a jump and hit for each heart lost, once on the last; death saves the HI', () => {
  const { run, played } = setUp({}, { hi: 5 });
  die(run);
  expect(played[0]).toBe('press');
  expect(played.filter((s) => s === 'hit')).toHaveLength(3);
  expect(run.hi).toBe(Math.max(5, run.world.score));
  expect(readNumber('dwf.hi', 0)).toBe(run.hi);
  expect(run.view().phase).toBe('dead');
  expect(run.view().deadMs).toBeGreaterThan(0);
});

it('plays reached every 100 points and pickup for a box', () => {
  const { run, played } = setUp({ invincible: true, box: 'ghost' });
  run.step(JUMP);
  until(run, () => run.world.score >= 250);
  expect(played.filter((s) => s === 'reached')).toHaveLength(2);
  expect(played).toContain('pickup');
  expect(played).not.toContain('hit');
});

it('keeps stepping the scene after death, so GAME OVER plays', () => {
  const { run } = setUp();
  die(run);
  const step = vi.spyOn(run.scene, 'step');
  run.step(IDLE);
  expect(step).toHaveBeenCalledWith(run.world, NO_EVENTS);
});

it('restarts on a jump key or a tap only 1200 ms after death; the new round runs at once', () => {
  for (const kind of ['jumpKey', 'pointer'] as const) {
    const { run, played } = setUp();
    die(run);
    const dead = run.world;
    const reset = vi.spyOn(run.scene, 'reset');
    const steps = Math.ceil(1200 / STEP_MS);
    for (let i = 1; i < steps; i++) run.step(frame({}, { [kind]: true }));
    expect(run.world).toBe(dead);
    played.length = 0;
    run.step(frame({}, { [kind]: true }));
    expect(run.world).not.toBe(dead);
    expect(run.world.phase).toBe('running');
    expect(played).toEqual(['press']);
    expect(reset).toHaveBeenCalledTimes(1);
    expect(run.view()).toMatchObject({ phase: 'running', deadMs: 0 });
    expect(run.touchMode()).toBe('split');
  }
});

it('Enter restarts at once', () => {
  const { run } = setUp();
  die(run);
  run.step(frame({}, { enter: true }));
  expect(run.world.phase).toBe('running');
});

it('a new round gets a fresh seed, unless the test mode fixes one', () => {
  const free = setUp({ seed: null }, { seeds: [11, 12] });
  expect(free.run.world.seed).toBe(11);
  die(free.run);
  free.run.step(frame({}, { enter: true }));
  expect(free.run.world.seed).toBe(12);

  const fixed = setUp({ seed: 7 });
  die(fixed.run);
  fixed.run.step(frame({}, { enter: true }));
  expect(fixed.run.world.seed).toBe(7);
});

it('autopilot starts the round and plays it, whatever the player presses', () => {
  const { run, played } = setUp({ autopilot: true });
  for (let i = 0; i < 900; i++) run.step(frame({ duckHeld: true, duckPressed: i === 0 }));
  expect(run.world.phase).toBe('running');
  expect(run.world.trex.ducking).toBe(false);
  expect(played.filter((s) => s === 'press').length).toBeGreaterThan(1);
  expect(run.world.hp).toBe(3);
});

it('night turns the view inverted', () => {
  const { run } = setUp({ invincible: true });
  run.step(JUMP);
  until(run, () => run.world.night > 0);
  expect(run.view().inverted).toBe(true);
});

it('setWide moves the hearts, skills and score into the world, or out to the strip', () => {
  const { run } = setUp();
  const setHud = vi.spyOn(run.scene, 'setHud');
  run.setWide(false);
  expect(setHud).toHaveBeenLastCalledWith('none', false, false);
  run.setWide(true);
  expect(setHud).toHaveBeenLastCalledWith('inside', true, true);
});
