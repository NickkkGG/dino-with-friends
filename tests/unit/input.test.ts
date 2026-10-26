import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { InputController } from '../../src/game/input';

// A page with no DOM: window, document and the play area are bare EventTargets with the few fields the controller reads.
let win: EventTarget;
let doc: EventTarget & { visibilityState: string };
let surface: EventTarget & { style: { touchAction: string }; getBoundingClientRect(): { left: number; width: number } };
let c: InputController;

beforeEach(() => {
  win = new EventTarget();
  doc = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  surface = Object.assign(new EventTarget(), {
    style: { touchAction: 'auto' },
    getBoundingClientRect: () => ({ left: 100, width: 400 }),
  });
  vi.stubGlobal('window', win);
  vi.stubGlobal('document', doc);
  c = new InputController(surface as unknown as HTMLElement);
});
afterEach(() => {
  c.dispose();
  vi.unstubAllGlobals();
});

// An element inside a [data-ui] control, such as the MENU button.
const uiButton = { closest: (s: string) => (s === '[data-ui]' ? {} : null) };

function send(to: EventTarget, type: string, fields: object, target?: object): Event {
  const e = Object.assign(new Event(type, { cancelable: true }), fields);
  if (target) Object.defineProperty(e, 'target', { value: target });
  to.dispatchEvent(e);
  return e;
}
const key = (type: 'keydown' | 'keyup', code: string, repeat = false, target?: object) =>
  send(win, type, { code, repeat }, target);
const pointer = (type: string, pointerId: number, pointerType: string, clientX = 0, button = 0, target?: object) =>
  send(surface, type, { pointerId, pointerType, clientX, button }, target);

it('keys on the window: Space and the arrows do not scroll the page; other keys keep their default', () => {
  expect(key('keydown', 'Space').defaultPrevented).toBe(true);
  expect(c.state.take().step.jumpPressed).toBe(true);
  expect(key('keydown', 'Space', true).defaultPrevented).toBe(true); // auto-repeat neither scrolls nor jumps
  expect(c.state.take().step.jumpPressed).toBe(false);
  for (const code of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']) expect(key('keydown', code).defaultPrevented).toBe(true);
  expect(key('keydown', 'Tab').defaultPrevented).toBe(false);
  expect(key('keydown', 'Enter').defaultPrevented).toBe(false);
  key('keyup', 'Space');
  key('keyup', 'Enter');
  expect(c.state.take().restart).toEqual({ jumpKey: true, enter: true, pointer: false });
});

it('touches split the play area at its own middle; pens are touches', () => {
  pointer('pointerdown', 1, 'touch', 299); // 199 px into a 400 px wide area: left half
  expect(c.state.take().step).toMatchObject({ duckPressed: true, duckHeld: true });
  pointer('pointerdown', 2, 'pen', 300); // the middle
  expect(c.state.take().step).toMatchObject({ jumpPressed: true, duckHeld: true });
  pointer('pointerup', 2, 'pen', 300);
  pointer('pointercancel', 1, 'touch', 299);
  expect(c.state.take()).toEqual({
    step: { jumpPressed: false, jumpReleased: true, duckPressed: false, duckHeld: false },
    restart: { jumpKey: false, enter: false, pointer: true },
  });
  expect(surface.style.touchAction).toBe('none');
});

it('a left click is a restart pointer; other mouse buttons are nothing', () => {
  pointer('pointerdown', 1, 'mouse', 300, 2);
  pointer('pointerup', 1, 'mouse', 300, 2);
  expect(c.state.take().restart.pointer).toBe(false);
  pointer('pointerdown', 1, 'mouse', 300, 0);
  pointer('pointerup', 1, 'mouse', 300, 0);
  expect(c.state.take().restart.pointer).toBe(true);
});

it('the MENU button and the speaker (data-ui) are left to themselves', () => {
  const k = key('keydown', 'Space', false, uiButton);
  expect(k.defaultPrevented).toBe(false); // Space presses the focused button
  pointer('pointerdown', 1, 'touch', 450, 0, uiButton);
  pointer('pointerup', 1, 'touch', 450, 0, uiButton);
  pointer('pointerdown', 2, 'mouse', 450, 0, uiButton);
  pointer('pointerup', 2, 'mouse', 450, 0, uiButton);
  key('keyup', 'Space', false, uiButton);
  expect(c.state.take()).toEqual({
    step: { jumpPressed: false, jumpReleased: false, duckPressed: false, duckHeld: false },
    restart: { jumpKey: false, enter: false, pointer: false },
  });
});

it('losing focus or hiding the tab lets go of everything', () => {
  key('keydown', 'ArrowDown');
  c.state.take();
  win.dispatchEvent(new Event('blur'));
  expect(c.state.take().step.duckHeld).toBe(false);

  pointer('pointerdown', 1, 'touch', 120);
  c.state.take();
  doc.dispatchEvent(new Event('visibilitychange')); // still visible: nothing happens
  expect(c.state.take().step.duckHeld).toBe(true);
  doc.visibilityState = 'hidden';
  doc.dispatchEvent(new Event('visibilitychange'));
  expect(c.state.take().step.duckHeld).toBe(false);
});

it('dispose removes every listener and gives touch-action back', () => {
  c.dispose();
  expect(surface.style.touchAction).toBe('auto');
  expect(key('keydown', 'Space').defaultPrevented).toBe(false);
  pointer('pointerdown', 1, 'touch', 450);
  expect(c.state.take().step.jumpPressed).toBe(false);
  key('keydown', 'ArrowDown'); // not seen, so a blur after dispose has nothing to clear either
  win.dispatchEvent(new Event('blur'));
  expect(c.state.take().step.duckHeld).toBe(false);
});
