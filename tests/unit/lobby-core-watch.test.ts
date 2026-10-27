import { expect, it } from 'vitest';
import { COUNTDOWN_MS, RESULTS_MS } from '../../shared/lobby/core';
import type { RunState } from '../../shared/lobby/protocol';
import { lobbyHarness, runAt } from './helpers/lobby-harness';
import type { Harness } from './helpers/lobby-harness';

/** NICK (c1), RARA (c2) and BUDI (c3) race; BUDI is out at 1 s; the mailboxes are empty and nothing is left to save. */
function threeRace(h: Harness): void {
  h.hello('c1', 'NICK');
  h.hello('c2', 'RARA');
  h.hello('c3', 'BUDI');
  h.send('c1', { type: 'start' });
  h.advance(COUNTDOWN_MS);
  h.alarm();
  h.advance(1000);
  h.send('c3', { type: 'dead', d: 500 });
  h.clear();
  h.core.takeDirty();
}

const relays = (h: Harness, conn: string) => h.inbox(conn).filter((m) => m.type === 'relay');

it('lets a runner who is out watch one still running, and tells everyone who watches whom', () => {
  const h = lobbyHarness();
  threeRace(h);
  h.watch('c3', 'p1');
  for (const c of ['c1', 'c2', 'c3']) {
    expect(h.last(c, 'watching')).toEqual({ type: 'watching', pairs: [{ id: 'p3', target: 'p1' }] });
  }
  expect(h.core.takeDirty()).toBe(false);
});

it("sends a runner's states to those watching them, and only to them, as the lobby capped them", () => {
  const h = lobbyHarness();
  threeRace(h);
  h.watch('c3', 'p1');
  h.clear();
  h.advance(100);
  h.send('c1', runAt(1100, 650));
  h.send('c2', runAt(1100, 640));
  h.send('c1', runAt(1200, 99_999)); // past the cap
  const { type: _, ...plain } = runAt(1100, 650);
  expect(relays(h, 'c3')[0]).toEqual({ type: 'relay', id: 'p1', state: plain });
  expect((relays(h, 'c3')[1] as { state: RunState }).state.d).toBeLessThan(99_999);
  expect(relays(h, 'c3')).toHaveLength(2);
  expect(relays(h, 'c2')).toEqual([]);
});

it('sends the last state at once to a new watcher, and again on the same watch, which changes nothing else', () => {
  const h = lobbyHarness();
  threeRace(h);
  h.send('c1', runAt(1000, 600));
  h.clear();
  h.watch('c3', 'p1');
  expect(relays(h, 'c3')).toHaveLength(1);
  h.clear();
  h.watch('c3', 'p1');
  expect(relays(h, 'c3')).toHaveLength(1);
  expect(h.last('c1', 'watching')).toBeUndefined();
});

it('moves a watcher who switches to the end of the line', () => {
  const h = lobbyHarness();
  threeRace(h);
  h.hello('c4', 'DIKA'); // comes in mid-round
  h.watch('c3', 'p2');
  h.watch('c4', 'p1');
  h.watch('c3', 'p1');
  expect(h.last('c1', 'watching')!.pairs).toEqual([{ id: 'p4', target: 'p1' }, { id: 'p3', target: 'p1' }]);
});

it('ignores a watch from a runner still running, of one who is out, of oneself, of someone not in the round, or outside a round', () => {
  const h = lobbyHarness();
  threeRace(h);
  h.hello('c4', 'DIKA');
  h.clear();
  h.watch('c1', 'p2'); // NICK still runs
  h.watch('c4', 'p3'); // BUDI is out
  h.watch('c3', 'p3'); // BUDI himself
  h.watch('c3', 'p4'); // DIKA is not in the round
  h.watch('c3', 'p9'); // nobody
  for (const c of ['c1', 'c2', 'c3', 'c4']) expect(h.inbox(c)).toEqual([]);
  h.send('c1', { type: 'dead', d: 400 });
  h.send('c2', { type: 'dead', d: 300 });
  h.advance(RESULTS_MS);
  h.alarm();
  h.clear();
  h.watch('c3', 'p1'); // back in the lobby
  for (const c of ['c1', 'c2', 'c3', 'c4']) expect(h.inbox(c)).toEqual([]);
});

it('drops a watcher whose connection closes', () => {
  const h = lobbyHarness();
  threeRace(h);
  h.watch('c3', 'p1');
  h.clear();
  h.close('c3');
  for (const c of ['c1', 'c2']) expect(h.last(c, 'watching')).toEqual({ type: 'watching', pairs: [] });
});

it("gives a player who comes in mid-round the countdown with every runner's name, the tower and who watches whom", () => {
  const h = lobbyHarness();
  threeRace(h);
  h.watch('c3', 'p1');
  h.hello('c4', 'DIKA');
  expect(h.inbox('c4').map((m) => m.type)).toEqual(['welcome', 'lobby', 'countdown', 'tower', 'watching']);
  expect(h.last('c4', 'countdown')!.runners).toEqual([
    { id: 'p1', name: 'NICK' }, { id: 'p2', name: 'RARA' }, { id: 'p3', name: 'BUDI' },
  ]);
  expect(h.last('c4', 'watching')!.pairs).toEqual([{ id: 'p3', target: 'p1' }]);
});

it('forgets who watched whom when the round ends', () => {
  const h = lobbyHarness();
  threeRace(h);
  h.watch('c3', 'p1');
  h.clear();
  h.send('c1', { type: 'dead', d: 400 });
  h.send('c2', { type: 'dead', d: 300 });
  expect(h.last('c1', 'end')).toBeDefined();
  for (const c of ['c1', 'c2', 'c3']) expect(h.last(c, 'watching')).toEqual({ type: 'watching', pairs: [] });
});
