import { TREX_W, TREX_X } from './constants';
import { NO_INPUT, cloneWorld, currentSpeed, stepWorld, visibleObstacles } from './world';
import type { ObstacleView, StepInput, World } from './world';

/** Whether to jump now. It is only asked while the dino is on the ground. */
export type Policy = (w: World) => boolean;

const JUMP: StepInput = { ...NO_INPUT, jumpPressed: true };

// How long a test jump is followed before it counts as a failure: far longer than any jump.
const GIVE_UP_STEPS = 120;

// The obstacle the dino has to deal with next: the first one whose right edge is still ahead of the dino's left edge.
function target(w: World): ObstacleView | null {
  return visibleObstacles(w).find((o) => o.x + o.width > TREX_X) ?? null;
}

/**
 * Whether a full jump pressed `delay` steps from now takes the dino past the next obstacle without touching it. It is
 * tried on a copy of the world: wait `delay` steps on the ground, press jump once, and never let go.
 */
export function clears(w: World, delay: number): boolean {
  const o = target(w);
  if (!o) return false;
  if (o.x > TREX_X + TREX_W + 40 * Math.floor(currentSpeed(w))) return false; // too far for any jump yet
  const c = cloneWorld(w);
  for (let k = 0; k < GIVE_UP_STEPS; k++) {
    if (stepWorld(c, k === delay ? JUMP : NO_INPUT).overlap) return false;
    const p = visibleObstacles(c).find((v) => v.index === o.index);
    if (!p || p.x + p.width <= TREX_X) return true; // it went by with no touch
    // Once the key has been pressed, a dino back on the ground before the obstacle has reached it jumped too soon.
    // While it still waits to press, the dino is on the ground on purpose.
    if (k >= delay && !c.trex.jumping && p.x > TREX_X + TREX_W) return false;
  }
  return false;
}

/** Jumps as soon as a jump would clear the next obstacle: the safest way through at a steady speed (the title demo). */
export const earliestSafe: Policy = (w) => clears(w, 0);

/** Jumps at the last step from which a jump still clears the next obstacle: the test that skill boxes can be taken. */
export const latestSafe: Policy = (w) => clears(w, 0) && !clears(w, 1);

/** What a bot presses: a jump when the policy says so and the dino is on the ground. It never lets go and never ducks. */
export function botInput(w: World, policy: Policy): StepInput {
  return { ...NO_INPUT, jumpPressed: !w.trex.jumping && policy(w) };
}
