import { expect, it } from 'vitest';
import { BASE_TIMELINE, TimelineTable, constantTimeline, scoreOf } from '../../shared/sim/timeline';

const t = new TimelineTable(BASE_TIMELINE);

it('starts at 6, adds 0.001 per step and stops at 13 from step 7000', () => {
  expect([0, 1000, 7000, 20000].map(s => t.speedAt(s))).toEqual([6, 7, 13, 13]);
});

it('matches the original after 180 steps', () => {
  expect(t.scrollAfter(179)).toBe(1080);
  expect(t.distanceAfter(179)).toBeCloseTo(1096.11, 9);
  expect(scoreOf(t.distanceAfter(179))).toBe(27);
  expect(t.scrollAfter(180)).toBe(1086);
});

it('reaches the top speed at step 7000', () => {
  expect(t.scrollAfter(6999)).toBe(63000);
  expect(t.distanceAfter(6999)).toBe(66496.5);
  expect(t.scrollAfter(7000)).toBe(63013);
});

it('finds steps by score and by scroll', () => {
  expect(t.firstStepWithScore(100)).toBe(630);
  expect(t.firstStepWithScore(700)).toBe(3589);
  expect(t.firstStepWithScroll(1081)).toBe(180);
  expect(t.firstStepWithScroll(1086)).toBe(180);
});

it('scores round(ceil(distance) × 0.025)', () => {
  expect([0, 19, 19.9, 20, 59.9].map(scoreOf)).toEqual([0, 0, 1, 1, 2]);
});

it('keeps a constant timeline constant', () => {
  const c = new TimelineTable(constantTimeline(6));
  expect(c.scrollAfter(99)).toBe(600);
  expect(c.distanceAfter(99)).toBe(600);
});

it('gives the same numbers whichever step is asked for first', () => {
  const cold = new TimelineTable(BASE_TIMELINE);
  expect(cold.distanceAfter(6999)).toBe(66496.5);
  expect(cold.scrollAfter(179)).toBe(1080);
  expect(cold.distanceAfter(179)).toBe(t.distanceAfter(179));
});

it('counts nothing before step 0 and refuses steps that are not whole numbers', () => {
  expect(t.scrollAfter(-1)).toBe(0);
  expect(t.distanceAfter(-1)).toBe(0);
  for (const step of [0.5, NaN, Infinity]) {
    expect(() => t.scrollAfter(step)).toThrow(RangeError);
    expect(() => t.distanceAfter(step)).toThrow(RangeError);
  }
});

it('finds the first step that gets there, not just any step', () => {
  for (const timeline of [BASE_TIMELINE, constantTimeline(6)]) {
    const table = new TimelineTable(timeline);
    for (const scroll of [1, 6, 7, 1080, 1081, 63013, 63014, 1_000_000]) {
      const step = table.firstStepWithScroll(scroll);
      expect(table.scrollAfter(step)).toBeGreaterThanOrEqual(scroll);
      if (step > 0) expect(table.scrollAfter(step - 1)).toBeLessThan(scroll);
    }
    for (const score of [1, 2, 27, 100, 700, 5000]) {
      const step = table.firstStepWithScore(score);
      expect(scoreOf(table.distanceAfter(step))).toBeGreaterThanOrEqual(score);
      if (step > 0) expect(scoreOf(table.distanceAfter(step - 1))).toBeLessThan(score);
    }
  }
});
