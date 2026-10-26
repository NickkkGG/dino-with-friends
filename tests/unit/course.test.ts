import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { Course, groundSegment } from '../../shared/sim/course';
import type { CourseObstacle } from '../../shared/sim/course';
import { boxDigest, courseDigest } from '../../shared/sim/digest';
import { boxesForSize, typeConfig } from '../../shared/sim/obstacle-types';
import { BASE_TIMELINE, TimelineTable, constantTimeline } from '../../shared/sim/timeline';

const table = new TimelineTable(BASE_TIMELINE);

const range = (from: number, to: number): number[] => Array.from({ length: to - from + 1 }, (_, i) => from + i);

// The first `count` obstacles of a seed's course.
function firstObstacles(seed: number, count: number, on: TimelineTable = table): CourseObstacle[] {
  const course = new Course(seed, on);
  return range(0, count - 1).map((i) => course.get(i));
}

it('is deterministic per seed', () => {
  expect(firstObstacles(12345, 300)).toEqual(firstObstacles(12345, 300));
  expect(firstObstacles(1, 20)).not.toEqual(firstObstacles(2, 20));
});

it('gives the same obstacle whichever one is asked for first', () => {
  const inOrder = firstObstacles(12345, 300);
  const lastFirst = new Course(12345, new TimelineTable(BASE_TIMELINE));
  expect(lastFirst.get(299)).toEqual(inOrder[299]);
  expect(lastFirst.get(0)).toEqual(inOrder[0]);
  expect(lastFirst.get(150)).toEqual(inOrder[150]);
  // 7 and 300 share no factor, so i × 7 mod 300 visits every index once, in a scrambled order
  const scrambled = new Course(12345, new TimelineTable(BASE_TIMELINE));
  for (const i of range(0, 299).map((n) => (n * 7) % 300)) expect(scrambled.get(i), `obstacle ${i}`).toEqual(inOrder[i]);
});

it('refuses an obstacle index that is not a whole number from 0', () => {
  const course = new Course(1, table);
  for (const i of [-1, 0.5, NaN, Infinity]) expect(() => course.get(i)).toThrow(RangeError);
});

it('spawns obstacle 0 on step 180, just off the right edge', () => {
  for (let seed = 1; seed <= 200; seed++) {
    const o = new Course(seed, table).get(0);
    expect(o.spawnStep).toBe(180);
    expect(o.worldX).toBe(1086 + 600 + typeConfig(o.type).width); // the type width, not width × size (original)
    expect(o.type).not.toBe('pterodactyl');
  }
});

it('puts each obstacle 600 + its type width ahead of the phantom scroll on its spawn step', () => {
  for (const seed of range(1, 30)) {
    for (const o of firstObstacles(seed, 300)) {
      const expected = table.scrollAfter(o.spawnStep) + 600 + typeConfig(o.type).width;
      expect(o.worldX, `seed ${seed}, obstacle ${o.index}`).toBe(expected);
    }
  }
});

it('builds each obstacle from its type: group width, height, top edge and group boxes', () => {
  for (const seed of range(1, 10)) {
    firstObstacles(seed, 300).forEach((o, i) => {
      const cfg = typeConfig(o.type);
      const where = `seed ${seed}, obstacle ${i}`;
      expect(o.index, where).toBe(i);
      expect(o.width, where).toBe(cfg.width * o.size);
      expect(o.height, where).toBe(cfg.height);
      expect(o.boxes, where).toEqual(boxesForSize(cfg, o.size));
      expect(typeof cfg.yPos === 'number' ? [cfg.yPos] : cfg.yPos, where).toContain(o.yPos);
    });
  }
});

it('keeps every gap inside the original range', () => {
  for (const seed of range(1, 30)) {
    for (const o of firstObstacles(seed, 300)) {
      // m = round(width × v + minGap × 0.6), and the gap is a whole number from m up to round(m × 1.5)
      const m = Math.round(o.width * table.speedAt(o.spawnStep) + typeConfig(o.type).minGap * 0.6);
      expect(o.gap, `seed ${seed}, obstacle ${o.index}`).toBeGreaterThanOrEqual(m);
      expect(o.gap, `seed ${seed}, obstacle ${o.index}`).toBeLessThanOrEqual(Math.round(m * 1.5));
    }
  }
});

// The original's own way to count it, on the screen of a runner who never slows down: an obstacle comes in at
// x = 600 + the width of its type, and on each later step moves left by floor(speed + offset). The next one comes on the
// first step on which this one has gone, or its right edge plus its gap is inside the world (strictly).
function stepOfNext(a: CourseObstacle): number {
  let x = 600 + typeConfig(a.type).width;
  for (let step = a.spawnStep + 1; ; step++) {
    x -= Math.floor(table.speedAt(step) + a.speedOffset);
    const right = x + a.width;
    if (right <= 0 || right + a.gap < 600) return step;
  }
}

it('lets the next obstacle come on the first step its predecessor leaves room, birds drifting included', () => {
  for (const seed of range(1, 10)) {
    const list = firstObstacles(seed, 300);
    for (let i = 1; i < list.length; i++) {
      expect(list[i]!.spawnStep, `seed ${seed}, obstacle ${i}`).toBe(stepOfNext(list[i - 1]!));
    }
  }
});

it('never puts the same type three times in a row', () => {
  let pairs = 0;
  for (const seed of range(1, 30)) {
    const types = firstObstacles(seed, 300).map((o) => o.type);
    types.forEach((type, i) => {
      if (i >= 1 && types[i - 1] === type) pairs++;
      if (i >= 2) expect(types[i - 2] === type && types[i - 1] === type, `seed ${seed}, obstacle ${i}`).toBe(false);
    });
  }
  expect(pairs).toBeGreaterThan(0); // two in a row do happen, so the rule above had something to forbid
});

it('sends birds only from speed 8.5, and groups only from their multipleSpeed', () => {
  let birds = 0;
  let groups = 0;
  for (const seed of range(1, 30)) {
    for (const o of firstObstacles(seed, 300)) {
      const speed = table.speedAt(o.spawnStep);
      const where = `seed ${seed}, obstacle ${o.index}`;
      if (o.type === 'pterodactyl') {
        birds++;
        expect(speed, where).toBeGreaterThanOrEqual(8.5);
        expect(o.size, where).toBe(1); // birds always size 1
      }
      if (o.size > 1) {
        groups++;
        expect(speed, where).toBeGreaterThanOrEqual(typeConfig(o.type).multipleSpeed);
      }
    }
  }
  expect(birds).toBeGreaterThan(0);
  expect(groups).toBeGreaterThan(0);
});

it('makes no birds and no large groups at a constant speed 6', () => {
  const flat = new TimelineTable(constantTimeline(6));
  let smallGroups = 0;
  for (const seed of range(1, 10)) {
    for (const o of firstObstacles(seed, 500, flat)) {
      expect(o.type, `seed ${seed}, obstacle ${o.index}`).not.toBe('pterodactyl');
      if (o.type === 'cactusLarge') expect(o.size, `seed ${seed}, obstacle ${o.index}`).toBe(1);
      if (o.type === 'cactusSmall' && o.size > 1) smallGroups++;
    }
  }
  expect(smallGroups).toBeGreaterThan(0); // a small cactus may group from speed 4, so large groups are missing for a reason
});

it('gives birds a height of 100, 75 or 50 and a drift of +0.8 or -0.8; cacti get 0', () => {
  const heights = new Set<number>();
  const offsets = new Set<number>();
  for (const seed of range(1, 30)) {
    for (const o of firstObstacles(seed, 300)) {
      if (o.type === 'pterodactyl') {
        heights.add(o.yPos);
        offsets.add(o.speedOffset);
      } else {
        expect(o.speedOffset, `seed ${seed}, obstacle ${o.index}`).toBe(0);
      }
    }
  }
  expect([...heights].sort((a, b) => a - b)).toEqual([50, 75, 100]);
  expect([...offsets].sort((a, b) => a - b)).toEqual([-0.8, 0.8]);
});

it('picks ground pieces from the seed', () => {
  for (const seed of [1, 5, 12345, 4294967295]) {
    expect(groundSegment(seed, 0)).toBe(0);
    expect(groundSegment(seed, 1)).toBe(1);
  }
  // pieces 2..200 contain both values and repeat for the same seed
  const pieces = range(2, 200).map((n) => groundSegment(5, n));
  expect(new Set(pieces)).toEqual(new Set([0, 1]));
  expect(range(2, 200).map((n) => groundSegment(5, n))).toEqual(pieces);
  expect(range(2, 200).map((n) => groundSegment(6, n))).not.toEqual(pieces);
});

// The stored digests are also read by the e2e test, which holds Chromium and WebKit to what Node gave.
interface DigestFixture {
  course: Record<string, string>;
  boxes: Record<string, string>;
}

const FIXTURE_PATH = fileURLToPath(new URL('../fixtures/sim-digests.json', import.meta.url));

function readFixture(): DigestFixture {
  const stored: Partial<DigestFixture> = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'));
  return { course: stored.course ?? {}, boxes: stored.boxes ?? {} };
}

// Replaces the sections given and keeps the others as they are.
function updateFixture(changes: Partial<DigestFixture>): void {
  const kept: DigestFixture = existsSync(FIXTURE_PATH) ? readFixture() : { course: {}, boxes: {} };
  mkdirSync(dirname(FIXTURE_PATH), { recursive: true });
  writeFileSync(FIXTURE_PATH, `${JSON.stringify({ ...kept, ...changes }, null, 2)}\n`);
}

it('makes a digest of 8 hex characters that changes with the seed and with n', () => {
  for (const seed of range(1, 200)) expect(courseDigest(seed, 5), `seed ${seed}`).toMatch(/^[0-9a-f]{8}$/);
  expect(courseDigest(1, 300)).not.toBe(courseDigest(2, 300));
  expect(courseDigest(1, 300)).not.toBe(courseDigest(1, 299));
});

it('matches the stored digests', () => {
  const digests = Object.fromEntries([1, 12345, 4294967295].map((seed) => [String(seed), courseDigest(seed, 300)]));
  if (process.env.UPDATE_FIXTURES === '1') {
    updateFixture({ course: digests });
    return;
  }
  const stored = readFixture().course;
  for (const [seed, digest] of Object.entries(digests)) {
    const hint = `the stored digest for seed ${seed} is missing or different; UPDATE_FIXTURES=1 rewrites it`;
    expect(stored[seed], hint).toBe(digest);
  }
});

it('makes a box digest of 8 hex characters that changes with the seed and with the player', () => {
  expect(boxDigest(1, 'solo', 20)).toMatch(/^[0-9a-f]{8}$/);
  expect(boxDigest(1, 'solo', 20)).not.toBe(boxDigest(2, 'solo', 20));
  expect(boxDigest(1, 'solo', 20)).not.toBe(boxDigest(1, 'A', 20));
  expect(boxDigest(1, 'solo', 20)).not.toBe(boxDigest(1, 'solo', 19));
});

it('matches the stored box digests', () => {
  const digests = Object.fromEntries([1, 12345, 4294967295].map((seed) => [`${seed}:solo`, boxDigest(seed, 'solo', 20)]));
  if (process.env.UPDATE_FIXTURES === '1') {
    updateFixture({ boxes: digests });
    return;
  }
  const stored = readFixture().boxes;
  for (const [key, digest] of Object.entries(digests)) {
    const hint = `the stored box digest for ${key} is missing or different; UPDATE_FIXTURES=1 rewrites it`;
    expect(stored[key], hint).toBe(digest);
  }
});
