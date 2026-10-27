import { expect, it } from 'vitest';
import { LobbyCore } from '../../shared/lobby/core';
import type { LobbyEvent } from '../../shared/lobby/core';
import { lobbyHarness } from './helpers/lobby-harness';

it('welcomes the first player as host', () => {
  const h = lobbyHarness();
  h.hello('c1', 'nick');
  expect(h.last('c1', 'welcome')).toEqual({ type: 'welcome', you: 'p1', code: 'K7RM2Q' });
  expect(h.last('c1', 'lobby')).toEqual({
    type: 'lobby', phase: 'lobby', round: 0,
    players: [{ id: 'p1', name: 'NICK', host: true, connected: true, playing: false }],
  });
  expect(h.wakeAt).toBeNull();
});

it('tells everyone in the lobby when someone comes in', () => {
  const h = lobbyHarness();
  h.hello('c1', 'NICK');
  h.hello('c2', 'RARA');
  expect(h.last('c1', 'lobby')!.players).toEqual([
    { id: 'p1', name: 'NICK', host: true, connected: true, playing: false },
    { id: 'p2', name: 'RARA', host: false, connected: true, playing: false },
  ]);
  expect(h.inbox('c2').map((m) => m.type)).toEqual(['welcome', 'lobby']);
});

it('cleans and numbers names the same way as the name screen', () => {
  const h = lobbyHarness();
  h.hello('c1', 'nick');
  h.hello('c2', ' Nick!');
  h.hello('c3', '🦖NICK');
  expect(h.last('c3', 'lobby')!.players.map((p) => p.name)).toEqual(['NICK', 'NICK2', 'NICK3']);
});

it('turns away a ninth player and an empty name', () => {
  const h = lobbyHarness();
  for (let i = 1; i <= 8; i++) h.hello(`c${i}`, `P${i}`);
  h.hello('c9', 'LATE');
  expect(h.last('c9', 'error')).toEqual({ type: 'error', code: 'LOBBY_FULL' });
  expect(h.closed).toContain('c9');
  h.hello('c10', '!!!');
  expect(h.last('c10', 'error')).toEqual({ type: 'error', code: 'BAD_MESSAGE' });
  expect(h.closed).not.toContain('c10');
  expect(h.last('c1', 'lobby')!.players).toHaveLength(8);
});

it('ignores a second hello on the same connection', () => {
  const h = lobbyHarness();
  h.hello('c1', 'NICK');
  h.clear();
  h.hello('c1', 'RARA');
  expect(h.inbox('c1')).toEqual([]);
  h.hello('c2', 'BUDI');
  expect(h.last('c2', 'lobby')!.players.map((p) => p.name)).toEqual(['NICK', 'BUDI']);
});

it('lets only the host start, and only with two players', () => {
  const h = lobbyHarness();
  h.hello('c1', 'NICK');
  h.send('c1', { type: 'start' });
  expect(h.last('c1', 'countdown')).toBeUndefined();
  h.hello('c2', 'RARA');
  h.send('c2', { type: 'start' });
  expect(h.last('c2', 'error')).toEqual({ type: 'error', code: 'NOT_HOST' });
  expect(h.last('c1', 'error')).toBeUndefined();
  expect(h.last('c1', 'countdown')).toBeUndefined();
});

it('counts down from START, once', () => {
  const h = lobbyHarness([7]);
  h.hello('c1', 'NICK');
  h.hello('c2', 'RARA');
  h.send('c1', { type: 'start' });
  const startAt = h.now + 3500;
  for (const c of ['c1', 'c2']) expect(h.last(c, 'countdown')).toEqual({ type: 'countdown', round: 1, seed: 7, startAt });
  expect(h.last('c2', 'lobby')).toMatchObject({ phase: 'countdown', round: 1 });
  expect(h.last('c2', 'lobby')!.players.every((p) => p.playing)).toBe(true);
  expect(h.last('c2', 'tower')!.rows).toEqual([
    { id: 'p1', score: 0, hp: 3, alive: true },
    { id: 'p2', score: 0, hp: 3, alive: true },
  ]);
  expect(h.inbox('c1').slice(-3).map((m) => m.type)).toEqual(['countdown', 'lobby', 'tower']);
  expect(h.wakeAt).toBe(startAt);
  h.clear();
  h.send('c1', { type: 'start' });
  expect(h.inbox('c1')).toEqual([]);
});

it('keeps a round seed to 32 bits', () => {
  const h = lobbyHarness([-1]);
  h.hello('c1', 'NICK');
  h.hello('c2', 'RARA');
  h.send('c1', { type: 'start' });
  expect(h.last('c1', 'countdown')!.seed).toBe(4294967295);
});

it('starts the round at startAt and not before', () => {
  const h = lobbyHarness();
  h.hello('c1', 'NICK');
  h.hello('c2', 'RARA');
  h.send('c1', { type: 'start' });
  h.clear();
  h.advance(3499);
  h.alarm();
  expect(h.inbox('c1')).toEqual([]);
  expect(h.wakeAt).toBe(h.now + 1);
  h.advance(1);
  h.alarm();
  for (const c of ['c1', 'c2']) expect(h.last(c, 'lobby')).toMatchObject({ phase: 'playing', round: 1 });
});

it('hands the host on to the earliest player left', () => {
  const h = lobbyHarness();
  h.hello('c1', 'NICK');
  h.hello('c2', 'RARA');
  h.hello('c3', 'BUDI');
  h.clear();
  h.send('c1', { type: 'leave' });
  expect(h.closed).toEqual(['c1']);
  expect(h.inbox('c1')).toEqual([]);
  expect(h.last('c2', 'lobby')!.players.map((p) => [p.id, p.host])).toEqual([['p2', true], ['p3', false]]);
  h.close('c2');
  expect(h.closed).toEqual(['c1']);
  expect(h.last('c3', 'lobby')!.players).toEqual([{ id: 'p3', name: 'BUDI', host: true, connected: true, playing: false }]);
});

it('takes no notice of a connection that never said hello', () => {
  const h = lobbyHarness();
  h.hello('c1', 'NICK');
  h.clear();
  h.send('c2', { type: 'start' });
  h.close('c2');
  expect(h.inbox('c1')).toEqual([]);
  expect(h.inbox('c2')).toEqual([]);
});

it('answers a ping at once, even before hello', () => {
  const h = lobbyHarness();
  h.send('c1', { type: 'ping', c: 42 });
  expect(h.inbox('c1')).toEqual([{ type: 'pong', c: 42, s: h.now }]);
});

it('answers a broken message', () => {
  const h = lobbyHarness();
  h.hello('c1', 'NICK');
  h.clear();
  h.bad('c1');
  expect(h.inbox('c1')).toEqual([{ type: 'error', code: 'BAD_MESSAGE' }]);
  expect(h.closed).toEqual([]);
});

it('lets a player who comes in during the countdown watch, with the tower at once', () => {
  const h = lobbyHarness();
  h.hello('c1', 'NICK');
  h.hello('c2', 'RARA');
  h.send('c1', { type: 'start' });
  h.hello('c3', 'BUDI');
  expect(h.inbox('c3').map((m) => m.type)).toEqual(['welcome', 'lobby', 'tower']);
  expect(h.last('c3', 'lobby')!.players.map((p) => [p.id, p.playing])).toEqual([['p1', true], ['p2', true], ['p3', false]]);
  expect(h.last('c3', 'tower')!.rows.map((r) => r.id)).toEqual(['p1', 'p2']);
});

it('comes back the same from what it saved', () => {
  const h = lobbyHarness([7]);
  h.hello('c1', 'NICK');
  h.hello('c2', 'RARA');
  h.send('c1', { type: 'start' });
  const copy = LobbyCore.restore(h.core.saved(), () => 7, h.now);
  expect(copy.code).toBe('K7RM2Q');
  expect(copy.saved()).toEqual(h.core.saved());
  const hello: LobbyEvent = { kind: 'message', conn: 'c3', msg: { type: 'hello', name: 'BUDI' } };
  expect(copy.handle(hello, h.now)).toEqual(h.core.handle(hello, h.now));
  expect(copy.saved()).toEqual(h.core.saved());
});

it('says when its saved state changed', () => {
  const h = lobbyHarness();
  h.hello('c1', 'NICK');
  expect(h.core.takeDirty()).toBe(true);
  expect(h.core.takeDirty()).toBe(false);
  h.send('c1', { type: 'ping', c: 1 });
  h.bad('c1');
  expect(h.core.takeDirty()).toBe(false);
  h.hello('c2', 'RARA');
  h.hello('c3', 'BUDI');
  h.core.takeDirty();
  h.send('c1', { type: 'leave' });
  expect(h.core.takeDirty()).toBe(true);
  h.send('c2', { type: 'start' });
  expect(h.core.takeDirty()).toBe(true);
  h.advance(3500);
  h.alarm();
  expect(h.core.takeDirty()).toBe(true);
});
