import { expect, it } from 'vitest';
import { soundOnButtons } from '../../src/game/button-sound';
import type { ClickSource } from '../../src/game/button-sound';

type Listener = (e: { target: unknown }) => void;

/**
 * A page whose clicks the test makes, on whatever it says was clicked. As in a browser, a click reaches the page's
 * capturing listeners first, then the game's own handler, then the page's other listeners, and the promise callbacks
 * waiting by then run between one and the next.
 */
function fakePage() {
  const listeners = new Map<Listener, boolean>();
  const page: ClickSource = {
    addEventListener: (_, fn, capture = false) => void listeners.set(fn, capture),
    removeEventListener: (_, fn) => void listeners.delete(fn),
  };
  const between = async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
  };
  const click = async (target: unknown, handler: () => void = () => {}) => {
    const all = [...listeners];
    for (const [fn, capture] of all) if (capture) fn({ target });
    await between();
    handler();
    await between();
    for (const [fn, capture] of all) if (!capture) fn({ target });
    await between();
  };
  return { page, listeners, click };
}

/** A sound whose loading the test finishes when it says, and which writes down what it plays unless muted. */
function fakeSound() {
  const played: string[] = [];
  let muted = false;
  let loaded = () => {};
  const loading = new Promise<void>((resolve) => (loaded = resolve));
  const sound = {
    unlock: () => loading,
    play: (name: 'press') => void (muted || played.push(name)),
  };
  return { sound, played, loaded: () => loaded(), mute: (m: boolean) => void (muted = m) };
}

// What a click can land on: a button, or something inside one; a button that is disabled; anything else.
const button = (disabled = false) => {
  const b = { disabled };
  return { b, target: { closest: (s: string) => (s === 'button' ? b : null) } };
};
const elsewhere = { closest: () => null };

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

it('plays the press sound for a click on a button, once the sounds are loaded', async () => {
  const p = fakePage();
  const s = fakeSound();
  soundOnButtons(p.page, s.sound);
  await p.click(button().target);
  await settle();
  expect(s.played).toEqual([]); // the first press loads the sounds
  s.loaded();
  await settle();
  expect(s.played).toEqual(['press']);
  await p.click(button().target);
  await settle();
  expect(s.played).toEqual(['press', 'press']);
});

it('plays for a button that greys out as it is pressed, as CREATE LOBBY does', async () => {
  const p = fakePage();
  const s = fakeSound();
  soundOnButtons(p.page, s.sound);
  s.loaded();
  const { b, target } = button();
  await p.click(target, () => {
    b.disabled = true; // the game's handler greys it out while the lobby is made
  });
  await settle();
  expect(s.played).toEqual(['press']);
});

it('plays after the game has handled the press, so the sound button is heard turning the sound on, not off', async () => {
  const p = fakePage();
  const s = fakeSound();
  soundOnButtons(p.page, s.sound);
  s.loaded();
  await p.click(button().target, () => s.mute(true)); // SOUND OFF
  await settle();
  expect(s.played).toEqual([]);
  await p.click(button().target, () => s.mute(false)); // SOUND ON
  await settle();
  expect(s.played).toEqual(['press']);
});

it('plays nothing for a click anywhere else, or on a button that is disabled', async () => {
  const p = fakePage();
  const s = fakeSound();
  soundOnButtons(p.page, s.sound);
  s.loaded();
  for (const target of [elsewhere, button(true).target, null, {}]) await p.click(target);
  await settle();
  expect(s.played).toEqual([]);
});

it('stops with the way it gives', async () => {
  const p = fakePage();
  const s = fakeSound();
  const stop = soundOnButtons(p.page, s.sound);
  s.loaded();
  stop();
  expect(p.listeners.size).toBe(0);
  await p.click(button().target);
  await settle();
  expect(s.played).toEqual([]);
});
