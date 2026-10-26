import { expect, it } from 'vitest';
import { createWorld } from '../../shared/sim/world';
import { HEART, HEART_EMPTY } from '../../src/game/bitmaps';
import { INK, PAPER } from '../../src/game/colors';
import { drawHearts, drawSkills, heartSlots, hudCells } from '../../src/game/draw/hud';
import { callsOf, fillsIn } from './helpers/fake-ctx';
import { fakeDc } from './helpers/fake-dc';

const world = () => createWorld({ seed: 1, playerId: 'solo' });

it('heartSlots shows 3 slots or the current hearts, whichever is more', () => {
  expect([0, 1, 3, 4, 5].map(heartSlots)).toEqual([3, 3, 3, 4, 5]);
});

it('places skills after the hearts in a fixed order with their time left', () => {
  const w = world();
  w.hp = 4;
  w.skillUntil.speed = w.step + 180;
  w.skillUntil.ghost = w.step + 150; // half of its 300 steps
  expect(hudCells(4, w)).toEqual({
    hearts: [0, 9, 18, 27],
    skills: [{ id: 'ghost', cx: 39, frac: 0.5 }, { id: 'speed', cx: 87, frac: 1 }],
  });
  w.skillUntil.doubleJump = w.step + 60;
  expect(hudCells(3, w).skills.map((s) => [s.id, s.cx])).toEqual([['doubleJump', 30], ['ghost', 78], ['speed', 126]]);
  expect(hudCells(3, world()).skills).toEqual([]);
});

it('drawHearts: hearts 9 cells apart in 1.5 px cells; the last heart blinks twice a second with one left', () => {
  // at k 2 a cell is 3 device pixels, so every rect is 3 × 3 on a 3 px grid from (16, 14)
  const inked = (rows: readonly string[]) => rows.join('').split('').filter((c) => c === '#').length;
  const full = inked(HEART);
  const empty = inked(HEART_EMPTY);
  const rects = (hp: number, step: number) => {
    const { dc, calls } = fakeDc(2);
    drawHearts(dc, 8, 7, hp, step);
    expect(dc.ctx.fillStyle).toBe(INK);
    return fillsIn(calls, INK);
  };
  const two = rects(2, 0);
  expect(two).toHaveLength(2 * full + empty);
  for (const [x, y, w, h] of two) {
    expect([w, h]).toEqual([3, 3]);
    expect([(x! - 16) % 3, (y! - 14) % 3]).toEqual([0, 0]);
  }
  expect(Math.max(...two.map((r) => r[0]!))).toBe(16 + (18 + 6) * 3); // the third slot ends 24 cells along
  expect(rects(1, 0)).toHaveLength(full + 2 * empty);
  expect(rects(1, 15)).toHaveLength(2 * empty); // the last heart off for 15 steps
  expect(rects(1, 30)).toHaveLength(full + 2 * empty);
  expect(rects(2, 15)).toHaveLength(2 * full + empty); // no blinking with two
});

it('drawSkills: an icon, a frame 26 × 6 cells from cell 16, and a bar of round(22 × time left) cells', () => {
  const w = world();
  w.skillUntil.speed = w.step + 90; // half
  const { dc, calls } = fakeDc(2);
  drawSkills(dc, 20, 7, w);
  const rects = fillsIn(calls, INK);
  // world (20, 7) is device (40, 14); cell c is 3 px
  expect(rects).toContainEqual([40 + 16 * 3, 14, 26 * 3, 3]); // the frame's top
  expect(rects).toContainEqual([40 + 16 * 3, 14 + 5 * 3, 26 * 3, 3]); // its bottom
  expect(rects).toContainEqual([40 + 18 * 3, 14 + 2 * 3, 11 * 3, 2 * 3]); // the bar: 11 of 22 cells
  expect(rects.every((r) => r[0]! >= 40 && r[0]! + r[2]! <= 40 + 42 * 3)).toBe(true); // one skill, 42 cells wide
});

it('the HUD is outlined in paper, so a dino jumping through it cannot hide it', () => {
  const w = world();
  w.skillUntil.ghost = w.step + 300;
  const { dc, calls } = fakeDc(2);
  drawHearts(dc, 8, 7, 2, 0);
  drawSkills(dc, 20, 7, w);
  const halo = fillsIn(calls, PAPER);
  // the cell just left of the first heart's top row
  expect(halo).toContainEqual([16 - 3, 14, 3, 3]);
  // behind the bar: the whole frame and one cell more on every side
  expect(halo).toContainEqual([40 + 15 * 3, 14 - 3, 28 * 3, 8 * 3]);
  // and every outline is drawn before the ink it goes round
  const order = calls.filter((c) => c.op === 'set fillStyle').map((c) => c.args[0]);
  expect(order[0]).toBe(PAPER);
  expect(callsOf(calls, 'fillRect').length).toBe(fillsIn(calls, PAPER).length + fillsIn(calls, INK).length);
});
