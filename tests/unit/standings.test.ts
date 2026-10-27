import { expect, it } from 'vitest';
import { STEP_MS } from '../../shared/sim/constants';
import { DISTANCE_SLACK, MAX_STEP_DISTANCE, clampRun, rankStandings, roundOver } from '../../shared/lobby/standings';
import type { Standing } from '../../shared/lobby/standings';

const row = (id: string, score: number, alive = true, diedAt: number | null = null, joinOrder = 0): Standing => ({
  id, score, alive, diedAt, joinOrder,
});

it('ranks by score, then alive, then the later death, then the earlier join', () => {
  const ids = (r: Standing[]) => rankStandings(r).map((x) => x.id);
  expect(ids([row('a', 10), row('b', 20)])).toEqual(['b', 'a']);
  expect(ids([row('a', 20, false, 5, 1), row('b', 20, true, null, 2)])).toEqual(['b', 'a']);
  expect(ids([row('a', 20, false, 5, 1), row('b', 20, false, 9, 2)])).toEqual(['b', 'a']);
  expect(ids([row('a', 20, true, null, 2), row('b', 20, true, null, 1)])).toEqual(['b', 'a']);
});

it('ranks a copy and leaves the rows it was given as they were', () => {
  const rows = [row('a', 10), row('b', 20)];
  rankStandings(rows);
  expect(rows.map((r) => r.id)).toEqual(['a', 'b']);
});

it('ends a round only once every runner is out, however far ahead the last one is', () => {
  expect(roundOver([row('a', 5, false, 1), row('b', 9, false, 2)])).toBe(true);
  expect(roundOver([row('a', 5), row('b', 9)])).toBe(false);
  expect(roundOver([row('a', 51), row('b', 50, false, 1)])).toBe(false);
  expect(roundOver([row('a', 50), row('b', 50, false, 1)])).toBe(false);
  expect(roundOver([row('a', 49), row('b', 50, false, 1)])).toBe(false);
  expect(roundOver([row('a', 900), row('b', 10, false, 1), row('c', 20, false, 2)])).toBe(false);
  expect(roundOver([row('a', 0)])).toBe(false);
});

it('keeps a run within what the fastest dino could do', () => {
  expect(MAX_STEP_DISTANCE).toBe(19.5); // 13 px a step, 1.5 times as fast with SPEED
  const step = MAX_STEP_DISTANCE * DISTANCE_SLACK; // 21.45 a step
  expect(clampRun({ t: 0, d: 0 }, { t: 1000, d: 600 }, 1000)).toEqual({ t: 1000, d: 600 });
  const capped = clampRun({ t: 0, d: 0 }, { t: 1000, d: 5000 }, 1000);
  expect(capped.t).toBe(1000);
  expect(capped.d).toBeCloseTo((1000 / STEP_MS) * step, 9);
  expect(capped.d).toBeCloseTo(1287, 6);
  expect(clampRun({ t: 0, d: 0 }, { t: 9000, d: 100 }, 1000).t).toBe(2000);
  expect(clampRun({ t: 500, d: 300 }, { t: 400, d: 200 }, 1000)).toEqual({ t: 500, d: 300 });
});
