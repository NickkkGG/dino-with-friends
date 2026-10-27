import { COUNTDOWN_MS, LobbyCore } from '../../../shared/lobby/core';
import type { LobbyEvent } from '../../../shared/lobby/core';
import type { ClientMessage, RunState, ServerMessage } from '../../../shared/lobby/protocol';

/** A runner's state `t` ms into the round, `d` px along with `hp` hearts: on the ground by day, nothing hit or picked up. */
export function runAt(t: number, d: number, hp = 3): { type: 'state' } & RunState {
  return {
    type: 'state', t, d, y: 93, pose: 'run', hp, hurt: 0, fx: { doubleJump: 0, ghost: 0, speed: 0 }, got: 0, spd: 6,
    x: Math.floor(d), first: 0, end: 0, birds: [], night: 0, airJumped: false, hit: null, skill: null,
  };
}

/** The build the harness lobby runs, and so the one its hellos say. */
export const VERSION = 'v1';

/**
 * A lobby with code K7RM2Q on build VERSION, its own clock from 1 000 000 and a mailbox per connection. Round seeds
 * come from `seeds` in turn, from the start again when they run out; seat tokens are t1, t2, … in the order the seats
 * are made.
 */
export function lobbyHarness(seeds: readonly number[] = [111, 222, 333]) {
  let picked = 0;
  let made = 0;
  const core = new LobbyCore({
    code: 'K7RM2Q',
    seeds: () => seeds[picked++ % seeds.length]!,
    tokens: () => `t${++made}`,
    version: VERSION,
    now: 1_000_000,
  });
  const inboxes = new Map<string, ServerMessage[]>();
  let now = 1_000_000;
  let wakeAt: number | null = null;
  let expired = false;
  const run = (ev: LobbyEvent) => {
    const step = core.handle(ev, now);
    for (const { to, msg } of step.send) {
      const inbox = inboxes.get(to) ?? [];
      inbox.push(msg);
      inboxes.set(to, inbox);
    }
    h.closed.push(...step.close);
    wakeAt = step.wakeAt;
    expired = step.expired;
    return step;
  };
  const h = {
    core,
    /** Every connection the lobby has closed, in order. */
    closed: [] as string[],
    get now() {
      return now;
    },
    /** When the last event asked to be woken. */
    get wakeAt() {
      return wakeAt;
    },
    /** Whether the last event found the lobby gone, after too long with nobody connected. */
    get expired() {
      return expired;
    },
    advance: (ms: number) => void (now += ms),
    send: (conn: string, msg: ClientMessage) => run({ kind: 'message', conn, msg }),
    hello: (conn: string, name: string, token: string | null = null) =>
      run({ kind: 'message', conn, msg: { type: 'hello', v: VERSION, name, token } }),
    watch: (conn: string, target: string) => run({ kind: 'message', conn, msg: { type: 'watch', target } }),
    bad: (conn: string) => run({ kind: 'bad', conn }),
    close: (conn: string) => run({ kind: 'close', conn }),
    alarm: () => run({ kind: 'alarm' }),
    inbox: (conn: string): ServerMessage[] => inboxes.get(conn) ?? [],
    /** The latest message of one type a connection has been sent. */
    last: <T extends ServerMessage['type']>(conn: string, type: T) =>
      h.inbox(conn).findLast((m): m is Extract<ServerMessage, { type: T }> => m.type === type),
    /** Empties every mailbox and the closed list. */
    clear: () => {
      inboxes.clear();
      h.closed.length = 0;
    },
  };
  return h;
}

export type Harness = ReturnType<typeof lobbyHarness>;

/** NICK (c1, the host) and RARA (c2) start a round, and the clock is at its first step. */
export function race(h: Harness): void {
  h.hello('c1', 'NICK');
  h.hello('c2', 'RARA');
  h.send('c1', { type: 'start' });
  h.advance(COUNTDOWN_MS);
  h.alarm();
  h.clear();
}

/** Player `id`'s line in the latest tower connection `conn` was sent. */
export const row = (h: Harness, conn: string, id: string) => h.last(conn, 'tower')!.rows.find((r) => r.id === id);
