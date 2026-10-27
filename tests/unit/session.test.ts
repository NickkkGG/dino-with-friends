import { expect, it } from 'vitest';
import type { LobbyPlayer, RunState } from '../../shared/lobby/protocol';
import { LobbySession } from '../../src/net/session';
import { fakeSockets } from './helpers/fake-socket';

const LAN = { protocol: 'http:', host: 'lan:5173' };

const player = (id: string, name: string, host = false): LobbyPlayer => ({
  id, name, host, connected: true, playing: false,
});

/** A session on a fake socket and a fake clock, `now` ms on this page and `wall` ms by the date. */
function setup(name = 'NICK') {
  const fake = fakeSockets();
  const clock = { now: 1000, wall: 1_761_552_000_000 };
  const session = new LobbySession({
    code: 'K7RM2Q', name, open: fake.open, now: () => clock.now, wall: () => clock.wall, location: LAN, version: 'v1',
  });
  session.connect();
  return { fake, clock, session };
}

/** Answers every ping in flight, as a server whose clock is `offset` ms ahead and a trip of `rtt` ms. */
function answerPings(s: ReturnType<typeof setup>, offset: number, rtt: number, times: number): void {
  for (let i = 0; i < times; i++) {
    const ping = s.fake.last.sent().findLast((m) => (m as { type: string }).type === 'ping') as { c: number };
    s.clock.now = ping.c + rtt;
    s.fake.last.serverSays({ type: 'pong', c: ping.c, s: ping.c + rtt / 2 + offset });
  }
}

const pings = (s: ReturnType<typeof setup>) => s.fake.last.sent().filter((m) => (m as { type: string }).type === 'ping');

it('says hello with the name, then pings five times in a row', () => {
  const s = setup();
  expect(s.fake.last.url).toBe('ws://lan:5173/ws/K7RM2Q');
  expect(s.fake.last.sent()).toEqual([]);
  s.fake.last.open();
  expect(s.fake.last.sent()).toEqual([{ type: 'hello', v: 'v1', name: 'NICK', token: null }, { type: 'ping', c: 1000 }]);
  answerPings(s, 0, 40, 1);
  expect(pings(s)).toHaveLength(2);
  answerPings(s, 0, 40, 10);
  expect(pings(s)).toHaveLength(5);
});

it('uses wss on a secure page', () => {
  const fake = fakeSockets();
  new LobbySession({ code: 'K7RM2Q', name: 'NICK', open: fake.open, location: { protocol: 'https:', host: 'x.dev' } })
    .connect();
  expect(fake.last.url).toBe('wss://x.dev/ws/K7RM2Q');
});

it('joins on welcome and follows the lobby', () => {
  const s = setup('RARA');
  s.fake.last.open();
  expect(s.session.view()).toMatchObject({ status: 'connecting', you: null, code: 'K7RM2Q' });
  s.fake.last.serverSays({ type: 'welcome', you: 'p2', token: 't2', code: 'K7RM2Q' });
  s.fake.last.serverSays({
    type: 'lobby', phase: 'lobby', round: 0, players: [player('p1', 'NICK', true), player('p2', 'RARA')],
  });
  const v = s.session.view();
  expect(v).toMatchObject({ status: 'joined', error: null, you: 'p2', phase: 'lobby', round: 0 });
  expect(v.players.map((p) => p.name)).toEqual(['NICK', 'RARA']);
  expect(v.names.get('p1')).toBe('NICK');
});

it('keeps the names of players who have left', () => {
  const s = setup();
  s.fake.last.open();
  s.fake.last.serverSays({ type: 'lobby', phase: 'playing', round: 1, players: [player('p1', 'NICK'), player('p2', 'RARA')] });
  s.fake.last.serverSays({ type: 'lobby', phase: 'playing', round: 1, players: [player('p1', 'NICK')] });
  expect(s.session.view().players).toHaveLength(1);
  expect(s.session.view().names.get('p2')).toBe('RARA');
});

it('keeps the countdown, the tower and the end as they come', () => {
  const s = setup();
  s.fake.last.open();
  s.fake.last.serverSays({ type: 'countdown', round: 1, seed: 7, startAt: 1_761_552_003_500 });
  s.fake.last.serverSays({ type: 'tower', rows: [{ id: 'p1', score: 3, hp: 3, alive: true }] });
  s.fake.last.serverSays({ type: 'end', round: 1, results: [{ id: 'p1', name: 'NICK', score: 51, place: 1 }] });
  expect(s.session.view()).toMatchObject({
    countdown: { round: 1, seed: 7, startAt: 1_761_552_003_500 },
    tower: [{ id: 'p1', score: 3, hp: 3, alive: true }],
    end: { round: 1, results: [{ id: 'p1', name: 'NICK', score: 51, place: 1 }] },
  });
});

it('keeps the same view until something changes, and tells its subscribers when it does', () => {
  const s = setup();
  s.fake.last.open();
  let told = 0;
  const stop = s.session.subscribe(() => told++);
  const first = s.session.view();
  expect(s.session.view()).toBe(first);
  s.fake.last.serverSays('{oops');
  s.fake.last.serverSays({ type: 'error', code: 'NOT_HOST' });
  expect(s.session.view()).toBe(first);
  expect(told).toBe(0);
  s.fake.last.serverSays({ type: 'lobby', phase: 'lobby', round: 0, players: [player('p1', 'NICK', true)] });
  expect(s.session.view()).not.toBe(first);
  expect(told).toBe(1);
  stop();
  s.fake.last.serverSays({ type: 'lobby', phase: 'lobby', round: 0, players: [] });
  expect(told).toBe(1);
});

it('works out the server clock from the pongs', () => {
  const s = setup();
  expect(s.session.serverNow()).toBe(s.clock.wall);
  s.fake.last.open();
  answerPings(s, 5000, 40, 5);
  expect(s.session.serverNow()).toBe(s.clock.now + 5000);
});

it('pings again on a countdown', () => {
  const s = setup();
  s.fake.last.open();
  answerPings(s, 0, 40, 5);
  expect(pings(s)).toHaveLength(5);
  s.fake.last.serverSays({ type: 'countdown', round: 1, seed: 7, startAt: 1 });
  expect(pings(s)).toHaveLength(6);
  answerPings(s, 0, 40, 10);
  expect(pings(s)).toHaveLength(10);
});

it('fails with the lobby errors, and closes its socket', () => {
  for (const code of ['LOBBY_NOT_FOUND', 'LOBBY_FULL'] as const) {
    const s = setup();
    s.fake.last.open();
    s.fake.last.serverSays({ type: 'error', code });
    expect(s.session.view()).toMatchObject({ status: 'failed', error: code });
    expect(s.fake.last.closedByGame).toBe(true);
  }
});

it('cannot connect when the socket closes before the welcome', () => {
  const s = setup();
  s.fake.last.drop();
  expect(s.session.view()).toMatchObject({ status: 'failed', error: 'CANT_CONNECT' });
});

it('lost the connection when the socket closes after the welcome', () => {
  const s = setup();
  s.fake.last.open();
  s.fake.last.serverSays({ type: 'welcome', you: 'p1', token: 't1', code: 'K7RM2Q' });
  s.fake.last.drop();
  expect(s.session.view()).toMatchObject({ status: 'failed', error: 'CONNECTION_LOST' });
});

it('leaves without an error', () => {
  const s = setup();
  s.fake.last.open();
  s.fake.last.serverSays({ type: 'welcome', you: 'p1', token: 't1', code: 'K7RM2Q' });
  s.session.leave();
  expect(s.fake.last.sent().at(-1)).toEqual({ type: 'leave' });
  expect(s.fake.last.closedByGame).toBe(true);
  expect(s.session.view()).toMatchObject({ status: 'joined', error: null });
});

it('closes quietly when the screen goes away', () => {
  const s = setup();
  s.fake.last.open();
  const before = s.fake.last.texts.length;
  s.session.dispose();
  expect(s.fake.last.texts).toHaveLength(before);
  expect(s.fake.last.closedByGame).toBe(true);
  expect(s.session.view().status).toBe('connecting');
});

it('sends START, the run and the death, and nothing before the socket is open', () => {
  const s = setup();
  s.session.start();
  expect(s.fake.last.texts).toEqual([]);
  s.fake.last.open();
  s.session.start();
  const run: RunState = {
    t: 1200, d: 724.5, y: 61, pose: 'jump', hp: 2, hurt: 800, fx: { doubleJump: 0, ghost: 0, speed: 0 }, got: 3, spd: 7,
    x: 720, first: 1, end: 2, birds: [], night: 0, airJumped: false, hit: null, skill: null,
  };
  s.session.sendState(run);
  s.session.sendDead(1234);
  expect(s.fake.last.sent().slice(-3)).toEqual([{ type: 'start' }, { type: 'state', ...run }, { type: 'dead', d: 1234 }]);
});

it('takes no notice of a pong for a ping it is not waiting for', () => {
  const s = setup();
  s.fake.last.open();
  answerPings(s, 5000, 40, 5);
  for (let i = 0; i < 3; i++) s.fake.last.serverSays({ type: 'pong', c: 1, s: 99_999_999 });
  expect(s.session.serverNow()).toBe(s.clock.now + 5000);
});
