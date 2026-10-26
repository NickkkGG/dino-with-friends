import { expect, it } from 'vitest';
import { botInput, clears, earliestSafe, latestSafe } from '../../shared/sim/autopilot';
import { TREX_X } from '../../shared/sim/constants';
import { constantTimeline } from '../../shared/sim/timeline';
import { NO_INPUT, cloneWorld, createWorld, stepWorld, visibleObstacles } from '../../shared/sim/world';
import type { StepEvents, World } from '../../shared/sim/world';

// The obstacle the dino has to deal with next: the first one whose right edge is still ahead of the dino's left edge.
const nextObstacle = (w: World) => visibleObstacles(w).find((o) => o.x + o.width > TREX_X) ?? null;

// Whether obstacle i is behind the dino: gone from the world, or its right edge at or past the dino's left edge.
function passed(w: World, i: number): boolean {
  if (i < w.first) return true;
  const o = visibleObstacles(w).find((v) => v.index === i);
  return o !== undefined && o.x + o.width <= TREX_X;
}

it('the demo bot never touches a cactus at a constant speed 6', () => {
  for (let seed = 1; seed <= 10; seed++) {
    const w = createWorld({ seed, playerId: 'demo', timeline: constantTimeline(6), invincible: true, boxes: false, nightMode: false });
    let overlaps = 0;
    let jumps = 0;
    for (let i = 0; i < 10_000; i++) {
      const ev = stepWorld(w, botInput(w, earliestSafe));
      if (ev.overlap) overlaps++;
      if (ev.jumped) jumps++;
    }
    expect(overlaps, `seed ${seed}`).toBe(0);
    expect(jumps, `seed ${seed}`).toBeGreaterThan(50);
  }
});

it('latestSafe jumps later than earliestSafe for the same cactus', () => {
  const w = createWorld({ seed: 4, playerId: 'demo', timeline: constantTimeline(6), invincible: true, boxes: false });
  while (nextObstacle(w) === null) stepWorld(w, NO_INPUT);
  const target = nextObstacle(w)!.index;
  const stepOfJump = (policy: (w: World) => boolean): number => {
    const c = cloneWorld(w);
    for (let i = 0; i < 300; i++) {
      const step = c.step;
      if (stepWorld(c, botInput(c, policy)).jumped) return step;
    }
    throw new Error('no jump');
  };
  const early = stepOfJump(earliestSafe);
  const late = stepOfJump(latestSafe);
  expect(late).toBeGreaterThan(early);
  // both jumps clear that cactus without a touch
  for (const policy of [earliestSafe, latestSafe]) {
    const c = cloneWorld(w);
    let touched = false;
    while (!passed(c, target)) touched ||= stepWorld(c, botInput(c, policy)).overlap;
    expect(touched).toBe(false);
  }
  // and a jump one step after the latest safe one hits it
  const c = cloneWorld(w);
  while (c.step < late) stepWorld(c, NO_INPUT);
  expect(clears(c, 0)).toBe(true);
  expect(clears(c, 1)).toBe(false);
});

it('asks nothing of a dino in the air, never ducks and never lets go of the key', () => {
  const w = createWorld({ seed: 2, playerId: 'demo', timeline: constantTimeline(6), invincible: true, boxes: false });
  for (let i = 0; i < 3000; i++) {
    const input = botInput(w, earliestSafe);
    expect([input.jumpReleased, input.duckPressed, input.duckHeld]).toEqual([false, false, false]);
    if (w.trex.jumping) expect(input.jumpPressed).toBe(false);
    stepWorld(w, input);
  }
});

it('clears nothing that is not there or too far away', () => {
  const w = createWorld({ seed: 1, playerId: 'solo', boxes: false });
  expect(clears(w, 0)).toBe(false); // no obstacle in the first 180 steps
  expect(earliestSafe(w)).toBe(false);
  expect(latestSafe(w)).toBe(false);
});

it('every placed box can be taken by a last-moment jumper, who then clears the next obstacle', () => {
  let checked = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const main = createWorld({ seed, playerId: 'solo', invincible: true, applySkills: false });
    for (let n = 0; n <= 7; n++) {
      const box = main.boxes!.get(n);
      if (!box) continue;
      const i = box.gapAfter;
      const where = `seed ${seed}, box ${n} after obstacle ${i}`;
      // main runs with no input until the obstacle before the one in front of the gap is behind the dino
      if (i === 0) while (main.end === 0) stepWorld(main, NO_INPUT);
      else while (!passed(main, i - 1)) stepWorld(main, NO_INPUT);
      const sim = cloneWorld(main);
      let picked = false;
      let touched = false;
      for (let k = 0; k < 2000 && !passed(sim, i + 1); k++) {
        const ev: StepEvents = stepWorld(sim, botInput(sim, latestSafe));
        if (ev.picked?.n === n) picked = true;
        if (ev.overlap) touched = true;
      }
      expect(passed(sim, i + 1), where).toBe(true);
      expect(touched, `${where}: touched an obstacle`).toBe(false);
      expect(picked, `${where}: missed the box`).toBe(true);
      checked += 1;
    }
  }
  expect(checked).toBeGreaterThan(150);
});
