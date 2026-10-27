import { expect, it } from 'vitest';
import { parseClientMessage, parseServerMessage } from '../../shared/lobby/protocol';

const STATE = {
  type: 'state', t: 1200, d: 724.5, y: 61.2, pose: 'jump', hp: 2, hurt: 800,
  fx: { doubleJump: 0, ghost: 4100, speed: 0 }, got: 3, spd: 7.2,
};

it('reads every client message and keeps only its own fields', () => {
  const read = (m: object) => parseClientMessage(JSON.stringify({ ...m, extra: 'x' }));
  expect(read({ type: 'hello', name: 'nick' })).toEqual({ type: 'hello', name: 'nick' });
  expect(read({ type: 'start' })).toEqual({ type: 'start' });
  expect(read({ ...STATE, fx: { ...STATE.fx, extra: 1 } })).toEqual(STATE);
  expect(read({ type: 'dead', d: 1234.5 })).toEqual({ type: 'dead', d: 1234.5 });
  expect(read({ type: 'leave' })).toEqual({ type: 'leave' });
  expect(read({ type: 'ping', c: 123.456 })).toEqual({ type: 'ping', c: 123.456 });
});

it('turns away what is not a client message', () => {
  const state = (patch: object) => JSON.stringify({ ...STATE, ...patch });
  for (const raw of [
    'nope', '{}', '[]', 'null', '{"type":"fly"}', '{"type":"ping"}', '{"type":"ping","c":"1"}', '{"type":"ping","c":1e999}',
    '{"type":"dead","d":-1}', '{"type":"hello","name":7}',
    `{"type":"hello","name":"${'A'.repeat(65)}"}`, `{"type":"hello","name":"${'A'.repeat(2000)}"}`,
    state({ t: -1 }), state({ t: 3_600_001 }), state({ d: 2e9 }), state({ y: 1001 }), state({ pose: 'fly' }),
    state({ hp: 9 }), state({ hp: 2.5 }), state({ hurt: 10_001 }), state({ fx: { doubleJump: 0, ghost: 0 } }),
    state({ fx: { doubleJump: 0, ghost: 60_001, speed: 0 } }), state({ got: 1.5 }), state({ got: -1 }), state({ spd: 101 }),
  ]) {
    expect(parseClientMessage(raw), raw.slice(0, 70)).toBeNull();
  }
  expect(parseClientMessage(new ArrayBuffer(4))).toBeNull();
  expect(parseClientMessage(undefined)).toBeNull();
});

it('reads every server message', () => {
  const messages = [
    { type: 'welcome', you: 'p1', code: 'K7RM2Q' },
    {
      type: 'lobby', phase: 'countdown', round: 1,
      players: [{ id: 'p1', name: 'NICK', host: true, connected: true, playing: true }],
    },
    { type: 'countdown', round: 1, seed: 4294967295, startAt: 1761552000000 },
    { type: 'tower', rows: [{ id: 'p1', score: 41, hp: 3, alive: true }, { id: 'p2', score: 12, hp: 0, alive: false }] },
    { type: 'end', round: 1, results: [{ id: 'p1', name: 'NICK', score: 51, place: 1 }] },
    { type: 'pong', c: 1.5, s: 1761552000000 },
    { type: 'error', code: 'LOBBY_FULL' },
  ];
  for (const m of messages) expect(parseServerMessage(JSON.stringify({ ...m, extra: 1 }))).toEqual(m);
});

it('turns away a broken server message of every kind', () => {
  for (const m of [
    { type: 'welcome', you: 'p1' },
    { type: 'lobby', phase: 'party', round: 0, players: [] },
    { type: 'lobby', phase: 'lobby', round: 0, players: [{ id: 'p1', name: 'NICK', host: 'yes', connected: true, playing: false }] },
    { type: 'countdown', round: 1, seed: '7', startAt: 1 },
    { type: 'tower', rows: {} },
    { type: 'end', round: 1, results: [{ id: 'p1', name: 'NICK', score: 51 }] },
    { type: 'pong', c: 1, s: null },
    { type: 'error', code: 'NOPE' },
    { type: 'hello', name: 'NICK' },
  ]) {
    expect(parseServerMessage(JSON.stringify(m)), JSON.stringify(m)).toBeNull();
  }
  expect(parseServerMessage('{oops')).toBeNull();
});
