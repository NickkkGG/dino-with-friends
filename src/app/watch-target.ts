import { useEffect, useEffectEvent, useState } from 'react';
import type { TowerRow, WatchPair } from '../../shared/lobby/protocol';
import type { Peeker } from './peek';

/** After a GAME OVER, own or of the runner watched, the view moves on this much later. */
export const WATCH_AFTER_MS = 2000;

// The runners still running other than `self`, in tower order.
const othersRunning = (rows: readonly TowerRow[], self: string | null): string[] =>
  rows.flatMap((r) => (r.alive && r.id !== self ? [r.id] : []));

/** The top runner still running, never `self`: whom to watch. Null when there is none. */
export function topAlive(rows: readonly TowerRow[], self: string | null): string | null {
  return othersRunning(rows, self)[0] ?? null;
}

/**
 * The runner still running after (1) or before (−1) `current` in tower order, round the ends, never `self`. From one
 * who is out, or from nobody, the top one.
 */
export function nextAlive(rows: readonly TowerRow[], current: string | null, dir: 1 | -1, self: string | null): string | null {
  const ids = othersRunning(rows, self);
  const i = current === null ? -1 : ids.indexOf(current);
  if (i < 0) return ids[0] ?? null;
  return ids[(i + dir + ids.length) % ids.length]!;
}

/** Who watches `owner`'s screen, in the order they began, with their names; `me` for `you`. */
export function watchersOf(
  pairs: readonly WatchPair[],
  owner: string,
  names: ReadonlyMap<string, string>,
  you: string | null,
): Peeker[] {
  return pairs.flatMap((p) => (p.target === owner ? [{ id: p.id, name: names.get(p.id) ?? '', me: p.id === you }] : []));
}

/**
 * Whom this player watches: the top runner still running as soon as `ready`, the top one again WATCH_AFTER_MS after
 * that runner is out, or the one `pick` or `step` asks for, at once, which drops a move still waiting. The lobby is told
 * once for each new one.
 */
export function useWatchTarget(o: {
  rows: readonly TowerRow[];
  you: string | null;
  ready: boolean;
  watch(target: string): void;
}): { target: string | null; pick(id: string): void; step(dir: 1 | -1): void } {
  const { rows, you, ready } = o;
  const [target, setTarget] = useState<string | null>(null);
  const top = topAlive(rows, you);
  if (ready && target === null && top !== null) setTarget(top);

  const out = target !== null && rows.some((r) => r.id === target && !r.alive);
  const moveOn = useEffectEvent(() => {
    if (top !== null) setTarget(top);
  });
  useEffect(() => {
    if (!out) return undefined;
    const id = window.setTimeout(moveOn, WATCH_AFTER_MS);
    return () => window.clearTimeout(id);
  }, [out, target]);

  const tell = useEffectEvent((t: string) => o.watch(t));
  useEffect(() => {
    if (target !== null) tell(target);
  }, [target]);

  const pick = (id: string) => {
    if (othersRunning(rows, you).includes(id)) setTarget(id);
  };
  const step = (dir: 1 | -1) => {
    const next = nextAlive(rows, target, dir, you);
    if (next !== null) setTarget(next);
  };
  return { target, pick, step };
}
