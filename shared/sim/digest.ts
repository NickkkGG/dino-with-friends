import { BoxPlan } from './boxes';
import { Course, groundSegment } from './course';
import { hashParts } from './rng';
import { BASE_TIMELINE, TimelineTable } from './timeline';

/**
 * A short fingerprint of the course of a seed on the normal timeline: its first n obstacles and its first n ground pieces,
 * as 8 hex characters. Every engine has to come out with the same one, so a difference in arithmetic anywhere shows up.
 */
export function courseDigest(seed: number, n: number): string {
  const course = new Course(seed, new TimelineTable(BASE_TIMELINE));
  let h = hashParts(seed);
  for (let i = 0; i < n; i++) {
    const o = course.get(i);
    h = hashParts(h, o.type, o.size, o.worldX, o.yPos, Math.round(o.speedOffset * 10), o.gap, o.spawnStep);
  }
  for (let s = 0; s < n; s++) h = hashParts(h, groundSegment(seed, s));
  return h.toString(16).padStart(8, '0');
}

/**
 * A short fingerprint of a player's first n skill boxes for a seed on the normal timeline: their targets, places and
 * contents, as 8 hex characters. A box that was skipped counts with no place and 'none' for its skills.
 */
export function boxDigest(seed: number, playerId: string, n: number): string {
  const table = new TimelineTable(BASE_TIMELINE);
  const plan = new BoxPlan(new Course(seed, table), table, seed, playerId);
  let h = hashParts(seed);
  for (let k = 0; k < n; k++) {
    const box = plan.get(k);
    h = hashParts(h, k, plan.target(k), box?.worldX ?? 0, box?.skill ?? 'none', box?.altSkill ?? 'none');
  }
  return h.toString(16).padStart(8, '0');
}
