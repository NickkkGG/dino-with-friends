import { expect, it } from 'vitest';
import { parseClientMessage, parseServerMessage, readRunState } from '../../shared/lobby/protocol';
import type { RunState } from '../../shared/lobby/protocol';

const STATE = {
  type: 'state', t: 1200, d: 724.5, y: 61.2, pose: 'jump', hp: 2, hurt: 800,
  fx: { doubleJump: 0, ghost: 4100, speed: 0 }, got: 3, spd: 7.2,
  x: 720, first: 1, end: 3, birds: [[2, 4]], night: 0, airJumped: true, hit: null, skill: { id: 'doubleJump', step: 30 },
};

const RUN: RunState = {
  t: 1000, d: 620.5, y: 93, pose: 'run', hp: 3, hurt: 0, fx: { doubleJump: 0, ghost: 0, speed: 0 }, got: 1, spd: 6.4,
  x: 612, first: 2, end: 4, birds: [[3, -5]], night: 0, airJumped: false,
  hit: { step: 40, x: 61.5, y: 100 }, skill: { id: 'ghost', step: 50 },
};

it('reads every client message and keeps only its own fields', () => {
  const read = (m: object) => parseClientMessage(JSON.stringify({ ...m, extra: 'x' }));
  expect(read({ type: 'hello', v: 'm4x2', name: 'nick', token: 'abc' })).toEqual({ type: 'hello', v: 'm4x2', name: 'nick', token: 'abc' });
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

it('reads a hello with the build, the name and the token', () => {
  expect(parseClientMessage('{"type":"hello","v":"m4x2","name":"nick","token":"abc"}'))
    .toEqual({ type: 'hello', v: 'm4x2', name: 'nick', token: 'abc' });
  expect(parseClientMessage('{"type":"hello","v":"m4x2","name":"nick"}')).toMatchObject({ token: null });
  expect(parseClientMessage('{"type":"hello","name":"nick"}')).toMatchObject({ v: '', token: null });
  expect(parseClientMessage(`{"type":"hello","v":"m4x2","name":"nick","token":"${'a'.repeat(65)}"}`)).toBeNull();
  expect(parseClientMessage(`{"type":"hello","v":"${'a'.repeat(33)}","name":"nick"}`)).toBeNull();
  expect(parseServerMessage('{"type":"welcome","you":"p2","code":"K7RM2Q"}')).toBeNull();
  expect(parseServerMessage('{"type":"error","code":"REPLACED"}')).toEqual({ type: 'error', code: 'REPLACED' });
});

it('reads a watch, and the new server messages', () => {
  expect(parseClientMessage('{"type":"watch","target":"p2"}')).toEqual({ type: 'watch', target: 'p2' });
  expect(parseClientMessage('{"type":"watch","target":""}')).toBeNull();
  expect(parseClientMessage(`{"type":"watch","target":"${'p'.repeat(17)}"}`)).toBeNull();
  expect(parseServerMessage('{"type":"countdown","round":1,"seed":7,"startAt":9,"runners":[{"id":"p1","name":"NICK"}]}'))
    .toEqual({ type: 'countdown', round: 1, seed: 7, startAt: 9, runners: [{ id: 'p1', name: 'NICK' }] });
  expect(parseServerMessage(JSON.stringify({ type: 'relay', id: 'p1', state: RUN }))).toEqual({ type: 'relay', id: 'p1', state: RUN });
  expect(parseServerMessage('{"type":"watching","pairs":[{"id":"p3","target":"p1"}]}'))
    .toEqual({ type: 'watching', pairs: [{ id: 'p3', target: 'p1' }] });
  for (const raw of [
    '{"type":"countdown","round":1,"seed":7,"startAt":9}',
    JSON.stringify({ type: 'relay', id: 'p1', state: { ...RUN, x: 'far' } }),
    '{"type":"watching","pairs":[{"id":"p3"}]}',
  ]) expect(parseServerMessage(raw), raw).toBeNull();
});

it('reads a whole state, and keeps only its own fields', () => {
  expect(parseClientMessage(JSON.stringify({ type: 'state', ...RUN, extra: 1 }))).toEqual({ type: 'state', ...RUN });
  const plain = { ...RUN, birds: [], hit: null, skill: null };
  expect(readRunState(plain)).toEqual(plain);
});

it('turns away a state whose new parts are wrong', () => {
  const bad: object[] = [
    { x: -1 }, { x: 1.5 }, { first: 5, end: 4 }, { birds: [[5, 0]] }, { birds: [[3, 0.5]] }, { birds: [[3]] },
    { birds: Array.from({ length: 9 }, () => [3, 0]) }, { night: 721 }, { airJumped: 1 },
    { hit: { step: 40, x: 61 } }, { hit: { step: -1, x: 1, y: 1 } }, { skill: { id: 'fly', step: 1 } }, { skill: { id: 'ghost' } },
  ];
  for (const b of bad) expect(parseClientMessage(JSON.stringify({ type: 'state', ...RUN, ...b })), JSON.stringify(b)).toBeNull();
});

it('reads every server message', () => {
  const messages = [
    { type: 'welcome', you: 'p1', token: '8f1c2e7a-3b4d-4c5e-9f60-718293a4b5c6', code: 'K7RM2Q' },
    {
      type: 'lobby', phase: 'countdown', round: 1,
      players: [{ id: 'p1', name: 'NICK', host: true, connected: true, playing: true }],
    },
    { type: 'countdown', round: 1, seed: 4294967295, startAt: 1761552000000, runners: [{ id: 'p1', name: 'NICK' }] },
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
