import { expect, it } from 'vitest';
import { STEP_MS } from '../../shared/sim/constants';
import { MAX_CATCHUP_STEPS, stepsDue } from '../../src/game/race-clock';

it('runs nothing before the start', () => {
  expect(stepsDue(0, -5)).toEqual({ skip: 0, run: 0 });
  expect(stepsDue(0, 0)).toEqual({ skip: 0, run: 0 });
});

it('runs the steps that are due', () => {
  expect(stepsDue(0, 10 * STEP_MS)).toEqual({ skip: 0, run: 10 });
  expect(stepsDue(4, 10.9 * STEP_MS)).toEqual({ skip: 0, run: 6 });
});

it('counts a step as due on a whole-ms clock that lands right on it', () => {
  expect(stepsDue(0, 50)).toEqual({ skip: 0, run: 3 }); // 50 / (1000 / 60) is a hair under 3 in floating point
});

it('catches up 250 ms at most and drops the rest', () => {
  expect(MAX_CATCHUP_STEPS).toBe(15);
  expect(stepsDue(0, 15 * STEP_MS)).toEqual({ skip: 0, run: 15 });
  expect(stepsDue(0, 40 * STEP_MS)).toEqual({ skip: 25, run: 15 });
});

it('waits when it is ahead', () => {
  expect(stepsDue(12, 10 * STEP_MS)).toEqual({ skip: 0, run: 0 });
});
