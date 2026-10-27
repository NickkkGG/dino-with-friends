import { expect, it } from 'vitest';
import * as B from '../../src/game/bitmaps';

const SIZES: Record<string, [number, number]> = {
  BOX: [16, 16], HEART: [7, 6], HEART_EMPTY: [7, 6], SPARK: [7, 7], SWEAT: [3, 5], PUFF: [10, 4], ICON_DOUBLE_JUMP: [7, 7],
  ICON_SPEED: [9, 7], ICON_GHOST: [7, 7], SPEAKER_ON: [9, 7], SPEAKER_OFF: [9, 7], HAND: [4, 3],
};

it('every bitmap is a clean rectangle of # and .', () => {
  const all = B as unknown as Record<string, readonly string[]>;
  expect(Object.keys(all).sort()).toEqual(Object.keys(SIZES).sort());
  for (const [name, [w, h]] of Object.entries(SIZES)) {
    const rows = all[name]!;
    expect(rows.length, name).toBe(h);
    for (const row of rows) {
      expect(row.length, name).toBe(w);
      expect(row, name).toMatch(/^[#.]+$/);
    }
    expect(rows.join(''), name).toContain('#');
  }
});

it('keeps the new bitmaps cell for cell', () => {
  expect(B.SPARK).toEqual(['#.....#', '.#...#.', '...#...', '..###..', '...#...', '.#...#.', '#.....#']);
  expect(B.SWEAT).toEqual(['.#.', '.#.', '###', '###', '.#.']);
  expect(B.HAND).toEqual(['###.', '####', '.##.']);
  expect(B.PUFF).toEqual(['..##..##..', '.#..##..#.', '#........#', '.########.']);
  expect(B.ICON_DOUBLE_JUMP).toEqual(['...#...', '..###..', '.#####.', '...#...', '..###..', '.#####.', '...#...']);
  expect(B.HEART).toEqual(['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...']);
  expect(B.HEART_EMPTY).toEqual(['.##.##.', '#..#..#', '#.....#', '.#...#.', '..#.#..', '...#...']);
  expect(B.ICON_SPEED).toEqual(['#...#....', '.#...#...', '..#...#..', '...#...#.', '..#...#..', '.#...#...', '#...#....']);
  expect(B.BOX[0]).toBe('################');
  expect(B.BOX[4]).toBe('#.#...####...#.#'); // the top of the "?"
  expect(B.BOX[11]).toBe('#.#.....#....#.#'); // its dot
});

it('the speaker shows waves when on and a cross when off, with the same body', () => {
  const body = (rows: readonly string[]) => rows.map((r) => r.slice(0, 4));
  expect(body(B.SPEAKER_OFF)).toEqual(body(B.SPEAKER_ON));
  expect(B.SPEAKER_ON.map((r) => r.slice(5)).join('')).not.toBe(B.SPEAKER_OFF.map((r) => r.slice(5)).join(''));
});
