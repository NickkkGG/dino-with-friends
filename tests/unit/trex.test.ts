import { expect, it } from 'vitest';
import { GROUND_Y } from '../../shared/sim/constants';
import { airJump, createTrex, endJump, resetTrex, setSpeedDrop, startJump, updateJump } from '../../shared/sim/trex';
import type { TrexState } from '../../shared/sim/trex';

interface Plan {
  releaseBefore?: number;
  dropBefore?: number;
  airBefore?: number;
}

// One jump from the ground, step by step, up to and including the step it lands on.
// The plan says before which step the jump key is let go (endJump), ↓ is pressed (setSpeedDrop) or the air jump is made.
function fly(speed: number, plan: Plan = {}): { ys: number[]; trex: TrexState } {
  const trex = createTrex(24);
  startJump(trex, speed);
  const ys: number[] = [];
  for (let step = 1; step <= 200; step++) {
    if (plan.releaseBefore === step) endJump(trex);
    if (plan.dropBefore === step) setSpeedDrop(trex);
    if (plan.airBefore === step) airJump(trex, speed);
    const landed = updateJump(trex);
    ys.push(trex.y);
    if (landed) return { ys, trex };
  }
  throw new Error('the jump never came down');
}

// The dino's y after each step; the last value is the landing, GROUND_Y.
const jumpYs = (speed: number, plan: Plan = {}): number[] => fly(speed, plan).ys;

it('full jump at speed 6 follows the original curve', () => {
  expect(jumpYs(6)).toEqual([82, 72, 63, 54, 46, 38, 31, 25, 20, 16, 12, 9, 6, 4, 3, 2, 2, 2, 3, 5, 7, 10, 13, 17,
    22, 27, 33, 39, 46, 54, 62, 71, 80, 90, 93]);
});

it.each([[10, 33, 6], [13, 34, 3], [19.5, 34, -1]])('speed %s: %s steps, top at y %s', (v, steps, top) => {
  const ys = jumpYs(v);
  expect(ys.length).toBe(steps);
  expect(Math.min(...ys)).toBe(top);
});

it.each([[2, 35, 2], [3, 35, 2], [4, 35, 2], [5, 28, 31], [6, 30, 23], [7, 32, 15], [8, 33, 8], [9, 35, 2]])(
  'release before step %s: %s steps, top at y %s', (n, steps, top) => {
    const ys = jumpYs(6, { releaseBefore: n });
    expect(ys.length).toBe(steps);
    expect(Math.min(...ys)).toBe(top);
  });

it('speed drop before step 8 lands on step 15', () => {
  expect(jumpYs(6, { dropBefore: 8 })).toEqual([82, 72, 63, 54, 46, 38, 31, 34, 39, 46, 54, 64, 76, 90, 93]);
});

it('air jump restarts the jump once', () => {
  const a = jumpYs(6, { airBefore: 10 });
  expect(a.length).toBe(38);
  expect(Math.min(...a)).toBe(-14);
  const b = jumpYs(6, { airBefore: 30 });
  expect(b.length).toBe(58);
  expect(Math.min(...b)).toBe(2);
  const t = createTrex(24);
  startJump(t, 6);
  updateJump(t);
  expect(airJump(t, 6)).toBe(true);
  expect(airJump(t, 6)).toBe(false);
});

it('ignores a second startJump while jumping or ducking, and resetTrex lands at once', () => {
  expect(createTrex(7)).toEqual({
    x: 7, y: GROUND_Y, vy: 0, jumping: false, ducking: false, speedDrop: false, reachedMinHeight: false, airJumpUsed: false,
  });

  const t = createTrex(7);
  expect(startJump(t, 6)).toBe(true);
  updateJump(t);
  updateJump(t);
  const inTheAir = { ...t };
  expect(startJump(t, 13)).toBe(false);
  expect(t).toEqual(inTheAir); // the second press changes nothing, not even the speed of the jump

  const ducking = { ...createTrex(7), ducking: true };
  expect(startJump(ducking, 6)).toBe(false);
  expect(ducking).toEqual({ ...createTrex(7), ducking: true });

  setSpeedDrop(t);
  t.ducking = true;
  t.airJumpUsed = true;
  resetTrex(t);
  expect(t).toEqual(createTrex(7)); // on the ground at once, every jump and duck flag off, x where it was
});

it('does nothing to a dino that is not jumping', () => {
  const t = createTrex(24);
  expect(updateJump(t)).toBe(false);
  expect(t).toEqual(createTrex(24));
});

it('gives one air jump per jump, and none on the ground', () => {
  const t = createTrex(24);
  expect(airJump(t, 6)).toBe(false);
  expect(t).toEqual(createTrex(24));

  startJump(t, 6);
  updateJump(t);
  setSpeedDrop(t);
  expect(airJump(t, 6)).toBe(true);
  expect(t.vy).toBe(-10.6); // the same push as the first jump at this speed
  expect(t.speedDrop).toBe(false);
  expect(t.reachedMinHeight).toBe(false);
  expect(t.airJumpUsed).toBe(true);
  expect(airJump(t, 6)).toBe(false);

  const landed = fly(6, { airBefore: 10 }).trex;
  expect(landed.airJumpUsed).toBe(false); // landing gives the air jump back
  expect(startJump(landed, 6)).toBe(true);
  expect(airJump(landed, 6)).toBe(true);

  const stale = { ...createTrex(24), airJumpUsed: true };
  startJump(stale, 6);
  expect(stale.airJumpUsed).toBe(false); // so does a new jump from the ground
});

it('an air jump starts afresh: letting go of the key before it has climbed past y 63 does not cut it short', () => {
  // The dino air-jumps at y 80 on its way down, and is at y 69 after that first step, still below the line at 63.
  const held = jumpYs(6, { airBefore: 34 });
  expect(held.length).toBe(66);
  expect(Math.min(...held)).toBe(2);
  expect(jumpYs(6, { airBefore: 34, releaseBefore: 35 })).toEqual(held); // too early to count
  const cut = jumpYs(6, { airBefore: 34, releaseBefore: 36 }); // at y 59 by now, so it counts
  expect(cut.length).toBe(58);
  expect(Math.min(...cut)).toBe(2);
});

it('lands standing, or into a duck when it fell fast with ↓ still held', () => {
  expect(fly(6).trex).toEqual(createTrex(24));
  expect(fly(6, { airBefore: 10 }).trex).toEqual(createTrex(24));
  expect(fly(6, { dropBefore: 8 }).trex).toEqual({ ...createTrex(24), ducking: true });
});
