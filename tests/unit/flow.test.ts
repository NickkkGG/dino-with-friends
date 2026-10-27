import { expect, it } from 'vitest';
import { resultsOnShow } from '../../src/app/flow';

it('shows the results until they are left or the next countdown comes', () => {
  const end = { round: 1, results: [] };
  const cd = (round: number) => ({ round, seed: 1, startAt: 0, runners: [] });
  expect(resultsOnShow(end, 0, cd(1))).toBe(end);
  expect(resultsOnShow(end, 1, cd(1))).toBeNull();
  expect(resultsOnShow(end, 0, cd(2))).toBeNull();
  expect(resultsOnShow(null, 0, null)).toBeNull();
});
