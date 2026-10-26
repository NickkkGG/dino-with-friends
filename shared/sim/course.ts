import type { Box } from './collision';
import {
  CLEAR_STEPS, GAP_COEFFICIENT, MAX_GAP_COEFFICIENT, MAX_OBSTACLE_DUPLICATION, MAX_OBSTACLE_LENGTH, WORLD_W,
} from './constants';
import { OBSTACLE_TYPES, boxesForSize } from './obstacle-types';
import type { ObstacleType, ObstacleTypeConfig } from './obstacle-types';
import { hashParts, mulberry32, randInt } from './rng';
import type { TimelineTable } from './timeline';

/** One obstacle of a course: what the world needs to put it on the ground and to test the dino against it. */
export interface CourseObstacle {
  /** Its place in the course: 0 is the first obstacle a runner meets. */
  readonly index: number;
  readonly type: ObstacleType;
  /** How many stand together, 1 to 3. A bird is always alone. */
  readonly size: number;
  /** The width of the whole group: the width of the type × size. */
  readonly width: number;
  readonly height: number;
  /**
   * Where its left edge is in scroll coordinates, relative to the ground. On a player's screen it is at
   * x = worldX - scroll - drift, and only a bird has a drift.
   * It starts one type width past the right edge of the world, not one group width, as in the original.
   */
  readonly worldX: number;
  /** Where its top edge is. */
  readonly yPos: number;
  /** How much faster (+) or slower (-) than the ground a bird flies, in pixels per step. 0 for a cactus. */
  readonly speedOffset: number;
  /** The next obstacle comes once the right edge of this one plus this gap is inside the world: the original's rule. */
  readonly gap: number;
  /** Inner collision boxes of the whole group, ready for findCollision. */
  readonly boxes: readonly Box[];
  /** The step of the phantom runner on which it came into the world. */
  readonly spawnStep: number;
}

/** Anything that gives out the obstacles of a course by index. */
export interface CourseSource {
  get(i: number): CourseObstacle;
}

/**
 * The obstacles of one seed, in order. The same seed on the same timeline gives the same course on every engine.
 *
 * It is made by replaying the original game's spawning rules (Horizon.updateObstacles, addNewObstacle and
 * duplicateObstacleCheck, Obstacle.init and getGap) for a phantom runner who never slows down. Every step the ground
 * scrolls by what the timeline says, and the next obstacle comes as soon as the one before it leaves enough room.
 * The random numbers of obstacle i come from a generator of their own, (seed, 'obstacle', i), drawn in the original's order.
 * The timeline has to keep moving: a ground that stands still forever never makes room for the next obstacle.
 *
 * The course is worked out as far as it is asked for and kept, so any index can be asked for, in any order.
 */
export class Course implements CourseSource {
  private readonly seed: number;
  private readonly table: TimelineTable;
  private readonly list: CourseObstacle[] = [];

  // The phantom runner: the step it takes next, how far the ground has scrolled, and the obstacles still on its screen.
  private nextStep = 0;
  private scroll = 0;
  private readonly active: number[] = []; // indexes into list, oldest first
  private readonly drift = new Map<number, number>(); // birds only: how far each has flown against the ground
  private readonly history: ObstacleType[] = []; // the types of the last obstacles, newest first

  constructor(seed: number, table: TimelineTable) {
    this.seed = seed;
    this.table = table;
  }

  /** Obstacle i, counting from 0. It is worked out now if it has not been asked for yet; a bad index throws a RangeError. */
  get(i: number): CourseObstacle {
    if (!Number.isInteger(i) || i < 0) throw new RangeError(`obstacle index must be a whole number from 0, got ${i}`);
    while (this.list.length <= i) this.runStep();
    return this.list[i]!; // the loop has just made the list at least i + 1 long
  }

  // One step of the phantom runner, in the order of Horizon.updateObstacles: everything moves, what has left the screen
  // goes, and then the next obstacle may come. Nothing comes while the first 3 seconds are still clear.
  private runStep(): void {
    const step = this.nextStep;
    const speed = this.table.speedAt(step);
    this.scroll += Math.floor(speed);
    if (step >= CLEAR_STEPS) {
      this.flyBirds(speed);
      this.dropGone();
      const last = this.active.at(-1);
      if (last === undefined || this.screenRight(last) + this.obstacle(last).gap < WORLD_W) this.spawn(step, speed);
    }
    this.nextStep = step + 1;
  }

  // A bird moves floor(speed + offset) a step and the ground floor(speed): the difference is how far it drifts
  // against the ground.
  private flyBirds(speed: number): void {
    for (const j of this.active) {
      const o = this.obstacle(j);
      if (o.type !== 'pterodactyl') continue;
      const flown = Math.floor(speed + o.speedOffset) - Math.floor(speed);
      this.drift.set(j, (this.drift.get(j) ?? 0) + flown);
    }
  }

  // An obstacle that is no longer visible (its right edge is at 0 or less) is taken away, the oldest first.
  private dropGone(): void {
    let first = this.active[0];
    while (first !== undefined && this.screenRight(first) <= 0) {
      this.active.shift();
      this.drift.delete(first);
      first = this.active[0];
    }
  }

  // Where the right edge of obstacle j is on the phantom runner's screen.
  private screenRight(j: number): number {
    const o = this.obstacle(j);
    return o.worldX - this.scroll - (this.drift.get(j) ?? 0) + o.width;
  }

  private obstacle(j: number): CourseObstacle {
    return this.list[j]!; // j comes from active, which only holds indexes that are already in the list
  }

  // The original's duplicateObstacleCheck: the last MAX_OBSTACLE_DUPLICATION obstacles were all of this type already.
  private wouldRepeatTooOften(type: ObstacleType): boolean {
    return this.history.length === MAX_OBSTACLE_DUPLICATION && this.history.every((t) => t === type);
  }

  // Adds the next obstacle, at the right edge of the phantom runner's screen. The random numbers are drawn in the
  // original's order: the type (drawn again when it would repeat too often or does not come at this speed yet), the size,
  // a bird's height, a bird's direction, and the gap.
  private spawn(step: number, speed: number): void {
    const index = this.list.length;
    const rng = mulberry32(hashParts(this.seed, 'obstacle', index));
    let cfg: ObstacleTypeConfig;
    do {
      cfg = OBSTACLE_TYPES[randInt(rng, 0, OBSTACLE_TYPES.length - 1)]!; // randInt stays inside the list
    } while (this.wouldRepeatTooOften(cfg.type) || speed < cfg.minSpeed);
    let size = randInt(rng, 1, MAX_OBSTACLE_LENGTH);
    if (size > 1 && cfg.multipleSpeed > speed) size = 1; // a group only from the speed the type allows
    const width = cfg.width * size;
    // a bird picks one of its heights; randInt stays inside the list
    const yPos = typeof cfg.yPos === 'number' ? cfg.yPos : cfg.yPos[randInt(rng, 0, cfg.yPos.length - 1)]!;
    const speedOffset = cfg.speedOffset ? (rng() > 0.5 ? cfg.speedOffset : -cfg.speedOffset) : 0;
    const leastGap = Math.round(width * speed + cfg.minGap * GAP_COEFFICIENT);
    const gap = randInt(rng, leastGap, Math.round(leastGap * MAX_GAP_COEFFICIENT));
    this.list.push({
      index, type: cfg.type, size, width, height: cfg.height, worldX: this.scroll + WORLD_W + cfg.width, yPos,
      speedOffset, gap, boxes: boxesForSize(cfg, size), spawnStep: step,
    });
    this.history.unshift(cfg.type);
    this.history.length = Math.min(this.history.length, MAX_OBSTACLE_DUPLICATION);
    this.active.push(index);
    if (cfg.type === 'pterodactyl') this.drift.set(index, 0);
  }
}

/**
 * Which piece of ground comes n-th: 0 is flat, 1 is bumpy. The first two are flat and then bumpy, as the original starts,
 * and the rest are picked from the seed.
 */
export function groundSegment(seed: number, n: number): 0 | 1 {
  if (n === 0) return 0;
  if (n === 1) return 1;
  return mulberry32(hashParts(seed, 'ground', n))() > 0.5 ? 1 : 0;
}
