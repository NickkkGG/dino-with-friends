import { SCORE_COEFFICIENT, SPEED_ACCEL, SPEED_MAX, SPEED_START } from './constants';

/**
 * How fast the ground scrolls, in world pixels per step, worked out from the step number alone.
 * Steps count from 0, and a timeline never runs backwards: its speed is never negative.
 */
export interface Timeline {
  speedAt(step: number): number;
}

/** The speed of a normal round: SPEED_START, SPEED_ACCEL more every step, and no more than SPEED_MAX. */
export const BASE_TIMELINE: Timeline = {
  // Worked out from the step number, not added up from step to step, so it comes out the same wherever it is asked.
  speedAt: (step) => Math.min(SPEED_MAX, SPEED_START + SPEED_ACCEL * step),
};

export function constantTimeline(speed: number): Timeline {
  return { speedAt: () => speed };
}

/** The score shown for a distance, the same as the original game: round(ceil(distance) * SCORE_COEFFICIENT). */
export function scoreOf(distance: number): number {
  return Math.round(Math.ceil(distance) * SCORE_COEFFICIENT);
}

/**
 * What a timeline adds up to, step by step. "After step k" includes step k itself.
 * The table fills itself in the first time a step is asked for and keeps what it has worked out.
 */
export class TimelineTable {
  private readonly timeline: Timeline;
  private readonly scrolls: number[] = [];
  private readonly distances: number[] = [];
  private scrollTotal = 0;
  private distanceTotal = 0;

  constructor(timeline: Timeline) {
    this.timeline = timeline;
  }

  speedAt(step: number): number {
    return this.timeline.speedAt(step);
  }

  /** Whole pixels the ground has scrolled after step k: floor(speedAt(j)) added up for j = 0..k. */
  scrollAfter(step: number): number {
    return this.entry(this.scrolls, step);
  }

  /** The distance run after step k, which the score comes from: speedAt(j) added up for j = 0..k, in that order. */
  distanceAfter(step: number): number {
    return this.entry(this.distances, step);
  }

  /** The first step after which the score has reached `score`. The timeline has to get that far. */
  firstStepWithScore(score: number): number {
    return this.firstStepWhere((step) => scoreOf(this.distanceAfter(step)) >= score);
  }

  /** The first step after which the ground has scrolled `scroll` pixels. The timeline has to get that far. */
  firstStepWithScroll(scroll: number): number {
    return this.firstStepWhere((step) => this.scrollAfter(step) >= scroll);
  }

  private entry(column: readonly number[], step: number): number {
    if (!Number.isInteger(step)) throw new RangeError(`step must be a whole number, got ${step}`);
    if (step < 0) return 0; // nothing has run before step 0
    this.fillTo(step);
    return column[step]!; // fillTo has just made every column at least step + 1 long
  }

  private fillTo(step: number): void {
    while (this.scrolls.length <= step) {
      const speed = this.timeline.speedAt(this.scrolls.length);
      this.scrollTotal += Math.floor(speed);
      this.distanceTotal += speed;
      this.scrolls.push(this.scrollTotal);
      this.distances.push(this.distanceTotal);
    }
  }

  // A binary search. `reached` stays true once it has turned true, because a timeline never runs backwards.
  // The table has no end, so the upper bound is found first, by doubling.
  private firstStepWhere(reached: (step: number) => boolean): number {
    let low = 0; // every step below `low` is known to fall short
    let high = 1;
    while (!reached(high)) {
      low = high + 1;
      high *= 2;
    }
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (reached(middle)) high = middle;
      else low = middle + 1;
    }
    return low;
  }
}
