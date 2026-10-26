import { STEP_MS } from '../../shared/sim/constants';

/** The most time one frame may make up for, so a slow frame or a stall does not make the world jump ahead. */
export const MAX_FRAME_MS = 250;

// A whole number of steps a hair short in floating point (250 ms is 14.999999999999998 steps of 1000 / 60) still counts.
const EPSILON = 1e-9;

/** How many 60 Hz steps are due once `dt` more milliseconds (at most `maxMs`) have passed, and what is left over. */
export function stepsFor(acc: number, dt: number, maxMs = MAX_FRAME_MS): { steps: number; acc: number } {
  const total = acc + Math.min(dt, maxMs);
  const steps = Math.floor(total / STEP_MS + EPSILON);
  return { steps, acc: Math.max(0, total - steps * STEP_MS) };
}

interface LoopOptions {
  /** How much faster than real time the world runs. Default 1. */
  timeScale?: number;
  now?: () => number;
  raf?: (cb: FrameRequestCallback) => number;
  caf?: (id: number) => void;
}

/**
 * Runs the world in fixed 60 Hz steps, as many as the time since the last frame calls for, and draws once per frame
 * after them, so the game runs at the same speed on any display.
 */
export class FixedStepLoop {
  private readonly onStep: () => void;
  private readonly onRender: () => void;
  private readonly timeScale: number;
  private readonly now: () => number;
  private readonly raf: (cb: FrameRequestCallback) => number;
  private readonly caf: (id: number) => void;
  private last = 0;
  private acc = 0;
  private frameId: number | null = null;

  constructor(onStep: () => void, onRender: () => void, o: LoopOptions = {}) {
    this.onStep = onStep;
    this.onRender = onRender;
    this.timeScale = o.timeScale ?? 1;
    this.now = o.now ?? (() => performance.now());
    this.raf = o.raf ?? ((cb) => requestAnimationFrame(cb));
    this.caf = o.caf ?? ((id) => cancelAnimationFrame(id));
  }

  get running(): boolean {
    return this.frameId !== null;
  }

  /** Starts asking for frames. The clock starts now, so the time before does not come out as a burst of steps. */
  start(): void {
    if (this.running) return;
    this.resetClock();
    this.frameId = this.raf(this.frame);
  }

  stop(): void {
    if (this.frameId === null) return;
    this.caf(this.frameId);
    this.frameId = null;
  }

  /** Forgets the time since the last frame, as after a pause. */
  resetClock(): void {
    this.last = this.now();
    this.acc = 0;
  }

  private readonly frame = (): void => {
    const now = this.now();
    const due = stepsFor(this.acc, (now - this.last) * this.timeScale, MAX_FRAME_MS * this.timeScale);
    this.last = now;
    this.acc = due.acc;
    for (let i = 0; i < due.steps && this.running; i++) this.onStep();
    if (!this.running) return;
    this.onRender();
    if (this.running) this.frameId = this.raf(this.frame);
  };
}
