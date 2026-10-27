import { expect, it } from 'vitest';
import { LobbyCore } from '../../shared/lobby/core';
import { VERSION, lobbyHarness, race, row, runAt } from './helpers/lobby-harness';

it('gives each new seat a token in its welcome', () => {
  const h = lobbyHarness();
  h.hello('c1', 'NICK');
  h.hello('c2', 'RARA');
  expect(h.last('c1', 'welcome')).toEqual({ type: 'welcome', you: 'p1', token: 't1', code: 'K7RM2Q' });
  expect(h.last('c2', 'welcome')).toEqual({ type: 'welcome', you: 'p2', token: 't2', code: 'K7RM2Q' });
});

it('turns away a hello from another build, and closes it', () => {
  const h = lobbyHarness();
  h.send('c1', { type: 'hello', v: 'old', name: 'NICK', token: null });
  h.send('c2', { type: 'hello', v: '', name: 'RARA', token: null }); // a hello without v reads as v ''
  for (const c of ['c1', 'c2']) expect(h.inbox(c)).toEqual([{ type: 'error', code: 'VERSION_MISMATCH' }]);
  expect(h.closed).toEqual(['c1', 'c2']);
  expect(h.core.saved().players).toEqual([]);
});

it('keeps the seat of a player whose connection drops, as away', () => {
  const h = lobbyHarness();
  h.hello('c1', 'NICK');
  h.hello('c2', 'RARA');
  h.close('c2');
  expect(h.last('c1', 'lobby')!.players.map((p) => [p.id, p.connected])).toEqual([['p1', true], ['p2', false]]);
  h.clear();
  h.send('c1', { type: 'leave' });
  expect(h.inbox('c2')).toEqual([]); // nothing goes to a connection that is gone
});

it("gives the seat back to a hello with its token, under the seat's own name", () => {
  const h = lobbyHarness();
  h.hello('c1', 'NICK');
  h.hello('c2', 'RARA');
  h.close('c2');
  h.hello('c3', 'SOMEONE', 't2');
  expect(h.last('c3', 'welcome')).toEqual({ type: 'welcome', you: 'p2', token: 't2', code: 'K7RM2Q' });
  expect(h.last('c1', 'lobby')!.players).toEqual([
    { id: 'p1', name: 'NICK', host: true, connected: true, playing: false },
    { id: 'p2', name: 'RARA', host: false, connected: true, playing: false },
  ]);
});

it('takes a seat back from a connection still open, which is told REPLACED and closed', () => {
  const h = lobbyHarness();
  h.hello('c1', 'NICK');
  h.hello('c2', 'RARA');
  h.hello('c3', 'RARA', 't2');
  expect(h.last('c2', 'error')).toEqual({ type: 'error', code: 'REPLACED' });
  expect(h.closed).toEqual(['c2']);
  expect(h.last('c3', 'welcome')!.you).toBe('p2');
  h.clear();
  h.close('c2'); // the old socket's own close comes later, and changes nothing
  expect(h.inbox('c1')).toEqual([]);
});

it('makes a new seat for a token no seat has', () => {
  const h = lobbyHarness();
  h.hello('c1', 'NICK', 'nope');
  expect(h.last('c1', 'welcome')).toEqual({ type: 'welcome', you: 'p1', token: 't1', code: 'K7RM2Q' });
});

it('keeps the host while the host is away', () => {
  const h = lobbyHarness();
  h.hello('c1', 'NICK');
  h.hello('c2', 'RARA');
  h.close('c1');
  h.send('c2', { type: 'start' });
  expect(h.last('c2', 'error')).toEqual({ type: 'error', code: 'NOT_HOST' });
  expect(h.last('c2', 'lobby')!.players[0]).toMatchObject({ id: 'p1', host: true, connected: false });
});

it('hands the host on to the earliest connected player when the host leaves', () => {
  const h = lobbyHarness();
  h.hello('c1', 'NICK');
  h.hello('c2', 'RARA');
  h.hello('c3', 'BUDI');
  h.close('c2');
  h.send('c1', { type: 'leave' });
  expect(h.last('c3', 'lobby')!.players.map((p) => [p.id, p.host])).toEqual([['p2', false], ['p3', true]]);
});

it('starts with the connected players only, and needs two of them', () => {
  const h = lobbyHarness();
  h.hello('c1', 'NICK');
  h.hello('c2', 'RARA');
  h.hello('c3', 'BUDI');
  h.close('c3');
  h.send('c1', { type: 'start' });
  expect(h.last('c1', 'lobby')!.players.map((p) => p.playing)).toEqual([true, true, false]);
  expect(h.last('c1', 'tower')!.rows.map((r) => r.id)).toEqual(['p1', 'p2']);
  const g = lobbyHarness();
  g.hello('c1', 'NICK');
  g.hello('c2', 'RARA');
  g.close('c2');
  g.send('c1', { type: 'start' });
  expect(g.last('c1', 'countdown')).toBeUndefined();
});

it('counts seats, not connections, toward a full lobby', () => {
  const h = lobbyHarness();
  for (let i = 1; i <= 8; i++) h.hello(`c${i}`, `P${i}`);
  h.close('c8');
  h.hello('c9', 'LATE');
  expect(h.last('c9', 'error')).toEqual({ type: 'error', code: 'LOBBY_FULL' });
  h.hello('c10', 'P8', 't8');
  expect(h.last('c10', 'welcome')!.you).toBe('p8');
});

it('keeps a runner whose connection drops in the round until 10 s without a state', () => {
  const h = lobbyHarness();
  race(h); // NICK (c1) and RARA (c2), at the round's first step
  h.advance(1000);
  h.send('c1', runAt(1000, 600));
  h.send('c2', runAt(1000, 600));
  h.advance(100);
  h.close('c2');
  h.advance(7900);
  h.send('c1', runAt(9000, 5400)); // NICK runs on
  h.advance(1999);
  h.alarm();
  expect(row(h, 'c1', 'p2')!.alive).toBe(true);
  h.advance(1);
  h.alarm(); // 10 s after RARA's last state
  expect(row(h, 'c1', 'p2')).toEqual({ id: 'p2', score: 15, hp: 0, alive: false });
});

it('gives a runner who comes back the round again, and takes their states', () => {
  const h = lobbyHarness();
  race(h);
  h.close('c2');
  h.hello('c3', 'RARA', 't2');
  expect(h.inbox('c3').map((m) => m.type)).toEqual(['welcome', 'lobby', 'countdown', 'tower', 'watching']);
  h.advance(1000);
  h.send('c3', runAt(1000, 600));
  expect(row(h, 'c1', 'p2')).toMatchObject({ score: 15, alive: true });
});

it('comes back from what it saved with those whose sockets are gone as away', () => {
  const h = lobbyHarness();
  h.hello('c1', 'NICK');
  h.hello('c2', 'RARA');
  const copy = LobbyCore.restore(h.core.saved(), { seeds: () => 7, tokens: () => 'x', version: VERSION }, h.now + 50, new Set(['c1']));
  expect(copy.saved().players.map((p) => [p.id, p.connected, p.awaySince])).toEqual([['p1', true, null], ['p2', false, h.now + 50]]);
});
