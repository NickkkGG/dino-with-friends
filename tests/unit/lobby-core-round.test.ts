import { expect, it } from 'vitest';
import { COUNTDOWN_MS, LobbyCore, alarmToSet } from '../../shared/lobby/core';
import type { LobbyEvent, LobbyStep } from '../../shared/lobby/core';
import { lobbyHarness } from './helpers/lobby-harness';

type Harness = ReturnType<typeof lobbyHarness>;

// Every distance in these tests is under the cap for its time (21.45 a step), except in the test of the cap itself.
const state = (t: number, d: number, hp = 3) =>
  ({
    type: 'state', t, d, y: 93, pose: 'run', hp, hurt: 0,
    fx: { doubleJump: 0, ghost: 0, speed: 0 }, got: 0, spd: 6,
  }) as const;

/** NICK (c1, the host) and RARA (c2) start a round, and the clock is at its first step. */
function race(h: Harness): void {
  h.hello('c1', 'NICK');
  h.hello('c2', 'RARA');
  h.send('c1', { type: 'start' });
  h.advance(COUNTDOWN_MS);
  h.alarm();
  h.clear();
}

const row = (h: Harness, conn: string, id: string) => h.last(conn, 'tower')!.rows.find((r) => r.id === id);

it('sends the tower at most every 250 ms', () => {
  const h = lobbyHarness();
  race(h);
  h.advance(100);
  h.send('c1', state(100, 36));
  for (const c of ['c1', 'c2']) {
    expect(h.last(c, 'tower')!.rows).toEqual([
      { id: 'p1', score: 1, hp: 3, alive: true },
      { id: 'p2', score: 0, hp: 3, alive: true },
    ]);
  }
  h.clear();
  h.advance(100);
  h.send('c1', state(200, 72, 2));
  expect(h.last('c2', 'tower')).toBeUndefined();
  h.advance(150);
  h.send('c2', state(350, 40));
  expect(h.last('c2', 'tower')!.rows).toEqual([
    { id: 'p1', score: 2, hp: 2, alive: true },
    { id: 'p2', score: 1, hp: 3, alive: true },
  ]);
});

it('caps a distance that runs too far', () => {
  const h = lobbyHarness();
  race(h);
  h.advance(1000);
  h.send('c1', state(1000, 99_999));
  // 60 steps × 13 × 1.5 × 1.1 = 1287, and scoreOf(1287) = 32
  expect(row(h, 'c1', 'p1')!.score).toBe(32);
  h.send('c2', { type: 'dead', d: 99_999 });
  expect(row(h, 'c1', 'p2')).toEqual({ id: 'p2', score: 32, hp: 0, alive: false });
});

it('ignores a state before the round starts and from someone who is out', () => {
  const h = lobbyHarness();
  h.hello('c1', 'NICK');
  h.hello('c2', 'RARA');
  h.send('c1', { type: 'start' });
  h.clear();
  h.advance(1000);
  h.send('c1', state(100, 36));
  expect(h.inbox('c1')).toEqual([]);
  h.advance(COUNTDOWN_MS - 1000);
  h.alarm();
  h.advance(1000);
  h.send('c2', { type: 'dead', d: 520 });
  h.advance(100);
  h.send('c2', state(1100, 900));
  h.advance(300);
  h.send('c1', state(1400, 100));
  expect(row(h, 'c1', 'p2')).toEqual({ id: 'p2', score: 13, hp: 0, alive: false });
});

it('sends the tower at once when someone is out', () => {
  const h = lobbyHarness();
  race(h);
  h.advance(3000);
  h.send('c1', state(3000, 2400));
  h.clear();
  h.advance(10);
  h.send('c2', { type: 'dead', d: 2000 });
  expect(h.last('c1', 'tower')!.rows).toEqual([
    { id: 'p1', score: 60, hp: 3, alive: true },
    { id: 'p2', score: 50, hp: 0, alive: false },
  ]);
  expect(h.inbox('c1').map((m) => m.type)).toEqual(['tower', 'end', 'lobby']);
});

it('ends when the one left is ahead of every final score', () => {
  const h = lobbyHarness();
  race(h);
  h.advance(3000);
  h.send('c2', { type: 'dead', d: 2000 }); // 50, under the cap for 3 s
  h.advance(100);
  h.send('c1', state(3100, 2000)); // 50: not yet
  expect(h.last('c1', 'end')).toBeUndefined();
  h.advance(100);
  h.send('c1', state(3200, 2040)); // 51: over
  expect(h.last('c2', 'end')).toEqual({
    type: 'end', round: 1,
    results: [
      { id: 'p1', name: 'NICK', score: 51, place: 1 },
      { id: 'p2', name: 'RARA', score: 50, place: 2 },
    ],
  });
  expect(h.last('c2', 'lobby')).toMatchObject({ phase: 'results' });
  expect(h.wakeAt).toBe(h.now + 5000);
  h.clear();
  h.advance(100);
  h.send('c1', state(3300, 2100));
  h.send('c2', { type: 'dead', d: 2100 });
  expect(h.inbox('c1')).toEqual([]);
});

it('ends when everyone is out, and goes back to the lobby 5 s later', () => {
  const h = lobbyHarness();
  race(h);
  h.advance(2000);
  h.send('c1', { type: 'dead', d: 800 });
  expect(h.last('c1', 'end')).toBeUndefined();
  h.send('c2', { type: 'dead', d: 1200 });
  expect(h.last('c1', 'end')!.results).toEqual([
    { id: 'p2', name: 'RARA', score: 30, place: 1 },
    { id: 'p1', name: 'NICK', score: 20, place: 2 },
  ]);
  h.clear();
  h.advance(4999);
  h.alarm();
  expect(h.inbox('c1')).toEqual([]);
  expect(h.wakeAt).toBe(h.now + 1);
  h.advance(1);
  h.alarm();
  expect(h.last('c1', 'lobby')).toEqual({
    type: 'lobby', phase: 'lobby', round: 1,
    players: [
      { id: 'p1', name: 'NICK', host: true, connected: true, playing: false },
      { id: 'p2', name: 'RARA', host: false, connected: true, playing: false },
    ],
  });
  expect(h.wakeAt).toBeNull();
  expect(h.core.saved().runners).toEqual([]);
});

it('counts a player out who leaves or drops mid-round, and still ends the round', () => {
  const h = lobbyHarness();
  race(h);
  h.advance(1000);
  h.send('c1', state(1000, 600));
  h.advance(100);
  h.close('c1');
  expect(h.last('c2', 'lobby')!.players).toEqual([
    { id: 'p2', name: 'RARA', host: true, connected: true, playing: true },
  ]);
  expect(row(h, 'c2', 'p1')).toEqual({ id: 'p1', score: 15, hp: 0, alive: false });
  expect(h.last('c2', 'end')).toBeUndefined();
  h.advance(100);
  h.send('c2', { type: 'dead', d: 720 });
  expect(h.last('c2', 'end')!.results).toEqual([
    { id: 'p2', name: 'RARA', score: 18, place: 1 },
    { id: 'p1', name: 'NICK', score: 15, place: 2 },
  ]);
});

it('counts a player out who presses LEAVE mid-round', () => {
  const h = lobbyHarness();
  race(h);
  h.advance(1000);
  h.send('c2', state(1000, 600));
  h.send('c2', { type: 'leave' });
  expect(h.closed).toEqual(['c2']);
  // RARA is out at 15, ahead of NICK's 0 while NICK still runs: not over until NICK is ahead.
  expect(row(h, 'c1', 'p2')).toEqual({ id: 'p2', score: 15, hp: 0, alive: false });
  expect(h.last('c1', 'end')).toBeUndefined();
});

it('counts everyone out who drops during the countdown', () => {
  const h = lobbyHarness();
  h.hello('c1', 'NICK');
  h.hello('c2', 'RARA');
  h.send('c1', { type: 'start' });
  h.hello('c3', 'BUDI');
  h.advance(1000);
  h.close('c1');
  expect(h.last('c3', 'end')).toBeUndefined();
  h.advance(100);
  h.close('c2');
  expect(h.last('c3', 'end')!.results.map((r) => r.id)).toEqual(['p2', 'p1']);
  expect(h.last('c3', 'lobby')).toMatchObject({ phase: 'results' });
  expect(h.wakeAt).toBe(h.now + 5000);
  h.advance(5000);
  h.alarm();
  expect(h.last('c3', 'lobby')).toEqual({
    type: 'lobby', phase: 'lobby', round: 1,
    players: [{ id: 'p3', name: 'BUDI', host: true, connected: true, playing: false }],
  });
});

it('counts a player out after 10 s without a state, from the alarm alone', () => {
  const h = lobbyHarness();
  race(h);
  const startAt = h.now;
  for (let t = 100; t <= 9900; t += 100) {
    h.advance(100);
    h.send('c1', state(t, t * 0.36));
  }
  expect(h.wakeAt).toBe(startAt + 10_000); // c2 never sent a state
  h.advance(100);
  h.alarm();
  expect(row(h, 'c1', 'p2')).toMatchObject({ alive: false, score: 0 });
  expect(h.last('c1', 'end')).toBeDefined(); // p1 is already ahead of 0
});

it('keeps a runner in while their states come', () => {
  const h = lobbyHarness();
  race(h);
  const startAt = h.now;
  for (let t = 1000; t <= 12_000; t += 1000) {
    h.advance(1000);
    h.send('c1', state(t, t * 0.36));
    h.send('c2', state(t, t * 0.3));
  }
  expect(row(h, 'c1', 'p1')!.alive).toBe(true);
  expect(row(h, 'c1', 'p2')!.alive).toBe(true);
  expect(h.wakeAt).toBe(startAt + 22_000);
});

it('lets a late player watch, then play the next round', () => {
  const h = lobbyHarness([7, 8]);
  race(h);
  h.advance(1000);
  h.hello('c3', 'BUDI');
  expect(h.inbox('c3').map((m) => m.type)).toEqual(['welcome', 'lobby', 'tower']);
  expect(h.last('c3', 'lobby')!.players.map((p) => p.playing)).toEqual([true, true, false]);
  expect(h.last('c3', 'tower')!.rows.map((r) => r.id)).toEqual(['p1', 'p2']);
  h.send('c3', state(1000, 500));
  h.send('c3', { type: 'dead', d: 500 });
  expect(h.last('c1', 'tower')).toBeUndefined();
  h.send('c1', { type: 'dead', d: 400 });
  h.send('c2', { type: 'dead', d: 300 });
  h.advance(5000);
  h.alarm();
  h.clear();
  h.send('c1', { type: 'start' });
  expect(h.last('c3', 'countdown')).toMatchObject({ round: 2, seed: 8 });
  expect(h.last('c3', 'tower')!.rows.map((r) => r.id)).toEqual(['p1', 'p2', 'p3']);
  expect(h.last('c3', 'lobby')!.players.map((p) => p.playing)).toEqual([true, true, true]);
});

it('picks up a round again after a restart', () => {
  const h = lobbyHarness();
  race(h);
  h.core.takeDirty();
  h.advance(1000);
  h.send('c2', { type: 'dead', d: 520 });
  expect(h.core.takeDirty()).toBe(true);
  h.send('c1', state(1000, 300));
  expect(h.core.takeDirty()).toBe(false);
  const copy = LobbyCore.restore(h.core.saved(), () => 1, h.now);
  const ev: LobbyEvent = { kind: 'message', conn: 'c1', msg: state(1300, 400) };
  const step = copy.handle(ev, h.now + 300);
  expect(step.send).toContainEqual({
    to: 'c2',
    msg: {
      type: 'tower',
      rows: [
        { id: 'p2', score: 13, hp: 0, alive: false },
        { id: 'p1', score: 10, hp: 3, alive: true },
      ],
    },
  });
  expect(step.wakeAt).toBe(h.now + 300 + 10_000);
});

it('does not cut a run back to the distance last saved, after a restart', () => {
  const h = lobbyHarness();
  race(h);
  const saved = h.core.saved(); // what storage holds: states alone do not change it
  h.advance(3000);
  const copy = LobbyCore.restore(saved, () => 1, h.now);
  const step = copy.handle({ kind: 'message', conn: 'c1', msg: state(3000, 2040) }, h.now);
  expect(step.send).toContainEqual({
    to: 'c1',
    msg: {
      type: 'tower',
      rows: [
        { id: 'p1', score: 51, hp: 3, alive: true },
        { id: 'p2', score: 0, hp: 3, alive: true },
      ],
    },
  });
});

it('gives a round restored in its countdown the whole 10 s from its start', () => {
  const h = lobbyHarness();
  h.hello('c1', 'NICK');
  h.hello('c2', 'RARA');
  h.send('c1', { type: 'start' });
  const startAt = h.now + COUNTDOWN_MS;
  h.advance(1000);
  const copy = LobbyCore.restore(h.core.saved(), () => 1, h.now);
  expect(copy.handle({ kind: 'alarm' }, startAt).wakeAt).toBe(startAt + 10_000);
});

/**
 * The lobby with one alarm, kept as its Durable Object keeps it: set from each step's wakeAt through alarmToSet, and
 * going off once the clock gets there. `sets` counts the alarms set, each of them a storage write for the object.
 */
function withAlarm(h: Harness) {
  let at: number | null = null;
  let sets = 0;
  const keep = (step: LobbyStep) => {
    const next = alarmToSet(at, step.wakeAt);
    if (next === null) return;
    at = next;
    sets += 1;
  };
  return {
    get sets() {
      return sets;
    },
    keep,
    /** Moves the clock on by `ms`, with the alarm going off on the way when it comes due. */
    advance(ms: number) {
      const to = h.now + ms;
      while (at !== null && at <= to) {
        h.advance(at - h.now);
        at = null;
        keep(h.alarm());
      }
      h.advance(to - h.now);
    },
  };
}

/** NICK and RARA start a round in a lobby that keeps its alarm, and the clock is at its first step. */
function raceWithAlarm(h: Harness) {
  const lobby = withAlarm(h);
  lobby.keep(h.hello('c1', 'NICK'));
  lobby.keep(h.hello('c2', 'RARA'));
  lobby.keep(h.send('c1', { type: 'start' }));
  lobby.advance(COUNTDOWN_MS);
  return lobby;
}

it('moves an alarm only sooner', () => {
  expect(alarmToSet(null, 5000)).toBe(5000);
  expect(alarmToSet(9000, 5000)).toBe(5000);
  expect(alarmToSet(5000, 9000)).toBeNull();
  expect(alarmToSet(5000, 5000)).toBeNull();
  expect(alarmToSet(5000, null)).toBeNull();
  expect(alarmToSet(null, null)).toBeNull();
});

it('sets the alarm a handful of times in a minute of racing, not once a state', () => {
  const h = lobbyHarness();
  const lobby = raceWithAlarm(h);
  for (let t = 100; t <= 60_000; t += 100) {
    lobby.advance(100);
    lobby.keep(h.send('c1', state(t, t * 0.36)));
    lobby.keep(h.send('c2', state(t, t * 0.3)));
  }
  expect(h.core.saved().phase).toBe('playing');
  // One for the countdown, one for the start, then one each time it goes off, about every 10 s.
  expect(lobby.sets).toBeLessThanOrEqual(10);
});

it('still counts a runner out 10 s after their last state, with the alarm only moving sooner', () => {
  const h = lobbyHarness();
  const lobby = raceWithAlarm(h);
  const startAt = h.now;
  for (let t = 100; t < 40_000; t += 100) {
    lobby.advance(100);
    lobby.keep(h.send('c1', state(t, t * 0.36)));
    if (t <= 30_000) lobby.keep(h.send('c2', state(t, t * 0.3))); // RARA's last state is at 30 s
  }
  expect(h.last('c1', 'end')).toBeUndefined();
  lobby.advance(100);
  expect(h.now - startAt).toBe(40_000);
  expect(row(h, 'c1', 'p2')).toMatchObject({ alive: false });
  expect(h.last('c1', 'end')).toBeDefined(); // NICK is ahead of RARA's final score
});
