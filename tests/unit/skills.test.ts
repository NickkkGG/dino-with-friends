import { expect, it } from 'vitest';
import type { SkillBox } from '../../shared/sim/boxes';
import { SKILL_STEPS } from '../../shared/sim/constants';
import {
  NO_INPUT, cloneWorld, createWorld, currentSpeed, pendingBox, skillRemaining, stepWorld,
} from '../../shared/sim/world';
import type { StepEvents, StepInput, World, WorldOptions } from '../../shared/sim/world';

// Worlds where obstacles cost nothing, so a dino that stands still reaches the boxes.
const world = (o: Partial<WorldOptions> = {}): World => createWorld({ seed: 1, playerId: 'solo', invincible: true, ...o });

const JUMP: StepInput = { ...NO_INPUT, jumpPressed: true };
const DUCK_HELD: StepInput = { ...NO_INPUT, duckHeld: true };

function run(w: World, n: number, input: StepInput = NO_INPUT): StepEvents[] {
  const evs: StepEvents[] = [];
  for (let i = 0; i < n; i++) evs.push(stepWorld(w, input));
  return evs;
}

function runUntil(w: World, wanted: (e: StepEvents) => boolean, input: StepInput = NO_INPUT, limit = 20000): StepEvents {
  for (let i = 0; i < limit; i++) {
    const ev = stepWorld(w, input);
    if (wanted(ev)) return ev;
  }
  throw new Error(`no such step within ${limit} steps`);
}

const runToPickup = (w: World, input: StepInput = NO_INPUT): StepEvents => runUntil(w, (e) => e.picked !== null, input);

// The first box of the world's plan that was placed (a box with no wide enough gap is skipped).
function firstBox(w: World): SkillBox {
  for (let n = 0; n < 20; n++) {
    const box = w.boxes!.get(n);
    if (box) return box;
  }
  throw new Error('no box among the first 20');
}

it('a running dino picks a box; a dino holding ↓ never does', () => {
  const runner = world();
  const box = firstBox(runner);
  const ev = runToPickup(runner);
  expect(ev.picked).toEqual({ n: box.n, skill: box.skill });
  expect(runner.boxIndex).toBe(box.n + 1);
  expect(runner.lastSkill).toEqual({ id: box.skill, step: runner.step - 1 });

  const ducker = world();
  const evs = runUntil(ducker, () => ducker.boxIndex > box.n, DUCK_HELD); // the box goes by under nobody's head
  expect(evs.picked).toBeNull();
  expect(ducker.trex.ducking).toBe(true);
  expect(box.worldX - ducker.scroll + 16).toBeLessThan(0); // it was let go only once it had left the screen
  expect(ducker.lastSkill).toBeNull();
});

it('shows the box that is coming, where it is on the screen, and nothing in a world without boxes', () => {
  const w = world();
  const box = firstBox(w);
  stepWorld(w, NO_INPUT); // a running step lets go of boxes that were never placed
  const coming = pendingBox(w)!;
  expect(coming.box).toBe(box);
  expect(coming.x).toBe(box.worldX - w.scroll);
  run(w, 50);
  expect(pendingBox(w)!.x).toBe(box.worldX - w.scroll);

  const bare = createWorld({ seed: 1, playerId: 'solo', boxes: false });
  expect(bare.boxes).toBeNull();
  expect(pendingBox(bare)).toBeNull();
  expect(run(bare, 3000).some((e) => e.picked)).toBe(false);
});

it('shares the box plan with a clone and copies where it is in it', () => {
  const w = world();
  runToPickup(w);
  const c = cloneWorld(w);
  expect(c.boxes).toBe(w.boxes);
  expect(c.boxIndex).toBe(w.boxIndex);
  runToPickup(c);
  expect(w.boxIndex).toBeLessThan(c.boxIndex);
});

it('SPEED makes the next 180 steps 1.5× faster', () => {
  const w = world({ forcedSkill: 'speed' });
  expect(runToPickup(w).picked!.skill).toBe('speed');
  const p = w.step - 1;
  expect(skillRemaining(w, 'speed')).toBe(180);
  for (let s = p + 1; s <= p + 180; s++) {
    expect(w.step).toBe(s);
    expect(currentSpeed(w), `step ${s}`).toBeCloseTo(w.table.speedAt(s) * 1.5, 12);
    const before = w.scroll;
    stepWorld(w, NO_INPUT);
    expect(w.scroll - before).toBe(Math.floor(w.table.speedAt(s) * 1.5));
  }
  expect(w.step).toBe(p + 181);
  expect(currentSpeed(w)).toBe(w.table.speedAt(p + 181)); // back to the base speed
});

it('+1 HEART adds a heart up to 5, and at 5 gives the alternative skill', () => {
  for (const [hp, after] of [[3, 4], [4, 5]] as const) {
    const w = world({ forcedSkill: 'heart' });
    w.hp = hp;
    expect(runToPickup(w).picked!.skill).toBe('heart');
    expect(w.hp).toBe(after);
    expect(w.skillUntil).toEqual({ doubleJump: 0, ghost: 0, speed: 0 });
  }
  const full = world({ forcedSkill: 'heart' });
  full.hp = 5;
  const box = firstBox(full);
  const ev = runToPickup(full);
  expect(ev.picked).toEqual({ n: box.n, skill: box.altSkill });
  expect(full.hp).toBe(5);
  expect(skillRemaining(full, box.altSkill)).toBe(SKILL_STEPS[box.altSkill]);
  expect(full.lastSkill!.id).toBe(box.altSkill);
});

it('GHOST lets the dino pass obstacles for 300 steps without damage', () => {
  const w = world({ forcedSkill: 'ghost' });
  runToPickup(w);
  w.opts.invincible = false; // from here on an obstacle would cost a heart
  expect(skillRemaining(w, 'ghost')).toBe(300);
  const evs = run(w, 300);
  expect(evs.some((e) => e.overlap)).toBe(true);
  expect(evs.some((e) => e.hit !== null)).toBe(false);
  expect([w.hp, skillRemaining(w, 'ghost')]).toEqual([3, 0]);
  runUntil(w, (e) => e.hit !== null); // once the ghost is gone, a touch costs a heart again
  expect(w.hp).toBe(2);
});

it('DOUBLE JUMP allows one air jump per jump for 600 steps', () => {
  const w = world({ forcedSkill: 'doubleJump' });
  runToPickup(w);
  const p = w.step - 1;
  expect(skillRemaining(w, 'doubleJump')).toBe(600);
  expect(stepWorld(w, JUMP).jumped).toBe(true);
  run(w, 5);
  expect(stepWorld(w, JUMP).airJumped).toBe(true);
  expect(stepWorld(w, JUMP)).toMatchObject({ jumped: false, airJumped: false }); // once per jump
  runUntil(w, (e) => e.landed);

  // the last step that still allows it is p + 600
  run(w, p + 594 - w.step);
  expect(stepWorld(w, JUMP).jumped).toBe(true); // step p + 594
  const late = cloneWorld(w);
  run(w, 5);
  expect(w.step).toBe(p + 600);
  expect(stepWorld(w, JUMP).airJumped).toBe(true);
  run(late, 6);
  expect(late.step).toBe(p + 601);
  expect(stepWorld(late, JUMP).airJumped).toBe(false);
});

it('holding the jump key does not air jump', () => {
  // A key held down is one press on the step it went down, and nothing on the steps after.
  const w = world({ forcedSkill: 'doubleJump' });
  runToPickup(w);
  expect(stepWorld(w, JUMP).jumped).toBe(true);
  const held: StepEvents[] = [];
  for (let ev = stepWorld(w, NO_INPUT); ; ev = stepWorld(w, NO_INPUT)) {
    held.push(ev);
    if (ev.landed || held.length > 60) break;
  }
  expect(held.at(-1)!.landed).toBe(true);
  expect(held.some((e) => e.airJumped || e.jumped)).toBe(false);
});

it('the same skill again restarts its timer; two skills can run together', () => {
  const w = world({ forcedSkill: 'speed' });
  w.skillUntil.speed = 100000; // a speed skill with a long time still to go
  w.skillUntil.ghost = 100000;
  runToPickup(w);
  const p = w.step - 1;
  expect(w.skillUntil.speed).toBe(p + 1 + 180); // started again, not added on
  expect(skillRemaining(w, 'speed')).toBe(180);
  expect(skillRemaining(w, 'ghost')).toBeGreaterThan(0);
  expect(currentSpeed(w)).toBeCloseTo(w.table.speedAt(w.step) * 1.5, 12);
});

it('picks boxes while protected after a hit, and while ghost', () => {
  for (const protection of ['hit', 'ghost'] as const) {
    const w = world({ forcedSkill: 'speed' });
    runUntil(w, () => { const b = pendingBox(w); return b !== null && b.x < 120; });
    w.opts.invincible = false;
    if (protection === 'hit') { w.hitStep = w.step - 1; w.hp = 2; } else { w.skillUntil.ghost = w.step + 300; }
    const ev = runToPickup(w);
    expect(ev.picked!.skill, protection).toBe('speed');
    expect(skillRemaining(w, 'speed'), protection).toBe(180);
  }
});

it('applySkills false still reports the pickup but changes nothing', () => {
  for (const skill of ['heart', 'speed', 'ghost', 'doubleJump'] as const) {
    const w = world({ forcedSkill: skill, applySkills: false });
    const ev = runToPickup(w);
    expect(ev.picked!.skill, skill).toBe(skill);
    expect(w.hp, skill).toBe(3);
    expect(w.skillUntil, skill).toEqual({ doubleJump: 0, ghost: 0, speed: 0 });
    expect(w.lastSkill, skill).toEqual({ id: skill, step: w.step - 1 });
  }
});

it('passes over a box that was never placed once the score reaches its target, and runs on without boxes for long', () => {
  // A long invincible round: some of its boxes find no wide enough gap. The world must neither stop at them nor run ahead.
  const w = world();
  let unplaced = 0;
  for (let i = 0; i < 25000; i++) {
    stepWorld(w, NO_INPUT);
    const plan = w.boxes!;
    // every box before boxIndex was taken, missed or never placed; an unplaced one is let go only from its target on
    for (let n = 0; n < w.boxIndex; n++) if (plan.get(n) === null) expect(w.score, `box ${n}`).toBeGreaterThanOrEqual(plan.target(n));
    expect(plan.target(w.boxIndex) - 700, 'boxIndex keeps up with the score').toBeLessThanOrEqual(w.score + 1);
  }
  for (let n = 0; n < w.boxIndex; n++) if (w.boxes!.get(n) === null) unplaced += 1;
  expect(w.score).toBeGreaterThan(5000);
  expect(w.boxIndex).toBeGreaterThan(5);
  expect(unplaced).toBeGreaterThan(0); // the case this test is about did happen
});
