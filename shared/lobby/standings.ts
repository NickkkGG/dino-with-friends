import { SPEED_MAX, SPEED_SKILL_MULTIPLIER, STEP_MS } from '../sim/constants';

/** One player's place in a round, as the ranking needs it. */
export interface Standing {
  id: string;
  score: number;
  alive: boolean;
  /** When the player went out, on the lobby's clock; null while still running. */
  diedAt: number | null;
  /** The order the players came into the lobby in, which settles a full tie. */
  joinOrder: number;
}

/** A sorted copy, first place first: the higher score, then still running, then out later, then in the lobby earlier. */
export function rankStandings<T extends Standing>(rows: readonly T[]): T[] {
  return [...rows].sort(
    (a, b) =>
      b.score - a.score ||
      Number(b.alive) - Number(a.alive) ||
      (b.diedAt ?? 0) - (a.diedAt ?? 0) ||
      a.joinOrder - b.joinOrder,
  );
}

/** Whether the round is decided: nobody is running, or the only one still running is ahead of every final score. */
export function roundOver(rows: readonly Standing[]): boolean {
  let running = 0;
  let leader = 0;
  let bestOut = -Infinity;
  for (const row of rows) {
    if (row.alive) {
      running++;
      leader = row.score;
    } else if (row.score > bestOut) {
      bestOut = row.score;
    }
  }
  return running === 0 || (running === 1 && leader > bestOut);
}

/** The farthest a dino can go in one step: top speed with the SPEED skill on. */
export const MAX_STEP_DISTANCE = SPEED_MAX * SPEED_SKILL_MULTIPLIER;

/** How much more than that a run may claim before it is cut back. */
export const DISTANCE_SLACK = 1.1;

/** How far a run's clock may be ahead of the round's. */
export const CLOCK_SLACK_MS = 1000;

/**
 * A reported run held to what a real one could do. Its time never goes back and is at most CLOCK_SLACK_MS ahead of
 * `roundMs`; its distance never goes back and grows by at most MAX_STEP_DISTANCE, plus DISTANCE_SLACK, a step.
 */
export function clampRun(
  prev: { t: number; d: number },
  next: { t: number; d: number },
  roundMs: number,
): { t: number; d: number } {
  const t = Math.min(Math.max(next.t, prev.t), roundMs + CLOCK_SLACK_MS);
  const dMax = prev.d + ((t - prev.t) / STEP_MS) * MAX_STEP_DISTANCE * DISTANCE_SLACK;
  return { t, d: Math.min(Math.max(next.d, prev.d), dMax) };
}
