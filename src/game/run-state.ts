import type { RunState } from '../../shared/lobby/protocol';
import { INVULN_STEPS, STEP_MS } from '../../shared/sim/constants';
import { currentSpeed, skillRemaining } from '../../shared/sim/world';
import type { World } from '../../shared/sim/world';

/** A race sends its state every this many steps: ten times a second. */
export const STATE_EVERY_STEPS = 6;

const ms = (steps: number): number => Math.round(steps * STEP_MS);

/** A world as the lobby and the others in the race see it. */
export function runState(w: World): RunState {
  const { trex } = w;
  // Safe while the step number is at most hitStep + INVULN_STEPS, as isInvulnerable has it.
  const safeSteps = w.hitStep === null ? 0 : Math.max(0, w.hitStep + INVULN_STEPS + 1 - w.step);
  return {
    t: ms(w.step),
    d: w.distance,
    y: trex.y,
    pose: trex.jumping ? 'jump' : trex.ducking ? 'duck' : 'run',
    hp: w.hp,
    hurt: ms(safeSteps),
    fx: {
      doubleJump: ms(skillRemaining(w, 'doubleJump')),
      ghost: ms(skillRemaining(w, 'ghost')),
      speed: ms(skillRemaining(w, 'speed')),
    },
    got: w.boxIndex,
    spd: currentSpeed(w),
  };
}
