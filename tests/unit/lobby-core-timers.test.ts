import { expect, it } from 'vitest';
import { EMPTY_MS, LobbyCore, SEAT_MS } from '../../shared/lobby/core';
import type { SavedLobby } from '../../shared/lobby/core';
import { VERSION, lobbyHarness } from './helpers/lobby-harness';

const OPTIONS = { seeds: () => 7, tokens: () => 'x', version: VERSION };

it('keeps an away seat for 2 minutes, then frees it', () => {
  const h = lobbyHarness();
  h.hello('c1', 'NICK');
  h.hello('c2', 'RARA');
  h.close('c2');
  expect(h.wakeAt).toBe(h.now + SEAT_MS);
  h.advance(SEAT_MS - 1);
  h.alarm();
  expect(h.last('c1', 'lobby')!.players.map((p) => p.id)).toEqual(['p1', 'p2']);
  h.advance(1);
  h.alarm();
  expect(h.last('c1', 'lobby')!.players.map((p) => p.id)).toEqual(['p1']);
  h.hello('c3', 'RARA', 't2');
  expect(h.last('c3', 'welcome')).toMatchObject({ you: 'p3', token: 't3' });
});

it("passes the host on when the host's seat is freed", () => {
  const h = lobbyHarness();
  h.hello('c1', 'NICK');
  h.hello('c2', 'RARA');
  h.close('c1');
  h.advance(SEAT_MS);
  h.alarm();
  expect(h.last('c2', 'lobby')!.players).toEqual([{ id: 'p2', name: 'RARA', host: true, connected: true, playing: false }]);
});

it('wakes for the soonest seat to free', () => {
  const h = lobbyHarness();
  for (const [c, n] of [['c1', 'NICK'], ['c2', 'RARA'], ['c3', 'BUDI']] as const) h.hello(c, n);
  h.close('c2');
  const first = h.now;
  h.advance(1000);
  h.close('c3');
  expect(h.wakeAt).toBe(first + SEAT_MS);
});

it('lets a lobby nobody joins expire 10 minutes after it was made', () => {
  const h = lobbyHarness();
  const made = h.now;
  h.alarm();
  expect([h.expired, h.wakeAt]).toEqual([false, made + EMPTY_MS]);
  h.advance(EMPTY_MS - 1);
  h.alarm();
  expect(h.expired).toBe(false);
  h.advance(1);
  h.alarm();
  expect(h.expired).toBe(true);
});

it('expires 10 minutes after the last one dropped or left, and never while anyone is connected', () => {
  const h = lobbyHarness();
  h.hello('c1', 'NICK');
  h.advance(3 * EMPTY_MS);
  h.alarm();
  expect([h.expired, h.wakeAt]).toEqual([false, null]);
  h.close('c1');
  const gone = h.now;
  expect(h.wakeAt).toBe(gone + SEAT_MS);
  h.advance(SEAT_MS);
  h.alarm(); // the seat is freed; the lobby lives on, empty
  expect(h.wakeAt).toBe(gone + EMPTY_MS);
  h.advance(EMPTY_MS - SEAT_MS - 1);
  h.hello('c2', 'RARA'); // someone is back in time
  h.send('c2', { type: 'leave' });
  const left = h.now;
  h.advance(EMPTY_MS - 1);
  h.alarm();
  expect(h.expired).toBe(false);
  expect(h.wakeAt).toBe(left + EMPTY_MS);
  h.advance(1);
  h.alarm();
  expect(h.expired).toBe(true);
});

it('only expires on its alarm', () => {
  const h = lobbyHarness();
  h.advance(EMPTY_MS);
  h.send('c9', { type: 'ping', c: 1 });
  expect(h.expired).toBe(false);
});

it('keeps its empty time through a restart', () => {
  const h = lobbyHarness();
  const made = h.now;
  const copy = LobbyCore.restore(h.core.saved(), OPTIONS, made + 5000, new Set());
  expect(copy.handle({ kind: 'alarm' }, made + EMPTY_MS).expired).toBe(true);
});

it('is saved as soon as it is made', () => {
  expect(lobbyHarness().core.takeDirty()).toBe(true);
});

it('brings back a lobby saved before seats had tokens with its seats away, freed 2 minutes later', () => {
  // As the build before this one saved it: no tokens, no connection state, no empty time.
  const saved = {
    code: 'K7RM2Q', nextJoin: 3, round: 0, phase: 'lobby', seed: 0, startAt: 0, endsAt: 0, runners: [], results: [],
    players: [
      { id: 'p1', conn: 'c1', name: 'NICK', joinOrder: 1, host: true, playing: false },
      { id: 'p2', conn: 'c2', name: 'RARA', joinOrder: 2, host: false, playing: false },
    ],
  } as unknown as SavedLobby;
  const now = 5_000_000;
  const copy = LobbyCore.restore(saved, OPTIONS, now, new Set());
  expect(copy.saved().players.map((p) => [p.id, p.token, p.connected, p.awaySince])).toEqual([
    ['p1', '', false, now],
    ['p2', '', false, now],
  ]);
  expect(copy.takeDirty()).toBe(true);
  expect(copy.handle({ kind: 'alarm' }, now).wakeAt).toBe(now + SEAT_MS);
  copy.handle({ kind: 'alarm' }, now + SEAT_MS);
  expect(copy.saved().players).toEqual([]);
  expect(copy.handle({ kind: 'alarm' }, now + EMPTY_MS).expired).toBe(true);
});
