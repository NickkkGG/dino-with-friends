import { expect, it } from 'vitest';
import { ALT_SKILLS, BoxPlan, SKILLS, minBoxGap } from '../../shared/sim/boxes';
import type { SkillBox, SkillId } from '../../shared/sim/boxes';
import { BOX_GAP_MARGIN, BOX_GAP_PER_SPEED, BOX_SEARCH_GAPS, BOX_SIZE, WORLD_W } from '../../shared/sim/constants';
import { Course } from '../../shared/sim/course';
import type { CourseObstacle, CourseSource } from '../../shared/sim/course';
import { boxesForSize, typeConfig } from '../../shared/sim/obstacle-types';
import { BASE_TIMELINE, TimelineTable } from '../../shared/sim/timeline';

const table = new TimelineTable(BASE_TIMELINE);

const range = (from: number, to: number): number[] => Array.from({ length: to - from + 1 }, (_, i) => from + i);

const plans = new Map<number, Course>();
function courseOf(seed: number): Course {
  let c = plans.get(seed);
  if (!c) { c = new Course(seed, table); plans.set(seed, c); }
  return c;
}
const planOf = (seed: number, player: string): BoxPlan => new BoxPlan(courseOf(seed), table, seed, player);

// The gap after obstacle i: where it starts, how wide it is, the speed of a runner reaching it, and the box spot in it.
function gapAfter(course: CourseSource, i: number) {
  const a = course.get(i);
  const b = course.get(i + 1);
  const start = a.worldX + a.width;
  const width = b.worldX - start;
  const v = table.speedAt(table.firstStepWithScroll(start));
  return { a, b, start, width, v, spot: Math.round(start + width / 2 - BOX_SIZE / 2) };
}

const qualifies = (g: ReturnType<typeof gapAfter>): boolean =>
  g.a.type !== 'pterodactyl' && g.b.type !== 'pterodactyl' && g.width >= minBoxGap(g.v, g.a.width);

it('puts box 0 at a target of 150..300 and each next one 400..700 later', () => {
  for (const seed of range(1, 50)) {
    for (const player of ['solo', 'A', 'B']) {
      const plan = planOf(seed, player);
      expect(plan.target(0)).toBeGreaterThanOrEqual(150);
      expect(plan.target(0)).toBeLessThanOrEqual(300);
      for (const n of range(1, 20)) {
        const step = plan.target(n) - plan.target(n - 1);
        expect(step, `seed ${seed}, ${player}, box ${n}`).toBeGreaterThanOrEqual(400);
        expect(step, `seed ${seed}, ${player}, box ${n}`).toBeLessThanOrEqual(700);
      }
    }
  }
});

it('gives the same boxes for the same seed and player, in any order of asking', () => {
  const inOrder = range(0, 9).map((n) => planOf(3, 'solo').get(n));
  const a = planOf(3, 'solo');
  const backwards = range(0, 9).reverse().map((n) => a.get(n)).reverse();
  expect(backwards).toEqual(inOrder);
  const b = planOf(3, 'solo');
  expect(range(0, 9).map((n) => b.get(n))).toEqual(inOrder);
  expect(a.get(4)).toBe(a.get(4)); // worked out once and kept
});

it('gives different players different boxes for the same seed', () => {
  const a = planOf(1, 'A');
  const b = planOf(1, 'B');
  const differs = range(0, 4).some((n) => a.target(n) !== b.target(n) || a.get(n)?.worldX !== b.get(n)?.worldX);
  expect(differs).toBe(true);
});

it('places a box in the middle of the first wide enough gap among the first 5 after the target', () => {
  let placed = 0;
  for (const seed of range(1, 50)) {
    const course = courseOf(seed);
    const plan = planOf(seed, 'solo');
    for (const n of range(0, 9)) {
      const box = plan.get(n);
      if (!box) continue;
      placed += 1;
      const where = `seed ${seed}, box ${n}`;
      const g = gapAfter(course, box.gapAfter);
      expect(g.a.type, where).not.toBe('pterodactyl');
      expect(g.b.type, where).not.toBe('pterodactyl');
      expect(g.width, where).toBeGreaterThanOrEqual(minBoxGap(g.v, g.a.width));
      expect(box.worldX, where).toBe(g.spot);
      const minX = table.scrollAfter(table.firstStepWithScore(box.target)) + WORLD_W;
      expect(box.worldX, where).toBeGreaterThanOrEqual(minX);
      expect([box.n, box.target], where).toEqual([n, plan.target(n)]);
      // the search starts at the first gap whose spot is at or past minX, and looks at no more than 5 gaps
      let first = 0;
      while (gapAfter(course, first).spot < minX) first += 1;
      expect(box.gapAfter - first, where).toBeGreaterThanOrEqual(0);
      expect(box.gapAfter - first, where).toBeLessThan(BOX_SEARCH_GAPS);
      for (let i = first; i < box.gapAfter; i++) expect(qualifies(gapAfter(course, i)), `${where}, gap ${i}`).toBe(false);
    }
  }
  expect(placed).toBeGreaterThan(250); // most boxes find a gap, so the checks above ran on many
});

it('skips a box when none of the 5 gaps qualifies, and still counts the next target from it', () => {
  // A course of single small cacti 100 px apart: no gap is ever wide enough.
  const cfg = typeConfig('cactusSmall');
  const narrow: CourseSource = {
    get: (i: number): CourseObstacle => ({
      index: i, type: 'cactusSmall', size: 1, width: cfg.width, height: cfg.height, worldX: 1700 + i * (cfg.width + 100),
      yPos: 105, speedOffset: 0, gap: 100, boxes: boxesForSize(cfg, 1), spawnStep: 180 + i * 10,
    }),
  };
  const skipped = new BoxPlan(narrow, table, 9, 'solo');
  const real = planOf(9, 'solo');
  for (const n of range(0, 5)) {
    expect(skipped.get(n), `box ${n}`).toBeNull();
    expect(skipped.target(n)).toBe(real.target(n)); // the targets do not depend on where the boxes went
  }
});

it('fills boxes with the four skills about equally', () => {
  const counts: Record<SkillId, number> = { doubleJump: 0, heart: 0, ghost: 0, speed: 0 };
  let total = 0;
  for (const seed of range(1, 300)) {
    const plan = planOf(seed, 'solo');
    for (const n of range(0, 19)) {
      const box = plan.get(n);
      if (!box) continue;
      counts[box.skill] += 1;
      total += 1;
    }
  }
  expect(total).toBeGreaterThanOrEqual(4000);
  for (const skill of SKILLS) {
    expect(counts[skill] / total, skill).toBeGreaterThan(0.22);
    expect(counts[skill] / total, skill).toBeLessThan(0.28);
  }
});

it('never uses heart as the alternative', () => {
  const seen = new Set<string>();
  for (const seed of range(1, 60)) {
    const plan = planOf(seed, 'A');
    for (const n of range(0, 9)) {
      const box: SkillBox | null = plan.get(n);
      if (box) seen.add(box.altSkill);
    }
  }
  expect([...seen].sort()).toEqual([...ALT_SKILLS].sort());
  expect(SKILLS).toEqual(['doubleJump', 'heart', 'ghost', 'speed']);
});

it('minBoxGap = ceil(BOX_GAP_PER_SPEED × speed) + BOX_GAP_MARGIN − 2 × the width of the obstacle before the gap', () => {
  for (const v of [6, 6.001, 7.5, 13]) {
    expect(minBoxGap(v, 0), `speed ${v}`).toBe(Math.ceil(BOX_GAP_PER_SPEED * v) + BOX_GAP_MARGIN);
    expect(Number.isInteger(minBoxGap(v, 0))).toBe(true);
  }
  expect(minBoxGap(6.001, 0)).toBe(minBoxGap(6, 0) + 1); // rounded up
  // a wider obstacle before the gap: the dino comes down sooner after it, so the gap may be narrower
  expect(minBoxGap(13, 75)).toBe(minBoxGap(13, 0) - 150);
  expect(minBoxGap(13, 17)).toBe(minBoxGap(13, 0) - 34);
});
