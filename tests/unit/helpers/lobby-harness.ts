import { LobbyCore } from '../../../shared/lobby/core';
import type { LobbyEvent } from '../../../shared/lobby/core';
import type { ClientMessage, RunState, ServerMessage } from '../../../shared/lobby/protocol';

/** A runner's state `t` ms into the round, `d` px along with `hp` hearts: on the ground by day, nothing hit or picked up. */
export function runAt(t: number, d: number, hp = 3): { type: 'state' } & RunState {
  return {
    type: 'state', t, d, y: 93, pose: 'run', hp, hurt: 0, fx: { doubleJump: 0, ghost: 0, speed: 0 }, got: 0, spd: 6,
    x: Math.floor(d), first: 0, end: 0, birds: [], night: 0, airJumped: false, hit: null, skill: null,
  };
}

/**
 * A lobby with code K7RM2Q, its own clock from 1 000 000 and a mailbox per connection. Round seeds come from `seeds`
 * in turn, from the start again when they run out.
 */
export function lobbyHarness(seeds: readonly number[] = [111, 222, 333]) {
  let picked = 0;
  const core = new LobbyCore('K7RM2Q', () => seeds[picked++ % seeds.length]!);
  const inboxes = new Map<string, ServerMessage[]>();
  let now = 1_000_000;
  let wakeAt: number | null = null;
  const run = (ev: LobbyEvent) => {
    const step = core.handle(ev, now);
    for (const { to, msg } of step.send) {
      const inbox = inboxes.get(to) ?? [];
      inbox.push(msg);
      inboxes.set(to, inbox);
    }
    h.closed.push(...step.close);
    wakeAt = step.wakeAt;
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
    advance: (ms: number) => void (now += ms),
    send: (conn: string, msg: ClientMessage) => run({ kind: 'message', conn, msg }),
    hello: (conn: string, name: string) => run({ kind: 'message', conn, msg: { type: 'hello', name } }),
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
