import {
  BOX_FIRST_TARGET, BOX_GAP_MARGIN, BOX_GAP_PER_SPEED, BOX_NEXT_TARGET, BOX_SEARCH_GAPS, BOX_SIZE, WORLD_W,
} from './constants';
import type { CourseSource } from './course';
import { hashParts, mulberry32, randInt } from './rng';
import type { TimelineTable } from './timeline';

/** What a skill box can hold: a second jump in mid-air, one more heart, the dino passing through obstacles, or a faster run. */
export type SkillId = 'doubleJump' | 'heart' | 'ghost' | 'speed';

/** The four skills, each as likely as the others. */
export const SKILLS: readonly SkillId[] = ['doubleJump', 'heart', 'ghost', 'speed'];

/** What a +1 HEART box gives instead when the hearts are already full. */
export const ALT_SKILLS = ['doubleJump', 'ghost', 'speed'] as const;

/** One skill box of a player's run. */
export interface SkillBox {
  /** Its number in the player's plan: 0 is the first box. */
  n: number;
  /** The score from which it may come into the world. */
  target: number;
  /** Where its left edge is, in scroll coordinates (relative to the ground, like CourseObstacle.worldX). */
  worldX: number;
  skill: SkillId;
  altSkill: (typeof ALT_SKILLS)[number];
  /** The index of the obstacle just before the gap the box sits in. */
  gapAfter: number;
}

/**
 * How wide a gap has to be, at a given speed, for a box in its middle to be taken safely. A dino that jumps an obstacle
 * at the last moment comes down about 26 steps' worth of ground past it, less the obstacle's own width, so the half of
 * the gap before the box has to be at least that: the obstacle before the gap counts twice.
 */
export function minBoxGap(speed: number, widthBefore: number): number {
  return Math.ceil(BOX_GAP_PER_SPEED * speed) + BOX_GAP_MARGIN - 2 * widthBefore;
}

interface BoxDraw {
  target: number;
  skill: SkillId;
  altSkill: (typeof ALT_SKILLS)[number];
}

/**
 * The skill boxes of one player in one round. Every player gets their own: the targets and the contents come from
 * (seed, playerId, 'box', n), while the gaps they sit in come from the shared course.
 * Box n waits until the score reaches its target, then takes the first wide enough gap, away from birds, among the
 * BOX_SEARCH_GAPS gaps that come after that point. With no such gap the box is skipped, and the next target still counts
 * from this one. Everything is worked out on demand and kept.
 */
export class BoxPlan {
  private readonly course: CourseSource;
  private readonly table: TimelineTable;
  private readonly seed: number;
  private readonly playerId: string;
  private readonly draws: BoxDraw[] = [];
  private readonly placed = new Map<number, SkillBox | null>();

  constructor(course: CourseSource, table: TimelineTable, seed: number, playerId: string) {
    this.course = course;
    this.table = table;
    this.seed = seed;
    this.playerId = playerId;
  }

  /** The score from which box n may come. */
  target(n: number): number {
    return this.draw(n).target;
  }

  /** Box n, or null when none of its gaps was wide enough. */
  get(n: number): SkillBox | null {
    const known = this.placed.get(n);
    if (known !== undefined) return known;
    const box = this.place(n);
    this.placed.set(n, box);
    return box;
  }

  // The random numbers of box n, drawn in this order: how far after the previous target it comes, its skill, and its
  // alternative skill.
  private draw(n: number): BoxDraw {
    if (!Number.isInteger(n) || n < 0) throw new RangeError(`no box ${n}`);
    while (this.draws.length <= n) {
      const k = this.draws.length;
      const rng = mulberry32(hashParts(this.seed, this.playerId, 'box', k));
      const [lo, hi] = k === 0 ? BOX_FIRST_TARGET : BOX_NEXT_TARGET;
      const target = (k === 0 ? 0 : this.draws[k - 1]!.target) + randInt(rng, lo, hi);
      const skill = SKILLS[randInt(rng, 0, SKILLS.length - 1)]!;
      const altSkill = ALT_SKILLS[randInt(rng, 0, ALT_SKILLS.length - 1)]!;
      this.draws.push({ target, skill, altSkill });
    }
    return this.draws[n]!;
  }

  // Where the gap after obstacle i starts, how wide it is, how wide the obstacle before it is, and where a box sits in its middle.
  private gap(i: number): { start: number; width: number; before: number; spot: number } {
    const a = this.course.get(i);
    const start = a.worldX + a.width;
    const width = this.course.get(i + 1).worldX - start;
    return { start, width, before: a.width, spot: Math.round(start + width / 2 - BOX_SIZE / 2) };
  }

  private place(n: number): SkillBox | null {
    const { target, skill, altSkill } = this.draw(n);
    // The box comes in at the right edge no sooner than the step on which a runner who never slowed down reaches the target.
    const minX = this.table.scrollAfter(this.table.firstStepWithScore(target)) + WORLD_W;
    let i = 0;
    while (this.gap(i).spot < minX) i += 1;
    for (const last = i + BOX_SEARCH_GAPS; i < last; i++) {
      if (this.course.get(i).type === 'pterodactyl' || this.course.get(i + 1).type === 'pterodactyl') continue;
      const g = this.gap(i);
      const speed = this.table.speedAt(this.table.firstStepWithScroll(g.start));
      if (g.width >= minBoxGap(speed, g.before)) return { n, target, worldX: g.spot, skill, altSkill, gapAfter: i };
    }
    return null;
  }
}
