import { expect, it } from 'vitest';
import { FixedStepLoop, FrameLoop, stepsFor } from '../../src/game/loop';

it('runs one step per 1000/60 ms and keeps the remainder', () => {
  expect(stepsFor(0, 1000 / 60).steps).toBe(1);
  expect(stepsFor(0, 8.4).steps).toBe(0);
  expect(stepsFor(8.4, 8.4).steps).toBe(1);
  expect(stepsFor(0, 8.4).acc).toBe(8.4);
  expect(stepsFor(8.4, 8.4).acc).toBeCloseTo(16.8 - 1000 / 60, 9);
  expect(stepsFor(0, 2000 / 60)).toEqual({ steps: 2, acc: 0 }); // exactly two steps, nothing left over
});

it('catches up at most 250 ms', () => {
  expect(stepsFor(0, 1000).steps).toBe(15);
  expect(stepsFor(0, 250).steps).toBe(15);
  expect(stepsFor(0, 1000).acc).toBe(0);
  expect(stepsFor(0, 1000, 500).steps).toBe(30);
});

// A loop on a fake clock: frame() runs the frame the loop asked for, after `ms` milliseconds.
function fakeLoop(timeScale?: number) {
  let t = 1000;
  let pending: FrameRequestCallback | null = null;
  let nextId = 1;
  const log: string[] = [];
  const loop = new FixedStepLoop(() => log.push('step'), () => log.push('render'), {
    timeScale,
    now: () => t,
    raf: (cb) => {
      pending = cb;
      return nextId++;
    },
    caf: () => {
      pending = null;
    },
  });
  const frame = (ms: number): string[] => {
    t += ms;
    log.length = 0;
    const cb = pending;
    pending = null;
    cb?.(t);
    return [...log];
  };
  return { loop, frame, wait: (ms: number) => (t += ms), asked: () => pending !== null };
}

it('steps at 60 Hz whatever the display does, rendering once per frame', () => {
  const { loop, frame } = fakeLoop();
  loop.start();
  expect(loop.running).toBe(true);
  expect(frame(1000 / 60)).toEqual(['step', 'render']);
  expect(frame(1000 / 120)).toEqual(['render']); // 120 Hz: a step every other frame
  expect(frame(1000 / 120)).toEqual(['step', 'render']);
  expect(frame(1000 / 30)).toEqual(['step', 'step', 'render']); // 30 Hz: two steps a frame
});

it('a new loop starts without a burst', () => {
  const { loop, frame } = fakeLoop(); // the clock is at 1000 ms, long after the page opened
  loop.start();
  expect(frame(1000 / 60).filter((e) => e === 'step')).toHaveLength(1);
});

it('resetClock means no burst after a pause', () => {
  const { loop, frame, wait, asked } = fakeLoop();
  loop.start();
  frame(1000 / 60);
  loop.stop();
  expect(loop.running).toBe(false);
  expect(asked()).toBe(false);
  wait(5000);
  loop.resetClock();
  loop.start();
  expect(frame(1000 / 60).filter((e) => e === 'step').length).toBeLessThanOrEqual(1);

  // The same while it keeps running: a long gap, then resetClock before the next frame.
  wait(5000);
  loop.resetClock();
  expect(frame(1000 / 60).filter((e) => e === 'step').length).toBeLessThanOrEqual(1);
});

it('timeScale 4 runs four steps per 60 Hz frame', () => {
  const { loop, frame } = fakeLoop(4);
  loop.start();
  expect(frame(1000 / 60).filter((e) => e === 'step')).toHaveLength(4);
  expect(frame(1000).filter((e) => e === 'step')).toHaveLength(60); // a long frame still counts as 250 ms
});

it('stop() from inside a step ends the frame: no more steps, no more frames', () => {
  let steps = 0;
  let pending: FrameRequestCallback | null = null;
  let t = 0;
  const loop: FixedStepLoop = new FixedStepLoop(
    () => {
      steps += 1;
      loop.stop();
    },
    () => {},
    { now: () => t, raf: (cb) => ((pending = cb), 1), caf: () => {} },
  );
  loop.start();
  t += 100; // six steps due
  const cb = pending as FrameRequestCallback | null;
  pending = null;
  cb?.(t);
  expect(steps).toBe(1);
  expect(pending).toBeNull();
  expect(loop.running).toBe(false);
});

// A FrameLoop on a fake display: frame() runs the frame the loop asked for, if it asked for one.
function fakeFrames(onFrame: () => void) {
  let pending: FrameRequestCallback | null = null;
  const loop = new FrameLoop(onFrame, {
    raf: (cb) => {
      pending = cb;
      return 1;
    },
    caf: () => {
      pending = null;
    },
  });
  const frame = () => {
    const cb = pending;
    pending = null;
    cb?.(0);
  };
  return { loop, frame, asked: () => pending !== null };
}

it('calls onFrame once a frame until stopped', () => {
  let frames = 0;
  const { loop, frame, asked } = fakeFrames(() => frames++);
  expect(loop.running).toBe(false);
  loop.start();
  loop.start(); // once is enough
  expect(loop.running).toBe(true);
  frame();
  frame();
  frame();
  expect(frames).toBe(3);
  loop.stop();
  expect(loop.running).toBe(false);
  expect(asked()).toBe(false);
  frame();
  expect(frames).toBe(3);
  loop.start();
  frame();
  expect(frames).toBe(4);
});

it('a FrameLoop stopped from inside onFrame asks for no more frames', () => {
  let frames = 0;
  const { loop, frame, asked } = fakeFrames(() => {
    frames += 1;
    loop.stop();
  });
  loop.start();
  frame();
  expect(frames).toBe(1);
  expect(asked()).toBe(false);
  expect(loop.running).toBe(false);
});
