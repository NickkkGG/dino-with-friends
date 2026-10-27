import { expect, it } from 'vitest';
import type { RunState } from '../../shared/lobby/protocol';
import { botInput, earliestSafe } from '../../shared/sim/autopilot';
import { STEP_MS, TREX_X, WORLD_W } from '../../shared/sim/constants';
import {
  NO_INPUT, cloneWorld, createWorld, isHurt, pendingBox, skillRemaining, speedSafeRemaining, stepWorld, visibleObstacles,
} from '../../shared/sim/world';
import type { StepInput, World } from '../../shared/sim/world';
import { STATE_EVERY_STEPS, runState } from '../../src/game/run-state';
import { RUN_ON_STEPS, WATCH_DELAY_MS, WatchRun } from '../../src/game/watch-run';

const START = 10_000;
const SEED = 7;

/** The frame time that shows the step of state `s`. */
const shownAt = (s: RunState) => START + s.t + WATCH_DELAY_MS;

/** The frame time that shows step `n`. */
const stepAt = (n: number) => START + n * STEP_MS + WATCH_DELAY_MS;

/** p2's round on seed 7, with a state every 6 steps and a copy of the world when each was sent. */
function played(o: { steps: number; input: (w: World) => StepInput; invincible?: boolean }): { s: RunState; at: World }[] {
  const w = createWorld({ seed: SEED, playerId: 'p2', invincible: o.invincible ?? false });
  const sent: { s: RunState; at: World }[] = [];
  for (let i = 0; i < o.steps; i++) {
    const ev = stepWorld(w, o.input(w));
    if (ev.died) {
      sent.push({ s: runState(w), at: cloneWorld(w) }); // the state with no hearts, sent before the death
      break;
    }
    if (w.step % STATE_EVERY_STEPS === 0) sent.push({ s: runState(w), at: cloneWorld(w) });
  }
  return sent;
}

const watcher = () => new WatchRun({ seed: SEED, target: 'p2', startAt: START, rand: () => 0.5 });

const onScreen = (w: World) => visibleObstacles(w).filter((v) => v.x < WORLD_W).map((v) => [v.index, v.x]);

const bot = (w: World) => botInput(w, earliestSafe);

it("shows the runner's world exactly at the step of each state", () => {
  const sent = played({ steps: 6000, input: bot, invincible: true });
  expect(sent.some(({ s }) => s.birds.length > 0)).toBe(true);
  expect(sent.some(({ s }) => s.skill !== null)).toBe(true);
  const run = watcher();
  for (const { s, at } of sent) {
    run.add(s);
    run.frame(shownAt(s));
    const w = run.world;
    expect([w.step, w.scroll, w.score, w.hp, w.boxIndex, w.night]).toEqual([at.step, at.scroll, at.score, at.hp, at.boxIndex, at.night]);
    expect([w.trex.y, w.trex.jumping, w.trex.ducking]).toEqual([at.trex.y, at.trex.jumping, at.trex.ducking]);
    expect(onScreen(w)).toEqual(onScreen(at));
    expect(pendingBox(w)?.x ?? null).toBe(pendingBox(at)?.x ?? null);
    for (const id of ['doubleJump', 'ghost', 'speed'] as const) expect(skillRemaining(w, id)).toBe(skillRemaining(at, id));
  }
});

it('moves smoothly from one state to the next', () => {
  const sent = played({ steps: 1200, input: bot, invincible: true });
  const i = sent.findIndex(({ s }, j) => j > 40 && s.y !== sent[j - 1]!.s.y); // mid-jump, so the height moves too
  const a = sent[i - 1]!.s;
  const b = sent[i]!.s;
  const run = watcher();
  run.add(a);
  run.add(b);
  let last = -Infinity;
  for (let n = Math.round(a.t / STEP_MS); n <= Math.round(b.t / STEP_MS); n++) {
    run.frame(stepAt(n));
    const { scroll, trex } = run.world;
    expect(scroll).toBeGreaterThanOrEqual(last);
    expect(scroll).toBeGreaterThanOrEqual(a.x);
    expect(scroll).toBeLessThanOrEqual(b.x);
    expect(trex.y).toBeGreaterThanOrEqual(Math.floor(Math.min(a.y, b.y)));
    expect(trex.y).toBeLessThanOrEqual(Math.ceil(Math.max(a.y, b.y)));
    last = scroll;
  }
  expect(last).toBe(b.x);
});

it('runs on at the last speed for 15 steps past the latest state, then holds', () => {
  const { s } = played({ steps: 600, input: () => NO_INPUT, invincible: true }).at(-1)!;
  const run = watcher();
  run.add(s);
  run.frame(shownAt(s) + 6 * STEP_MS);
  expect(run.world.scroll).toBe(s.x + Math.floor(s.spd) * 6);
  run.frame(shownAt(s) + 1000);
  expect(run.world.scroll).toBe(s.x + Math.floor(s.spd) * RUN_ON_STEPS);
});

it('drops a state that is not newer than the latest', () => {
  const sent = played({ steps: 600, input: () => NO_INPUT, invincible: true });
  const a = sent[20]!.s;
  const b = sent[21]!.s;
  const run = watcher();
  run.add(b);
  run.add(a); // a late one
  run.frame(shownAt(a));
  expect(run.world.scroll).toBe(b.x);
  run.frame(shownAt(b));
  expect(run.world.scroll).toBe(b.x);
});

it("waits like the runner's dino until the first state comes", () => {
  const run = watcher();
  run.frame(START + 2000);
  expect([run.world.phase, run.world.trex.x, run.world.scroll]).toEqual(['waiting', TREX_X, 0]);
});

it('shows a hit at its own step: a heart less, the hurt face and the spark', () => {
  const sent = played({ steps: 6000, input: () => NO_INPUT });
  const i = sent.findIndex(({ s }, j) => j > 0 && s.hp > 0 && s.hit !== null && s.hit.step !== sent[j - 1]!.s.hit?.step);
  const a = sent[i - 1]!.s;
  const b = sent[i]!.s;
  const h = b.hit!.step;
  const run = watcher();
  run.add(a);
  run.add(b);
  run.frame(stepAt(h));
  expect(run.world.hp).toBe(a.hp);
  expect(run.scene.effectsOn()).not.toContain('spark');
  run.frame(stepAt(h + 1));
  expect(run.world.hp).toBe(a.hp - 1);
  expect(isHurt(run.world)).toBe(true);
  expect(run.scene.effectsOn()).toContain('spark');
});

it("has the safe start of SPEED where the runner's own world has it, so it looks the same", () => {
  const sent = played({ steps: 20_000, input: bot, invincible: true });
  const i = sent.findIndex(({ at }, j) => j > 0 && speedSafeRemaining(at) > 0);
  expect(i).toBeGreaterThan(0); // the runner took SPEED
  const { s, at } = sent[i]!;
  const run = watcher();
  run.add(sent[i - 1]!.s);
  run.add(s);
  run.frame(shownAt(s));
  expect(run.world.step).toBe(at.step);
  expect(speedSafeRemaining(run.world)).toBe(speedSafeRemaining(at));
});

it('takes a box at its own step: the box is gone and its label is up', () => {
  const sent = played({ steps: 6000, input: bot, invincible: true });
  const i = sent.findIndex(({ s }, j) => j > 0 && s.skill !== null && s.skill.step !== sent[j - 1]!.s.skill?.step);
  const a = sent[i - 1]!.s;
  const b = sent[i]!.s;
  const p = b.skill!.step;
  const run = watcher();
  run.add(a);
  run.add(b);
  run.frame(stepAt(p));
  const box = pendingBox(run.world)?.box;
  expect(run.world.boxIndex).toBe(a.got);
  expect(run.scene.effectsOn()).not.toContain('label');
  run.frame(stepAt(p + 1));
  expect(run.world.boxIndex).toBe(b.got);
  expect(pendingBox(run.world)?.box).not.toBe(box);
  expect(run.scene.effectsOn()).toContain('label');
});

it('shows GAME OVER from the last state with no hearts, and when told the runner is out', () => {
  const sent = played({ steps: 6000, input: () => NO_INPUT });
  const last = sent.at(-1)!.s;
  expect(last.hp).toBe(0);
  const run = watcher();
  run.add(sent.at(-2)!.s);
  run.add(last);
  run.frame(shownAt(last));
  expect(run.world.phase).toBe('dead');
  const other = watcher();
  const s = sent[10]!.s;
  other.add(s);
  other.frame(shownAt(s));
  expect(other.world.phase).toBe('running');
  other.out();
  other.frame(shownAt(s) + STEP_MS);
  expect(other.world.phase).toBe('dead');
});

it('takes the state of a crash, which has the step of the state before it', () => {
  // The crash step is not counted, so a crash on the step after a state is sent comes with that state's time.
  const sent = played({ steps: 600, input: () => NO_INPUT, invincible: true });
  const s = sent[10]!.s;
  const run = watcher();
  run.add(s);
  run.add({ ...s, hp: 0 });
  run.frame(shownAt(s));
  expect(run.world.phase).toBe('dead');
  run.add({ ...s, hp: 1 }); // anything else on that step is still not newer
  expect(run.world.hp).toBe(0);
  const late = watcher(); // one whose first frame comes after the crash: the ground has stopped there
  late.add(s);
  late.add({ ...s, hp: 0 });
  late.frame(shownAt(s) + 6 * STEP_MS);
  expect([late.world.phase, late.world.scroll]).toEqual(['dead', s.x]);
});

it('turns to night with the runner', () => {
  const sent = played({ steps: 600, input: () => NO_INPUT, invincible: true });
  const run = watcher();
  run.add({ ...sent[10]!.s, night: 1 });
  run.frame(shownAt(sent[10]!.s));
  expect(run.inverted).toBe(true);
  run.add(sent[11]!.s);
  run.frame(shownAt(sent[11]!.s));
  expect(run.inverted).toBe(false);
});

it('when told the runner is out after their crash came, runs on to the crash and shows it at its own step', () => {
  // The tower says a runner is out as soon as their crash is in, while the screen, drawn behind the clock, has not got
  // there yet: the dino still runs into what it hit.
  const sent = played({ steps: 6000, input: () => NO_INPUT });
  const last = sent.at(-1)!.s;
  const before = sent.findLast(({ s }) => s.t < last.t)!.s; // the crash can come with the time of the state before it
  expect([before.hp > 0, last.hp]).toEqual([true, 0]);
  const run = watcher();
  run.add(before);
  run.add(last);
  run.out();
  run.frame(shownAt(before));
  expect(run.world.phase).toBe('running');
  run.frame(shownAt(last));
  expect([run.world.phase, run.world.scroll]).toEqual(['dead', last.x]);
});
