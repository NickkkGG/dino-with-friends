import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { LobbyPhase, LobbyPlayer, RunState, ServerMessage } from '../../shared/lobby/protocol';
import { LobbySession, RETRY_MS, WATCH_AGAIN_MS } from '../../src/net/session';
import { sessionTokens } from '../../src/net/tokens';
import type { TokenStore } from '../../src/net/tokens';
import { fakeSockets } from './helpers/fake-socket';
import { memoryStorage } from './helpers/fake-storage';

const LAN = { protocol: 'http:', host: 'lan:5173' };

const player = (id: string, name: string, host = false): LobbyPlayer => ({
  id, name, host, connected: true, playing: false,
});

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

/**
 * A session on fake sockets and a fake clock, `now` ms on this page and `wall` ms by the date, with its seat tokens in
 * a storage of its own unless it is given some.
 */
function setup(name = 'NICK', o: { tokens?: TokenStore } = {}) {
  const fake = fakeSockets();
  const clock = { now: 1000, wall: 1_761_552_000_000 };
  const storage = memoryStorage();
  const session = new LobbySession({
    code: 'K7RM2Q', name, open: fake.open, now: () => clock.now, wall: () => clock.wall, location: LAN, version: 'v1',
    tokens: o.tokens ?? sessionTokens(() => storage),
  });
  session.connect();
  return { fake, clock, session };
}

type Setup = ReturnType<typeof setup>;

/** The page's clock and its timers move on together. */
function later(s: Setup, ms: number): void {
  s.clock.now += ms;
  vi.advanceTimersByTime(ms);
}

/** A session NICK has joined as p1, with RARA, in phase `o.phase` (default the lobby). */
function joined(o: { phase?: LobbyPhase } = {}): Setup {
  const s = setup();
  s.fake.last.open();
  s.fake.last.serverSays({ type: 'welcome', you: 'p1', token: 't1', code: 'K7RM2Q' });
  s.fake.last.serverSays({
    type: 'lobby', phase: o.phase ?? 'lobby', round: o.phase ? 1 : 0, players: [player('p1', 'NICK', true), player('p2', 'RARA')],
  });
  return s;
}

const watches = (s: Setup) => s.fake.sockets.flatMap((k) => k.sent()).filter((m) => (m as { type: string }).type === 'watch');

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
  s.fake.last.serverSays({ type: 'countdown', round: 1, seed: 7, startAt: 1_761_552_003_500, runners: [] });
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
  s.fake.last.serverSays({ type: 'countdown', round: 1, seed: 7, startAt: 1, runners: [] });
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

const RUN: RunState = {
  t: 1000, d: 620.5, y: 93, pose: 'run', hp: 3, hurt: 0, fx: { doubleJump: 0, ghost: 0, speed: 0 }, got: 1, spd: 6.4,
  x: 612, first: 2, end: 4, birds: [[3, -5]], night: 0, airJumped: false, hit: null, skill: null,
};

it("takes the runners' names from the countdown", () => {
  const s = setup();
  s.fake.last.open();
  const runners = [{ id: 'p1', name: 'NICK' }, { id: 'p2', name: 'RARA' }];
  s.fake.last.serverSays({ type: 'countdown', round: 1, seed: 7, startAt: 1, runners });
  expect(s.session.view().names.get('p2')).toBe('RARA');
});

it('keeps who watches whom, and hands relayed states to whoever listens', () => {
  const s = setup();
  s.fake.last.open();
  expect(s.session.view().watching).toEqual([]);
  s.fake.last.serverSays({ type: 'watching', pairs: [{ id: 'p3', target: 'p1' }] });
  expect(s.session.view().watching).toEqual([{ id: 'p3', target: 'p1' }]);
  const got: [string, RunState][] = [];
  const stop = s.session.onRelay((id, state) => got.push([id, state]));
  const view = s.session.view();
  s.fake.last.serverSays({ type: 'relay', id: 'p1', state: RUN });
  expect(got).toEqual([['p1', RUN]]);
  expect(s.session.view()).toBe(view);
  stop();
  s.fake.last.serverSays({ type: 'relay', id: 'p1', state: RUN });
  expect(got).toHaveLength(1);
});

it('says watch', () => {
  const s = setup();
  s.fake.last.open();
  s.session.watch('p1');
  expect(s.fake.last.sent().at(-1)).toEqual({ type: 'watch', target: 'p1' });
});

it('takes no notice of a pong for a ping it is not waiting for', () => {
  const s = setup();
  s.fake.last.open();
  answerPings(s, 5000, 40, 5);
  for (let i = 0; i < 3; i++) s.fake.last.serverSays({ type: 'pong', c: 1, s: 99_999_999 });
  expect(s.session.serverNow()).toBe(s.clock.now + 5000);
});

it('says hello with the token of its seat in this lobby, and keeps the new one', () => {
  const storage = memoryStorage();
  const tokens = sessionTokens(() => storage);
  tokens.set('K7RM2Q', 'old');
  const s = setup('NICK', { tokens });
  s.fake.last.open();
  expect(s.fake.last.sent()[0]).toEqual({ type: 'hello', v: 'v1', name: 'NICK', token: 'old' });
  s.fake.last.serverSays({ type: 'welcome', you: 'p1', token: 'new', code: 'K7RM2Q' });
  expect(tokens.get('K7RM2Q')).toBe('new');
});

it('tries again every second while the connection is down, and is back with the same view', () => {
  const s = joined();
  const players = s.session.view().players;
  s.fake.last.drop();
  expect(s.session.view()).toMatchObject({ status: 'reconnecting', error: null, you: 'p1' });
  expect(s.session.view().players).toBe(players);
  later(s, RETRY_MS - 1);
  expect(s.fake.sockets).toHaveLength(1);
  later(s, 1);
  expect(s.fake.sockets).toHaveLength(2);
  s.fake.last.open();
  expect(s.fake.last.sent()[0]).toMatchObject({ type: 'hello', token: 't1' });
  expect(s.fake.last.sent()[1]).toMatchObject({ type: 'ping' }); // the clock is set again on the new socket
  s.fake.last.serverSays({ type: 'welcome', you: 'p1', token: 't1', code: 'K7RM2Q' });
  expect(s.session.view().status).toBe('joined');
});

it('gives up 10 s after a drop in a round, with CONNECTION LOST', () => {
  const s = joined({ phase: 'playing' });
  s.fake.last.drop();
  for (let i = 0; i < 9; i++) {
    later(s, RETRY_MS);
    s.fake.last.drop(); // the network is still down
  }
  expect(s.session.view().status).toBe('reconnecting');
  later(s, RETRY_MS);
  s.fake.last.drop();
  expect(s.session.view()).toMatchObject({ status: 'failed', error: 'CONNECTION_LOST' });
  const n = s.fake.sockets.length;
  later(s, 5 * RETRY_MS);
  expect(s.fake.sockets).toHaveLength(n);
});

it('keeps trying for 2 minutes in the lobby', () => {
  const s = joined();
  s.fake.last.drop();
  for (let i = 0; i < 119; i++) {
    later(s, RETRY_MS);
    s.fake.last.drop();
  }
  expect(s.session.view().status).toBe('reconnecting');
  later(s, RETRY_MS);
  expect(s.session.view()).toMatchObject({ status: 'failed', error: 'CONNECTION_LOST' });
  expect(s.fake.sockets).toHaveLength(120);
});

it('counts the time away by the clock, so a page whose timers stood still gives up at once', () => {
  const s = joined();
  s.fake.last.drop();
  s.clock.now += 130_000; // the phone slept with the page in the background
  vi.advanceTimersByTime(RETRY_MS);
  expect(s.session.view()).toMatchObject({ status: 'failed', error: 'CONNECTION_LOST' });
  expect(s.fake.sockets).toHaveLength(1);
});

it('stops for good on VERSION_MISMATCH, REPLACED or LOBBY_NOT_FOUND', () => {
  const cases = [['VERSION_MISMATCH', 'VERSION_MISMATCH'], ['REPLACED', 'CONNECTION_LOST'], ['LOBBY_NOT_FOUND', 'LOBBY_NOT_FOUND']] as const;
  for (const [code, error] of cases) {
    const s = joined();
    s.fake.last.serverSays({ type: 'error', code });
    s.fake.last.drop();
    later(s, 5 * RETRY_MS);
    expect(s.session.view(), code).toMatchObject({ status: 'failed', error });
    expect(s.fake.sockets, code).toHaveLength(1);
  }
});

it('keeps its countdown for the round it is in when the lobby sends it again', () => {
  const s = joined();
  const countdown: Extract<ServerMessage, { type: 'countdown' }> = {
    type: 'countdown', round: 1, seed: 7, startAt: 5000, runners: [{ id: 'p1', name: 'NICK' }],
  };
  s.fake.last.serverSays(countdown);
  const kept = s.session.view().countdown;
  s.fake.last.serverSays(countdown);
  expect(s.session.view().countdown).toBe(kept);
  s.fake.last.serverSays({ ...countdown, round: 2, startAt: 9000 });
  expect(s.session.view().countdown).toEqual({ round: 2, seed: 7, startAt: 9000 });
});

it("forgets the last round's tower when the next round's countdown comes, and keeps it for the same round", () => {
  const s = joined();
  const countdown: Extract<ServerMessage, { type: 'countdown' }> = {
    type: 'countdown', round: 1, seed: 7, startAt: 5000, runners: [{ id: 'p1', name: 'NICK' }],
  };
  s.fake.last.serverSays(countdown);
  s.fake.last.serverSays({ type: 'tower', rows: [{ id: 'p1', score: 40, hp: 0, alive: false }] });
  s.fake.last.serverSays(countdown); // the same round, sent again after a drop
  expect(s.session.view().tower).toHaveLength(1);
  s.fake.last.serverSays({ ...countdown, round: 2, startAt: 9000 });
  expect(s.session.view().tower).toEqual([]);
});

it('says watch again after coming back, and every 5 s', () => {
  const s = joined({ phase: 'playing' });
  s.session.watch('p2');
  expect(watches(s)).toHaveLength(1);
  later(s, WATCH_AGAIN_MS);
  expect(watches(s)).toHaveLength(2);
  s.fake.last.drop();
  later(s, RETRY_MS);
  s.fake.last.open();
  expect(watches(s)).toHaveLength(2);
  s.fake.last.serverSays({ type: 'welcome', you: 'p1', token: 't1', code: 'K7RM2Q' });
  expect(watches(s)).toHaveLength(3);
  expect(s.fake.last.sent().at(-1)).toEqual({ type: 'watch', target: 'p2' });
});

it('stops its timers when it is left or disposed', () => {
  const s = joined();
  s.fake.last.drop();
  s.session.dispose();
  expect(vi.getTimerCount()).toBe(0);
  later(s, 5 * RETRY_MS);
  expect(s.fake.sockets).toHaveLength(1);
  const t = joined({ phase: 'playing' });
  t.session.watch('p2');
  t.session.leave();
  expect(vi.getTimerCount()).toBe(0);
});

it('stops saying watch once the round is over', () => {
  const s = joined({ phase: 'playing' });
  s.session.watch('p2');
  s.fake.last.serverSays({ type: 'end', round: 1, results: [] });
  later(s, 3 * WATCH_AGAIN_MS);
  expect(watches(s)).toHaveLength(1);
  expect(vi.getTimerCount()).toBe(0);
});
