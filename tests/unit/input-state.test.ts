import { expect, it } from 'vitest';
import { createWorld, stepWorld } from '../../shared/sim/world';
import { InputState } from '../../src/game/input-state';

const NOTHING = { jumpPressed: false, jumpReleased: false, duckPressed: false, duckHeld: false };
const NO_RESTART = { jumpKey: false, enter: false, pointer: false };

it('Space gives one press, then a release with a restart intent', () => {
  const s = new InputState();
  s.keyDown('Space', false);
  expect(s.take()).toEqual({ step: { ...NOTHING, jumpPressed: true }, restart: NO_RESTART });
  expect(s.take()).toEqual({ step: NOTHING, restart: NO_RESTART }); // held, but pressed only once
  s.keyUp('Space');
  expect(s.take()).toEqual({ step: { ...NOTHING, jumpReleased: true }, restart: { ...NO_RESTART, jumpKey: true } });
  expect(s.take()).toEqual({ step: NOTHING, restart: NO_RESTART });

  s.keyDown('ArrowUp', false); // ↑ jumps too
  expect(s.take().step.jumpPressed).toBe(true);
  s.keyUp('ArrowUp');
  expect(s.take().restart.jumpKey).toBe(true);

  for (const enter of ['Enter', 'NumpadEnter']) {
    s.keyDown(enter, false);
    expect(s.take()).toEqual({ step: NOTHING, restart: NO_RESTART }); // Enter only restarts, and on its release
    s.keyUp(enter);
    expect(s.take()).toEqual({ step: NOTHING, restart: { ...NO_RESTART, enter: true } });
  }

  s.keyUp('Space'); // a key that never went down is no release
  s.keyDown('KeyA', false);
  s.keyUp('KeyA');
  expect(s.take()).toEqual({ step: NOTHING, restart: NO_RESTART });
});

it('a key repeat is not a new press', () => {
  const s = new InputState();
  s.keyDown('Space', false);
  s.take();
  s.keyDown('Space', true);
  expect(s.take().step.jumpPressed).toBe(false);
  s.keyDown('ArrowDown', true); // a repeat of a key that was never seen going down is not a press either
  expect(s.take().step).toEqual(NOTHING);
});

it('↓ held reports duckHeld on every frame until released', () => {
  const s = new InputState();
  s.keyDown('ArrowDown', false);
  expect(s.take().step).toEqual({ ...NOTHING, duckPressed: true, duckHeld: true });
  for (let i = 0; i < 3; i++) {
    s.keyDown('ArrowDown', true);
    expect(s.take().step).toEqual({ ...NOTHING, duckHeld: true });
  }
  s.keyUp('ArrowDown');
  expect(s.take()).toEqual({ step: NOTHING, restart: NO_RESTART });
});

it('split touch: left half ducks, right half jumps; a touch keeps its side until lifted', () => {
  const s = new InputState();
  s.setTouchMode('split');
  s.pointerDown(1, 'touch', 194, 390);
  expect(s.take().step).toEqual({ ...NOTHING, duckPressed: true, duckHeld: true });
  s.setTouchMode('any'); // the touch that is down stays a duck
  expect(s.take().step).toEqual({ ...NOTHING, duckHeld: true });
  s.pointerUp(1);
  expect(s.take()).toEqual({ step: NOTHING, restart: { ...NO_RESTART, pointer: true } });

  s.setTouchMode('split');
  s.pointerDown(2, 'touch', 195, 390); // the middle belongs to the right half
  expect(s.take().step).toEqual({ ...NOTHING, jumpPressed: true });
  s.setTouchMode('any');
  s.pointerDown(3, 'touch', 10, 390); // a touch that starts now is a jump, wherever it is
  expect(s.take().step).toEqual({ ...NOTHING, jumpPressed: true });
  s.setTouchMode('split');
  s.pointerUp(3);
  expect(s.take().step).toEqual({ ...NOTHING, jumpReleased: true }); // ... and it stays one until it is lifted
  s.pointerUp(2);
  expect(s.take()).toEqual({ step: { ...NOTHING, jumpReleased: true }, restart: { ...NO_RESTART, pointer: true } });
});

it('holding left and tapping right reports duckHeld with a jump press; the world then refuses the jump', () => {
  const w = createWorld({ seed: 7, playerId: 'solo' });
  const s = new InputState();
  s.setTouchMode('split');
  s.pointerDown(1, 'touch', 60, 390); // left thumb down
  stepWorld(w, s.take().step);
  expect(w.trex.ducking).toBe(true);

  s.pointerDown(2, 'touch', 330, 390); // right thumb taps
  s.pointerUp(2);
  const f = s.take();
  expect(f.step).toEqual({ jumpPressed: true, jumpReleased: true, duckPressed: false, duckHeld: true });
  const ev = stepWorld(w, f.step);
  expect(ev.jumped).toBe(false);
  expect(w.trex.jumping).toBe(false);
  expect(w.trex.ducking).toBe(true);
});

it('"any" mode: a touch anywhere is a jump', () => {
  const s = new InputState();
  s.setTouchMode('any');
  for (const [id, x] of [[1, 0], [2, 100], [3, 389]] as const) {
    s.pointerDown(id, 'touch', x, 390);
    expect(s.take().step).toEqual({ ...NOTHING, jumpPressed: true });
    s.pointerUp(id);
    expect(s.take()).toEqual({ step: { ...NOTHING, jumpReleased: true }, restart: { ...NO_RESTART, pointer: true } });
  }
});

it('mouse never jumps or ducks; its release is a restart pointer', () => {
  const s = new InputState();
  for (const mode of ['split', 'any'] as const) {
    s.setTouchMode(mode);
    for (const x of [10, 500]) {
      s.pointerDown(1, 'mouse', x, 600);
      expect(s.take()).toEqual({ step: NOTHING, restart: NO_RESTART });
      s.pointerUp(1);
      expect(s.take()).toEqual({ step: NOTHING, restart: { ...NO_RESTART, pointer: true } });
    }
  }
  s.pointerUp(9); // a pointer that never went down is no release
  expect(s.take().restart.pointer).toBe(false);
});

it('a cancelled touch ends its jump or duck, but is no restart', () => {
  const s = new InputState();
  s.setTouchMode('split');
  s.pointerDown(1, 'touch', 300, 390);
  s.pointerDown(2, 'touch', 50, 390);
  s.take();
  s.pointerCancel(1);
  s.pointerCancel(2);
  expect(s.take()).toEqual({ step: { ...NOTHING, jumpReleased: true }, restart: NO_RESTART });
  s.pointerUp(1); // already gone
  expect(s.take()).toEqual({ step: NOTHING, restart: NO_RESTART });
});

it('duckHeld lasts while any duck is down: ↓ and a left touch together', () => {
  const s = new InputState();
  s.setTouchMode('split');
  s.keyDown('ArrowDown', false);
  s.pointerDown(1, 'touch', 50, 390);
  s.take();
  s.keyUp('ArrowDown');
  expect(s.take().step.duckHeld).toBe(true);
  s.pointerUp(1);
  expect(s.take().step.duckHeld).toBe(false);
});

it('clear() drops every held key and touch', () => {
  const s = new InputState();
  s.keyDown('ArrowDown', false);
  s.clear();
  expect(s.take().step).toEqual({ jumpPressed: false, jumpReleased: false, duckPressed: false, duckHeld: false });

  s.keyDown('Space', false);
  s.pointerDown(1, 'touch', 50, 390);
  s.pointerDown(2, 'mouse', 50, 390);
  s.keyDown('Enter', false);
  s.take();
  s.keyUp('Enter');
  s.clear();
  expect(s.take()).toEqual({ step: NOTHING, restart: NO_RESTART }); // the Enter release before clear() is gone too
  // Lifting them afterwards is nothing: they were let go of already.
  s.keyUp('Space');
  s.pointerUp(1);
  s.pointerUp(2);
  expect(s.take()).toEqual({ step: NOTHING, restart: NO_RESTART });
  // ... and auto-repeat of a key still down after clear() does not press it again
  s.keyDown('Space', true);
  expect(s.take().step.jumpPressed).toBe(false);
});
