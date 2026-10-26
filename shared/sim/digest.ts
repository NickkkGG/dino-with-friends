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
