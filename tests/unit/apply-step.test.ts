import { afterEach, expect, it, vi } from 'vitest';
import type { LobbyStep } from '../../shared/lobby/core';
import type { ServerMessage } from '../../shared/lobby/protocol';
import { applyStep } from '../../worker/apply-step';
import type { StepSocket, StepStorage } from '../../worker/apply-step';
import { lobbyHarness } from './helpers/lobby-harness';

/** Sockets for the connections `open`, and a storage, that write down each call made to them as a line of `log`. */
function fakeIo(open: readonly string[] = ['c1', 'c2']) {
  const log: string[] = [];
  const sockets = new Map<string, StepSocket>();
  for (const c of open) {
    sockets.set(c, {
      send: (text) => void log.push(`${c} send ${text}`),
      close: (code) => void log.push(`${c} close ${code}`),
    });
  }
  const storage: StepStorage = {
    put: async () => void log.push('put'),
    setAlarm: async (at) => void log.push(`setAlarm ${at}`),
    deleteAlarm: async () => void log.push('deleteAlarm'),
    deleteAll: async () => void log.push('deleteAll'),
  };
  return { io: { sockets, storage }, log };
}

const quiet: LobbyStep = { send: [], close: [], wakeAt: null, expired: false };

afterEach(() => {
  vi.restoreAllMocks();
});

it('sends each message once as text to its connection, and closes the ones asked', () => {
  const { io, log } = fakeIo();
  const { core } = lobbyHarness();
  const msg: ServerMessage = { type: 'error', code: 'NOT_HOST' };
  const stringify = vi.spyOn(JSON, 'stringify');
  const send = [{ to: 'c1', msg }, { to: 'c2', msg }, { to: 'c3', msg }]; // c3's socket is gone
  applyStep({ ...io, core, step: { ...quiet, send, close: ['c2'] }, alarmAt: null });
  expect(stringify.mock.calls.filter(([value]) => value === msg)).toHaveLength(1);
  expect(log.filter((l) => !l.startsWith('put'))).toEqual([
    'c1 send {"type":"error","code":"NOT_HOST"}',
    'c2 send {"type":"error","code":"NOT_HOST"}',
    'c2 close 1000',
  ]);
});

it('saves the lobby only when it changed', async () => {
  const h = lobbyHarness();
  const { io, log } = fakeIo();
  await applyStep({ ...io, core: h.core, step: h.hello('c1', 'NICK'), alarmAt: null }).done;
  expect(log.filter((l) => l === 'put')).toHaveLength(1);
  await applyStep({ ...io, core: h.core, step: h.send('c1', { type: 'ping', c: 1 }), alarmAt: null }).done;
  expect(log.filter((l) => l === 'put')).toHaveLength(1);
});

it('moves the alarm only sooner, and says which alarm is set', () => {
  const { io, log } = fakeIo();
  const { core } = lobbyHarness();
  expect(applyStep({ ...io, core, step: { ...quiet, wakeAt: 4000 }, alarmAt: 5000 }).alarmAt).toBe(4000);
  expect(applyStep({ ...io, core, step: { ...quiet, wakeAt: 6000 }, alarmAt: 4000 }).alarmAt).toBe(4000);
  expect(applyStep({ ...io, core, step: quiet, alarmAt: null }).alarmAt).toBeNull();
  expect(log.filter((l) => l.startsWith('setAlarm'))).toEqual(['setAlarm 4000']);
});

it('wipes an expired lobby: no save, the alarm and the storage deleted, open sockets told and closed with 4004', async () => {
  const { io, log } = fakeIo(['c1', 'c2']);
  const { core } = lobbyHarness(); // a new lobby, so one that has something to save
  const done = applyStep({ ...io, core, step: { ...quiet, wakeAt: 9000, expired: true }, alarmAt: 5000 });
  expect(done.alarmAt).toBeNull();
  await done.done;
  expect(log).toEqual([
    'c1 send {"type":"error","code":"LOBBY_NOT_FOUND"}', 'c1 close 4004',
    'c2 send {"type":"error","code":"LOBBY_NOT_FOUND"}', 'c2 close 4004',
    'deleteAlarm', 'deleteAll',
  ]);
});
