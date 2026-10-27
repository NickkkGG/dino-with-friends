import { alarmToSet } from '../shared/lobby/core';
import type { LobbyCore, LobbyStep, SavedLobby } from '../shared/lobby/core';
import type { ServerMessage } from '../shared/lobby/protocol';

/** The part of a socket a step uses. */
export interface StepSocket {
  send(text: string): void;
  close(code: number, reason: string): void;
}

/** The part of a lobby's storage a step uses. */
export interface StepStorage {
  put(saved: SavedLobby): Promise<void>;
  setAlarm(at: number): Promise<void>;
  deleteAlarm(): Promise<void>;
  deleteAll(): Promise<void>;
}

const NOT_FOUND: ServerMessage = { type: 'error', code: 'LOBBY_NOT_FOUND' };

/**
 * Carries a step out: each message sent once as text, and the closes; then the lobby saved when it changed, and the
 * alarm moved when the step wants it sooner. An expired lobby is wiped instead, and every socket still open is told
 * LOBBY_NOT_FOUND and closed with 4004. Gives the alarm set from now on, worked out before anything is awaited, and
 * what is left to await.
 */
export function applyStep(o: {
  sockets: ReadonlyMap<string, StepSocket>;
  storage: StepStorage;
  core: LobbyCore;
  step: LobbyStep;
  alarmAt: number | null;
}): { alarmAt: number | null; done: Promise<unknown> } {
  const { sockets, storage, core, step } = o;
  if (step.expired) {
    const text = JSON.stringify(NOT_FOUND);
    for (const ws of sockets.values()) {
      try {
        ws.send(text);
        ws.close(4004, 'LOBBY_NOT_FOUND');
      } catch {
        // Closing already.
      }
    }
    return { alarmAt: null, done: Promise.all([storage.deleteAlarm(), storage.deleteAll()]) };
  }
  const texts = new Map<ServerMessage, string>();
  for (const { to, msg } of step.send) {
    const text = texts.get(msg) ?? JSON.stringify(msg);
    texts.set(msg, text);
    try {
      sockets.get(to)?.send(text);
    } catch {
      // The socket is closing; its close event comes next.
    }
  }
  for (const conn of step.close) {
    try {
      sockets.get(conn)?.close(1000, 'bye');
    } catch {
      // Closed already.
    }
  }
  const writes: Promise<unknown>[] = [];
  if (core.takeDirty()) writes.push(storage.put(core.saved()));
  const alarm = alarmToSet(o.alarmAt, step.wakeAt);
  if (alarm !== null) writes.push(storage.setAlarm(alarm));
  return { alarmAt: alarm ?? o.alarmAt, done: Promise.all(writes) };
}
