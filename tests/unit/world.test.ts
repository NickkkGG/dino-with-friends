import { expect, it } from 'vitest';
import { SKILL_STEPS } from '../../shared/sim/constants';
import { typeConfig } from '../../shared/sim/obstacle-types';
import { BASE_TIMELINE, constantTimeline } from '../../shared/sim/timeline';
import { createTrex } from '../../shared/sim/trex';
import {
  NO_INPUT, cloneWorld, createWorld, currentSpeed, isHurt, isInvulnerable, resumeAfterPause, retire, skillRemaining,
  skipSteps, stepWorld, stepsSinceHit, visibleObstacles,
} from '../../shared/sim/world';
import type { StepEvents, StepInput, World, WorldOptions } from '../../shared/sim/world';

// No boxes: once skill boxes exist, a skill picked up would change the timeline these tests count on.
const solo = (o: Partial<WorldOptions> = {}): World => createWorld({ seed: 1, playerId: 'solo', boxes: false, ...o });

const run = (w: World, n: number, input: StepInput = NO_INPUT): StepEvents[] => {
  const evs: StepEvents[] = [];
  for (let i = 0; i < n; i++) evs.push(stepWorld(w, input));
  return evs;
};

// Steps until `wanted` is true of a step's events, and gives those events. It gives up after `limit` steps, so a world
// that is broken fails the test instead of hanging it.
function runUntil(w: World, wanted: (e: StepEvents) => boolean, input: StepInput = NO_INPUT, limit = 20000): StepEvents {
  for (let i = 0; i < limit; i++) {
    const ev = stepWorld(w, input);
    if (wanted(ev)) return ev;
  }
  throw new Error(`no such step within ${limit} steps`);
}

const JUMP: StepInput = { ...NO_INPUT, jumpPressed: true };
const DUCK_DOWN: StepInput = { ...NO_INPUT, duckPressed: true, duckHeld: true };
const DUCK_HELD: StepInput = { ...NO_INPUT, duckHeld: true };

// A step on which nothing happens.
const QUIET: StepEvents = {
  jumped: false, airJumped: false, landed: false, overlap: false, hit: null, died: false, picked: null,
  achievement: false, nightStarted: false, nightEnded: false, introStarted: false, runStarted: false,
};

// The first step on which a dino standing still touches obstacle 0. (With hearts switched off the world can go on past it.)
function firstOverlapStep(): number {
  const w = solo({ invincible: true });
  for (let step = 0; step < 1000; step++) if (stepWorld(w, NO_INPUT).overlap) return step;
  throw new Error('a dino standing still never met an obstacle');
}

it('starts running at step 0 with 3 hearts and the dino at (24, 93)', () => {
  const w = solo();
  expect([w.phase, w.step, w.hp, w.trex.x, w.trex.y]).toEqual(['running', 0, 3, 24, 93]);
  expect([w.scroll, w.distance, w.score, w.night, w.first, w.end]).toEqual([0, 0, 0, 0, 0, 0]);
  expect([w.hitStep, w.hitPoint, w.lastSkill]).toEqual([null, null, null]);
  expect([w.seed, w.playerId]).toEqual([1, 'solo']);
  expect(w.opts).toEqual({ applySkills: true, invincible: false, nightMode: true, forcedSkill: null });
  expect(visibleObstacles(w)).toEqual([]);
  expect(currentSpeed(w)).toBe(6);
  expect([isInvulnerable(w), isHurt(w), stepsSinceHit(w)]).toEqual([false, false, Infinity]);
  expect((['doubleJump', 'ghost', 'speed'] as const).map((id) => skillRemaining(w, id))).toEqual([0, 0, 0]);
});

it('takes its options: a timeline, the flags and a forced skill', () => {
  const w = createWorld({
    seed: 7, playerId: 'p', timeline: constantTimeline(8), invincible: true, nightMode: false, applySkills: false,
    forcedSkill: 'ghost',
  });
  expect([w.seed, w.playerId]).toEqual([7, 'p']);
  expect(w.opts).toEqual({ applySkills: false, invincible: true, nightMode: false, forcedSkill: 'ghost' });
  expect(currentSpeed(w)).toBe(8);
  run(w, 10);
  expect(w.scroll).toBe(80);
  expect(w.distance).toBe(80);
});

it('scrolls like the base timeline and shows no obstacle for 180 steps', () => {
  const w = solo(); run(w, 180);
  expect(w.scroll).toBe(1080); expect(w.distance).toBeCloseTo(1096.11, 9); expect(w.score).toBe(27);
  expect(visibleObstacles(w)).toEqual([]);
});

it('shows obstacle 0 on step 180 at x = 600 + its type width', () => {
  const w = solo(); run(w, 181);
  const [o] = visibleObstacles(w); expect(o!.index).toBe(0); expect(o!.x).toBe(600 + typeConfig(o!.type).width);
  // everything else about it comes from the course: group size, top edge, group width and height, group boxes
  const c = w.course.get(0);
  expect(o).toEqual({
    index: 0, type: c.type, size: c.size, x: 600 + typeConfig(c.type).width, y: c.yPos, width: c.width, height: c.height,
    boxes: c.boxes,
  });
  expect(visibleObstacles(w)).toHaveLength(1);
});

it('waits for the first jump, plays a 24-step intro, then runs from step 0', () => {
  const w = solo({ phase: 'waiting' });
  run(w, 10);
  expect([w.phase, w.trex.x, w.scroll]).toEqual(['waiting', 0, 0]);
  expect(stepWorld(w, JUMP)).toEqual({ ...QUIET, jumped: true });
  // 33 more empty steps: still waiting; the 34th lands and starts the intro (introStarted)
  const flight = run(w, 33);
  expect(flight).toEqual(Array.from({ length: 33 }, () => QUIET));
  expect([w.phase, w.trex.jumping]).toEqual(['waiting', true]);
  expect(stepWorld(w, NO_INPUT)).toEqual({ ...QUIET, landed: true, introStarted: true });
  expect([w.phase, w.introStep, w.trex.x, w.trex.jumping]).toEqual(['intro', 0, 0, false]);
  // 23 more steps: intro, the dino sliding in 1 px a step while nothing else moves; the 24th gives runStarted,
  // phase 'running', trex.x 24, step 0, scroll 0
  expect(run(w, 23)).toEqual(Array.from({ length: 23 }, () => QUIET));
  expect([w.phase, w.introStep, w.trex.x]).toEqual(['intro', 23, 23]);
  expect([w.step, w.scroll, w.distance, w.score]).toEqual([0, 0, 0, 0]);
  expect(stepWorld(w, NO_INPUT)).toEqual({ ...QUIET, runStarted: true });
  expect([w.phase, w.trex.x, w.step, w.scroll, w.distance, w.score]).toEqual(['running', 24, 0, 0, 0, 0]);
  // and the round goes on from there, at the starting speed
  expect(stepWorld(w, NO_INPUT)).toEqual(QUIET);
  expect([w.step, w.scroll, w.distance]).toEqual([1, 6, 6]);
});

it('stays waiting until the dino has jumped and landed, and ↓ does nothing while it waits', () => {
  const w = solo({ phase: 'waiting' });
  run(w, 300);
  expect([w.phase, w.started]).toEqual(['waiting', false]);
  expect(run(w, 5, DUCK_DOWN)).toEqual(Array.from({ length: 5 }, () => QUIET));
  expect([w.trex.ducking, w.trex.speedDrop]).toEqual([false, false]);
  // a jump that is started is a jump that ends the wait, whatever the key does after it
  stepWorld(w, JUMP);
  expect([w.phase, w.started]).toEqual(['waiting', true]);
  runUntil(w, (e) => e.introStarted, { ...NO_INPUT, jumpReleased: true });
  expect(w.phase).toBe('intro');
});

it('a hit costs a heart, protects for 90 steps and slows to 0.4 then back to 1 in 150 steps', () => {
  const w = solo(); const ev = runUntil(w, (e) => e.hit !== null);
  const h = w.step - 1;
  expect(h).toBe(firstOverlapStep()); // a dino standing still is hit on the first step it touches
  expect(w.hp).toBe(2); expect(w.hitStep).toBe(h); expect(isHurt(w)).toBe(true); expect(isInvulnerable(w)).toBe(true);
  expect(ev).toEqual({ ...QUIET, overlap: true, hit: w.hitPoint });
  expect(w.hitPoint).not.toBeNull();
  expect(stepsSinceHit(w)).toBe(0);
  // the hit step itself goes on as a normal step: the distance was added and the step counted
  expect(w.distance).toBe(w.table.distanceAfter(h));
  expect(currentSpeed(w)).toBeCloseTo(BASE_TIMELINE.speedAt(h + 1) * (0.4 + 0.6 / 150), 9);
  const scrollBefore = w.scroll;
  const evs = [stepWorld(w, NO_INPUT), ...run(w, 88)];   // steps h+1 .. h+89
  expect(w.scroll - scrollBefore).toBeGreaterThan(0);
  expect(evs.some(e => e.overlap)).toBe(true); expect(evs.some(e => e.hit)).toBe(false);
  expect(isInvulnerable(w)).toBe(true);          // step h+90 is still protected
  stepWorld(w, NO_INPUT); expect(isInvulnerable(w)).toBe(false);
});

it('moves the ground at the slowed speed after a hit, a whole number of pixels a step', () => {
  const w = solo(); runUntil(w, (e) => e.hit !== null);
  const v = currentSpeed(w);
  expect(v).toBeLessThan(0.5 * BASE_TIMELINE.speedAt(w.step));
  const [scroll, distance] = [w.scroll, w.distance];
  stepWorld(w, NO_INPUT);
  expect(w.scroll - scroll).toBe(Math.floor(v));
  expect(w.distance - distance).toBeCloseTo(v, 9);
});

it('shows the hurt face for 21 steps after a hit', () => {
  const w = solo(); runUntil(w, (e) => e.hit !== null);
  for (let n = 0; n < 30; n++) {
    expect([n, stepsSinceHit(w), isHurt(w)]).toEqual([n, n, n < 21]);
    stepWorld(w, NO_INPUT);
  }
});

it('eases the slowdown from 0.4 back to 1 over 150 steps', () => {
  const w = solo(); runUntil(w, (e) => e.hit !== null);
  const h = w.step - 1;
  w.skillUntil.ghost = w.step + 1000; // no second hit to start the slowdown over
  for (let n = 1; n <= 152; n++) {
    expect(w.step).toBe(h + n);
    expect(currentSpeed(w), `${n} steps after the hit`).toBeCloseTo(BASE_TIMELINE.speedAt(h + n) * (0.4 + 0.6 * Math.min(1, n / 150)), 9);
    stepWorld(w, NO_INPUT);
  }
  expect(currentSpeed(w)).toBe(BASE_TIMELINE.speedAt(h + 153)); // the slowdown is over, so the base speed comes back exactly
});

it('dies on the third hit and then stops changing', () => {
  const w = solo();
  const hpAfterEachHit: number[] = [];
  let before = { scroll: 0, distance: 0, score: 0, step: 0 };
  let ev = QUIET;
  for (let i = 0; i < 20000 && !ev.died; i++) {
    before = { scroll: w.scroll, distance: w.distance, score: w.score, step: w.step };
    ev = stepWorld(w, NO_INPUT);
    if (ev.hit) hpAfterEachHit.push(w.hp);
  }
  expect(hpAfterEachHit).toEqual([2, 1, 0]);
  expect(ev.died).toBe(true); expect(ev.hit).not.toBeNull();
  expect([w.phase, w.hp]).toEqual(['dead', 0]);
  // the crash step moves the ground but, like the original, adds no distance and does not count as a step
  expect(w.scroll).toBeGreaterThan(before.scroll);
  expect([w.distance, w.score, w.step]).toEqual([before.distance, before.score, before.step]);
  // then nothing changes any more, whatever is pressed
  const dead = cloneWorld(w);
  expect(run(w, 60, JUMP)).toEqual(Array.from({ length: 60 }, () => QUIET));
  expect(run(w, 60, DUCK_DOWN)).toEqual(Array.from({ length: 60 }, () => QUIET));
  expect(w).toEqual(dead);
});

it('a hit in the air costs one heart and the jump goes on', () => {
  // Seed 1: a dino standing still is first touched on step 274, by a large cactus. A jump on step 252, 22 steps before that,
  // takes the dino over the front of the cactus but brings it down onto it on step 281, 30 steps into the jump and still in the air.
  const touch = firstOverlapStep();
  expect(touch).toBe(274);
  const w = solo(); run(w, 252);
  const twin = solo({ invincible: true }); run(twin, 252); // the same jump, with nothing to stop it
  expect(stepWorld(w, JUMP).jumped).toBe(true); stepWorld(twin, JUMP);
  expect(run(w, 28).some((e) => e.overlap)).toBe(false); run(twin, 28); // steps 253 .. 280
  const ev = stepWorld(w, NO_INPUT); stepWorld(twin, NO_INPUT);         // step 281
  expect(ev).toEqual({ ...QUIET, overlap: true, hit: w.hitPoint });
  expect(w.hitPoint).not.toBeNull();
  expect([w.hp, w.hitStep, w.step, w.trex.y, w.trex.jumping]).toEqual([2, 281, 282, 54, true]);
  // the jump goes on as if nothing had happened: the same y, the same landing, and no second hit while protected
  for (let i = 0; i < 60; i++) {
    const [a, b] = [stepWorld(w, NO_INPUT), stepWorld(twin, NO_INPUT)];
    expect(w.trex, `step ${282 + i}`).toEqual(twin.trex);
    expect(a.hit).toBeNull();
    expect(a.landed, `step ${282 + i}`).toBe(b.landed);
    expect(a.landed).toBe(282 + i === 286); // the jump of 35 steps from step 252 comes down on step 286
  }
  expect(w.hp).toBe(2);
});

it('does not hit a dino that jumps over the first obstacle in time', () => {
  const touch = firstOverlapStep();
  const w = solo(); run(w, touch - 10);
  expect(stepWorld(w, JUMP).jumped).toBe(true);
  const evs = run(w, 40);
  expect(evs.some((e) => e.overlap || e.hit)).toBe(false);
  expect([w.hp, w.hitStep, w.trex.jumping]).toEqual([3, null, false]);
});

it('lets a ghost dino through: the overlap shows, no heart is lost, until the ghost wears off', () => {
  const touch = firstOverlapStep();
  const w = solo();
  w.skillUntil.ghost = touch + 1; // the ghost protects the step that first touches, and is gone on the next
  const evs = run(w, touch + 2);
  expect(evs.slice(0, touch)).toEqual(Array.from({ length: touch }, () => QUIET));
  expect(evs[touch]).toEqual({ ...QUIET, overlap: true });
  expect(evs[touch + 1]!.hit).not.toBeNull();
  expect([w.hp, w.hitStep]).toEqual([2, touch + 1]);
});

it('never costs an invincible dino a heart, but still shows the overlaps', () => {
  const w = solo({ invincible: true });
  const evs = run(w, 6000);
  expect(evs.some((e) => e.overlap)).toBe(true);
  expect(evs.every((e) => e.hit === null && !e.died)).toBe(true);
  expect([w.phase, w.hp, w.hitStep, w.hitPoint]).toEqual(['running', 3, null, null]);
  expect(w.scroll).toBeGreaterThan(40000); // never slowed
});

it('reports the hit point inside the dino, as a copy', () => {
  // the hit point is where the dino's box and the obstacle's box overlap, in world pixels, so inside the dino's 44 × 47
  const w = solo(); const ev = runUntil(w, (e) => e.hit !== null);
  expect(ev.hit!.x).toBeGreaterThanOrEqual(24); expect(ev.hit!.x).toBeLessThan(24 + 44);
  expect(ev.hit!.y).toBeGreaterThanOrEqual(93); expect(ev.hit!.y).toBeLessThan(93 + 47);
  expect(w.hitPoint).toEqual(ev.hit);
  expect(w.hitPoint).not.toBe(ev.hit); // a copy: whoever holds the event cannot change the world
});

it('fires an achievement on step 630 and night from step 3589 for 720 steps', () => {
  const w = solo({ invincible: true }); const evs = run(w, 4400);
  expect(evs.findIndex(e => e.achievement)).toBe(630);
  expect(evs.findIndex(e => e.nightStarted)).toBe(3589);
  expect(evs.findIndex(e => e.nightEnded)).toBe(4309);
  // one achievement for every hundred points, and a single night so far
  expect(evs.filter((e) => e.achievement)).toHaveLength(Math.floor(w.score / 100));
  expect(evs.filter((e) => e.nightStarted)).toHaveLength(1);
});

it('counts the night step by step: 1 on the first, 720 on the last, then day again', () => {
  const w = solo({ invincible: true });
  run(w, 3589); expect(w.night).toBe(0);
  run(w, 1); expect(w.night).toBe(1);       // step 3589
  run(w, 1); expect(w.night).toBe(2);
  run(w, 718); expect(w.night).toBe(720);   // step 4308
  run(w, 1); expect(w.night).toBe(0);       // step 4309
});

it('has no night when nightMode is false', () => {
  const w = solo({ invincible: true, nightMode: false }); const evs = run(w, 4400);
  expect(evs.some((e) => e.nightStarted || e.nightEnded)).toBe(false);
  expect(w.night).toBe(0);
  expect(evs.findIndex((e) => e.achievement)).toBe(630); // the rest of the round is the same
});

it('moves a bird by floor(v + offset) per step', () => {
  // A bird flies a little faster or slower than the ground. It comes in at speed 8.5, around step 2500.
  const offsets = new Set<number>();
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const w = solo({ seed, invincible: true });
    const bird = () => visibleObstacles(w).find((o) => o.type === 'pterodactyl');
    runUntil(w, () => bird() !== undefined, NO_INPUT, 6000);
    const index = bird()!.index;
    const offset = w.course.get(index).speedOffset;
    offsets.add(offset);
    let x = bird()!.x;
    for (let i = 0; i < 20; i++) {
      const v = currentSpeed(w);
      stepWorld(w, NO_INPUT);
      const now = visibleObstacles(w).find((o) => o.index === index)!;
      expect(x - now.x, `seed ${seed}, ${i + 1} steps after it showed`).toBe(Math.floor(v + offset));
      x = now.x;
    }
  }
  expect([...offsets].sort()).toEqual([-0.8, 0.8]); // seeds with a bird slower than the ground, and with one faster
});

it('shows each obstacle with the numbers of the course, shifted by the ground and by a bird\'s drift', () => {
  const w = solo({ seed: 2, invincible: true });
  run(w, 4000);
  const views = visibleObstacles(w);
  expect(views.length).toBeGreaterThan(0);
  for (const o of views) {
    const c = w.course.get(o.index);
    const drift = w.drift.get(o.index) ?? 0;
    expect(c.type === 'pterodactyl' || drift === 0, `obstacle ${o.index}: only a bird drifts`).toBe(true);
    expect(o).toEqual({
      index: c.index, type: c.type, size: c.size, x: c.worldX - w.scroll - drift, y: c.yPos, width: c.width, height: c.height,
      boxes: c.boxes,
    });
  }
});

it('ducks while ↓ is held on the ground, ignores jump while ducking, and drops fast when ↓ is pressed in the air', () => {
  const w = solo({ timeline: constantTimeline(6) }); // at speed 6 the jump is the one of trex.test.ts
  run(w, 3);
  expect(w.trex.ducking).toBe(false);

  // ↓ goes down: the dino ducks, and stays down for as long as ↓ is held
  stepWorld(w, DUCK_DOWN);
  expect(w.trex.ducking).toBe(true);
  run(w, 10, DUCK_HELD);
  expect(w.trex.ducking).toBe(true);

  // two thumbs: ↓ is held on the left and the jump key is tapped on the right. A ducking dino does not jump
  const tap = stepWorld(w, { ...DUCK_HELD, jumpPressed: true });
  expect(tap).toEqual(QUIET);
  expect([w.trex.jumping, w.trex.ducking, w.trex.y]).toEqual([false, true, 93]);

  // ↓ let go: the dino stands up, and now it can jump
  stepWorld(w, NO_INPUT);
  expect(w.trex.ducking).toBe(false);
  const ys: number[] = [];
  const step = (input: StepInput): StepEvents => { const ev = stepWorld(w, input); ys.push(w.trex.y); return ev; };
  expect(step(JUMP).jumped).toBe(true);
  for (let i = 0; i < 6; i++) step(NO_INPUT);

  // ↓ pressed on the 8th step of the jump: the dino falls three times as fast and lands on the 15th
  step(DUCK_DOWN);
  let landing = QUIET;
  for (let i = 0; i < 7; i++) landing = step(DUCK_HELD);
  expect(ys).toEqual([82, 72, 63, 54, 46, 38, 31, 34, 39, 46, 54, 64, 76, 90, 93]);
  expect(landing.landed).toBe(true);
  // ↓ is still held, so it lands into a duck (and the duck is on in the step of the landing already)
  expect([w.trex.ducking, w.trex.jumping, w.trex.speedDrop]).toEqual([true, false, false]);
  step(DUCK_HELD);
  expect(w.trex.ducking).toBe(true);
  step(NO_INPUT);
  expect(w.trex.ducking).toBe(false);
});

it('lets go of the fast fall when ↓ is let go in the air', () => {
  const w = solo({ timeline: constantTimeline(6) });
  stepWorld(w, JUMP);
  stepWorld(w, DUCK_DOWN);
  expect(w.trex.speedDrop).toBe(true);
  stepWorld(w, NO_INPUT);
  expect([w.trex.speedDrop, w.trex.ducking, w.trex.jumping]).toEqual([false, false, true]);
});

it('cuts the jump short when the key is let go after the climb has begun', () => {
  const full = solo({ timeline: constantTimeline(6) }); const tapped = solo({ timeline: constantTimeline(6) });
  stepWorld(full, JUMP); stepWorld(tapped, JUMP);
  const lengthOf = (w: World, release: number): number => {
    for (let i = 1; i < 100; i++) {
      const ev = stepWorld(w, i === release ? { ...NO_INPUT, jumpReleased: true } : NO_INPUT);
      if (ev.landed) return i + 1;
    }
    throw new Error('the jump never came down');
  };
  expect(lengthOf(full, -1)).toBe(35);   // a held key: the whole jump of trex.test.ts
  expect(lengthOf(tapped, 5)).toBe(30);  // let go before the 6th step of the jump: "release before step 6" there
});

it('allows one air jump per jump while the double jump skill lasts', () => {
  const w = solo({ timeline: constantTimeline(6) });
  w.skillUntil.doubleJump = 600;
  expect(skillRemaining(w, 'doubleJump')).toBe(600);
  const ys: number[] = [];
  const step = (input: StepInput): StepEvents => { const ev = stepWorld(w, input); ys.push(w.trex.y); return ev; };
  expect(step(JUMP)).toEqual({ ...QUIET, jumped: true });
  for (let i = 0; i < 8; i++) step(NO_INPUT);
  expect(step(JUMP)).toEqual({ ...QUIET, airJumped: true }); // the 10th step of the jump
  expect(step(JUMP)).toEqual(QUIET);                          // once per jump
  let landed = QUIET;
  while (!landed.landed && ys.length < 100) landed = step(NO_INPUT);
  expect(ys).toHaveLength(38);       // the 38-step jump of trex.test.ts: the third press is its 11th step and changes nothing
  expect(Math.min(...ys)).toBe(-14); // the second push from y 54 takes it above the top of the world
  // landing gives the air jump back
  expect(step(JUMP).jumped).toBe(true);
  expect(step(JUMP).airJumped).toBe(true);
});

it('gives no air jump without the skill, and none while waiting or in the intro', () => {
  const plain = solo({ timeline: constantTimeline(6) });
  stepWorld(plain, JUMP); run(plain, 5);
  expect(stepWorld(plain, JUMP)).toEqual(QUIET);

  const waiting = solo({ phase: 'waiting' });
  waiting.skillUntil.doubleJump = 600;
  stepWorld(waiting, JUMP); run(waiting, 5);
  expect(stepWorld(waiting, JUMP)).toEqual(QUIET);

  // the intro: the dino may jump there, but only as an ordinary jump
  runUntil(waiting, (e) => e.introStarted);
  expect(waiting.phase).toBe('intro');
  expect(stepWorld(waiting, JUMP).jumped).toBe(true);
  expect(stepWorld(waiting, JUMP)).toEqual(QUIET);
  expect(waiting.phase).toBe('intro');
});

it('runs 1.5 times as fast for exactly as long as the speed skill lasts', () => {
  const w = solo();
  w.skillUntil.speed = SKILL_STEPS.speed; // as if it had been picked up on step -1
  expect(skillRemaining(w, 'speed')).toBe(180);
  for (let k = 0; k < 180; k++) {
    expect(currentSpeed(w), `step ${k}`).toBeCloseTo(BASE_TIMELINE.speedAt(k) * 1.5, 12);
    expect(skillRemaining(w, 'speed')).toBe(180 - k);
    stepWorld(w, NO_INPUT);
  }
  expect(w.scroll).toBe(180 * 9);
  expect(w.distance).toBeCloseTo(w.table.distanceAfter(179) * 1.5, 9);
  expect(skillRemaining(w, 'speed')).toBe(0);
  expect(currentSpeed(w)).toBe(BASE_TIMELINE.speedAt(180)); // the boost is gone on step 180, and a skill never runs below 0
});

it('stacks the speed skill on the slowdown of a hit', () => {
  const w = solo(); runUntil(w, (e) => e.hit !== null);
  const plain = currentSpeed(w);
  w.skillUntil.speed = w.step + 10;
  expect(currentSpeed(w)).toBeCloseTo(plain * 1.5, 12);
});

it('cloneWorld is independent', () => {
  const w = solo({ invincible: true });
  runUntil(w, () => visibleObstacles(w).some((o) => o.type === 'pterodactyl'), NO_INPUT, 6000);
  expect(w.drift.size).toBeGreaterThan(0); // a bird is in flight, so there is a drift to copy
  w.skillUntil.ghost = 50; w.lastSkill = { id: 'ghost', step: 3 }; w.hitPoint = { x: 30, y: 100 };
  const c = cloneWorld(w);
  expect(c).toEqual(w);
  // what is worked out once is shared; everything that changes is a copy
  expect(c.table).toBe(w.table); expect(c.course).toBe(w.course);
  for (const key of ['trex', 'skillUntil', 'drift', 'opts', 'lastSkill', 'hitPoint'] as const) expect(c[key], key).not.toBe(w[key]);

  // stepping the clone leaves the original alone...
  const was = {
    step: w.step, scroll: w.scroll, distance: w.distance, hp: w.hp, trex: { ...w.trex }, drift: [...w.drift],
    skillUntil: { ...w.skillUntil }, lastSkill: { ...w.lastSkill! }, hitPoint: { ...w.hitPoint },
  };
  run(c, 300, JUMP);
  c.skillUntil.speed = 7; c.drift.clear(); c.trex.x = 99; c.lastSkill!.step = 99; c.hitPoint!.x = 99; c.hp = 1;
  expect({
    step: w.step, scroll: w.scroll, distance: w.distance, hp: w.hp, trex: w.trex, drift: [...w.drift],
    skillUntil: w.skillUntil, lastSkill: w.lastSkill, hitPoint: w.hitPoint,
  }).toEqual(was);

  // ...and the other way round
  const d = cloneWorld(w);
  const kept = { step: d.step, trex: { ...d.trex }, drift: [...d.drift] };
  run(w, 300, JUMP);
  expect({ step: d.step, trex: d.trex, drift: [...d.drift] }).toEqual(kept);
});

it('goes on the same from a clone, and from a second world with the same seed and inputs', () => {
  const script = (step: number): StepInput => (step % 45 === 0 ? JUMP : step % 45 === 20 ? DUCK_DOWN : NO_INPUT);
  const play = (w: World, from: number, to: number): StepEvents[] => {
    const evs: StepEvents[] = [];
    for (let step = from; step < to; step++) evs.push(stepWorld(w, script(step)));
    return evs;
  };
  for (const invincible of [false, true]) {   // hits and slowdowns on the one hand, a long round on the other
    const a = solo({ invincible }); const b = solo({ invincible });
    const first = play(a, 0, 1500);
    expect(play(b, 0, 1500), `invincible ${invincible}`).toEqual(first);
    expect(b).toEqual(a);
    const c = cloneWorld(a);
    expect(play(c, 1500, 4000)).toEqual(play(a, 1500, 4000));
    expect(c).toEqual(a);
    expect(a.score).toBeGreaterThan(0);
    if (invincible) expect(a.step).toBe(4000); // it ran all the way
  }
});

it('drops obstacles once they leave the left edge', () => {
  const w = solo({ invincible: true });
  let seen = visibleObstacles(w);
  for (let i = 0; i < 1000 && w.first === 0; i++) {
    seen = visibleObstacles(w);
    stepWorld(w, NO_INPUT);
  }
  expect(w.first).toBe(1);
  const last = seen.find((o) => o.index === 0)!;
  expect(last.x + last.width).toBeGreaterThan(0);       // the step before, a pixel of it was still on the screen
  const gone = w.course.get(0);
  expect(gone.worldX - w.scroll + gone.width).toBeLessThanOrEqual(0); // and now none is
  expect(visibleObstacles(w).map((o) => o.index)).not.toContain(0);

  // all the way along, only what has a pixel on the screen is in the list, and a bird's drift goes with the bird
  for (let i = 0; i < 9000; i++) {
    stepWorld(w, NO_INPUT);
    for (const o of visibleObstacles(w)) expect(o.x + o.width, `step ${w.step - 1}, obstacle ${o.index}`).toBeGreaterThan(0);
    expect(visibleObstacles(w).length).toBe(w.end - w.first);
  }
  expect(w.first).toBeGreaterThan(30);
  expect([...w.drift.keys()].every((i) => i >= w.first && i < w.end)).toBe(true);
  expect(w.drift.size).toBeLessThanOrEqual(w.end - w.first);
});

it('resumeAfterPause puts the dino back on the ground', () => {
  const w = solo();
  run(w, 20);
  stepWorld(w, JUMP); stepWorld(w, DUCK_DOWN);
  expect([w.trex.jumping, w.trex.speedDrop]).toEqual([true, true]);
  const before = cloneWorld(w);
  resumeAfterPause(w);
  expect(w.trex).toEqual(createTrex(24));            // standing on the ground, every jump and duck flag off, x unchanged
  expect({ ...w, trex: before.trex }).toEqual(before); // and nothing else was touched

  stepWorld(w, DUCK_DOWN);
  expect(w.trex.ducking).toBe(true);
  resumeAfterPause(w);
  expect(w.trex).toEqual(createTrex(24));
});

it('skips steps without moving anything, while the clock-based effects still run out', () => {
  const w = solo();
  run(w, 60);
  w.skillUntil.speed = w.step + 100;
  const before = cloneWorld(w);
  skipSteps(w, 120);
  expect(w.step).toBe(180);
  expect({ ...w, step: before.step }).toEqual(before); // the ground, the obstacles, the dino and the distance stay
  expect(skillRemaining(w, 'speed')).toBe(0);
  expect(currentSpeed(w)).toBeCloseTo(BASE_TIMELINE.speedAt(180), 9);
});

it('skips nothing in a world that is not running', () => {
  const waiting = solo({ phase: 'waiting' });
  skipSteps(waiting, 50);
  expect(waiting.step).toBe(0);
});

it('lets a round go when the server says it is over', () => {
  const w = solo();
  run(w, 30);
  retire(w);
  expect([w.phase, w.hp]).toEqual(['dead', 3]);
  const before = cloneWorld(w);
  expect(stepWorld(w, JUMP)).toEqual(QUIET);
  expect(w).toEqual(before);
});
