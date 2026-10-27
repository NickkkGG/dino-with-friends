import { expect, it } from 'vitest';
import { holdScreenOn } from '../../src/game/wake-lock';
import type { ScreenLock, WakeLockNavigator } from '../../src/game/wake-lock';

/** A browser whose wake lock answers each request when the test says, and counts the locks let go. */
function fakeNav() {
  const asked: { grant(): void; refuse(e: unknown): void }[] = [];
  let released = 0;
  const lock = (): ScreenLock => ({
    release: async () => {
      released += 1;
    },
  });
  const nav: WakeLockNavigator = {
    wakeLock: {
      request: (type) => {
        expect(type).toBe('screen');
        return new Promise<ScreenLock>((resolve, reject) => asked.push({ grant: () => resolve(lock()), refuse: reject }));
      },
    },
  };
  return { nav, asked, released: () => released };
}

/** A page that the test shows and hides. */
function fakeDoc() {
  const listeners = new Set<() => void>();
  const doc = {
    visibilityState: 'visible',
    addEventListener: (_: 'visibilitychange', fn: () => void) => void listeners.add(fn),
    removeEventListener: (_: 'visibilitychange', fn: () => void) => void listeners.delete(fn),
  };
  const show = (state: 'visible' | 'hidden') => {
    doc.visibilityState = state;
    for (const fn of [...listeners]) fn();
  };
  return { doc, listeners, show };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

it('asks for the screen to stay on, and lets go', async () => {
  const n = fakeNav();
  const d = fakeDoc();
  const letGo = holdScreenOn(n.nav, d.doc);
  expect(n.asked).toHaveLength(1);
  n.asked[0]!.grant();
  await settle();
  letGo();
  await settle();
  expect(n.released()).toBe(1);
  expect(d.listeners.size).toBe(0);
});

it('asks again each time the page is shown', async () => {
  const n = fakeNav();
  const d = fakeDoc();
  holdScreenOn(n.nav, d.doc);
  n.asked[0]!.grant();
  await settle();
  d.show('hidden'); // the browser lets go of the lock of a hidden page
  expect(n.asked).toHaveLength(1);
  d.show('visible');
  expect(n.asked).toHaveLength(2);
});

it('lets go of a lock that comes after it was let go', async () => {
  const n = fakeNav();
  const d = fakeDoc();
  const letGo = holdScreenOn(n.nav, d.doc);
  letGo();
  n.asked[0]!.grant();
  await settle();
  expect(n.released()).toBe(1);
});

it('does nothing where the browser has no wake lock, or refuses one', async () => {
  const d = fakeDoc();
  expect(() => holdScreenOn({}, d.doc)()).not.toThrow();
  const n = fakeNav();
  const letGo = holdScreenOn(n.nav, d.doc);
  n.asked[0]!.refuse(new DOMException('no', 'NotAllowedError'));
  await settle();
  letGo();
  await settle();
  expect(n.released()).toBe(0);
});
