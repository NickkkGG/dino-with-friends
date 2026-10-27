import { STEP_MS } from '../../shared/sim/constants';

/** The most steps a race runs in one go to catch up with the shared clock: 250 ms. Any more are skipped. */
export const MAX_CATCHUP_STEPS = 15;

// A whole number of steps a hair short in floating point still counts, as in stepsFor.
const EPSILON = 1e-9;

/**
 * What a race whose world has run `step` steps does to be on time `elapsedMs` after the round's start: steps to skip
 * (see skipSteps), then steps to run. A world that is ahead waits.
 */
export function stepsDue(step: number, elapsedMs: number): { skip: number; run: number } {
  const target = elapsedMs < 0 ? 0 : Math.floor(elapsedMs / STEP_MS + EPSILON);
  const behind = target - step;
  if (behind <= 0) return { skip: 0, run: 0 };
  if (behind <= MAX_CATCHUP_STEPS) return { skip: 0, run: behind };
  return { skip: behind - MAX_CATCHUP_STEPS, run: MAX_CATCHUP_STEPS };
}
