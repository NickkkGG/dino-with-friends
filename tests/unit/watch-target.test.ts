import { expect, it } from 'vitest';
import type { TowerRow } from '../../shared/lobby/protocol';
import { nextAlive, topAlive, watchersOf } from '../../src/app/watch-target';

const row = (id: string, score: number, alive = true): TowerRow => ({ id, score, hp: alive ? 3 : 0, alive });

it('watches the top runner still running, never oneself', () => {
  expect(topAlive([row('p2', 90), row('p1', 80), row('p3', 70)], 'p2')).toBe('p1');
  expect(topAlive([row('p2', 90, false), row('p3', 70)], 'p1')).toBe('p3');
  expect(topAlive([row('p1', 90, false)], 'p2')).toBeNull();
});

it('switches along the tower, round the ends, over those who are out', () => {
  const rows = [row('p1', 90), row('p2', 80, false), row('p3', 70), row('p4', 60)];
  expect(nextAlive(rows, 'p1', 1, 'p5')).toBe('p3');
  expect(nextAlive(rows, 'p4', 1, 'p5')).toBe('p1');
  expect(nextAlive(rows, 'p1', -1, 'p5')).toBe('p4');
  expect(nextAlive(rows, 'p3', 1, 'p4')).toBe('p1');
  expect(nextAlive(rows, 'p2', 1, 'p5')).toBe('p1'); // from one who is out: the top
  expect(nextAlive([row('p1', 9)], 'p1', 1, null)).toBe('p1');
});

it('lists who watches a screen in the order they began, with their names', () => {
  const names = new Map([['p1', 'NICK'], ['p3', 'BUDI'], ['p4', 'DIKA']]);
  const pairs = [{ id: 'p4', target: 'p1' }, { id: 'p5', target: 'p2' }, { id: 'p3', target: 'p1' }];
  expect(watchersOf(pairs, 'p1', names, 'p3')).toEqual([
    { id: 'p4', name: 'DIKA', me: false }, { id: 'p3', name: 'BUDI', me: true },
  ]);
});
