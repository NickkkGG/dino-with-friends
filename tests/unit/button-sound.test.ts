import { expect, it } from 'vitest';
import { soundOnButtons } from '../../src/game/button-sound';
import type { ClickSource } from '../../src/game/button-sound';

/** A page whose clicks the test makes, on whatever it says was clicked. */
function fakePage() {
  const listeners = new Set<(e: { target: unknown }) => void>();
  const page: ClickSource = {
    addEventListener: (_, fn) => void listeners.add(fn),
    removeEventListener: (_, fn) => void listeners.delete(fn),
  };
  const click = (target: unknown) => {
    for (const fn of [...listeners]) fn({ target });
  };
  return { page, listeners, click };
}

/** A sound whose loading the test finishes when it says, and which writes down what it plays. */
function fakeSound() {
  const played: string[] = [];
  let loaded = () => {};
  const loading = new Promise<void>((resolve) => (loaded = resolve));
  const sound = {
    unlock: () => loading,
    play: (name: 'press') => void played.push(name),
  };
  return { sound, played, loaded: () => loaded() };
}

// What a click can land on: a button, or something inside one; a button that is disabled; anything else.
const onButton = { closest: (s: string) => (s === 'button' ? { disabled: false } : null) };
const onDisabled = { closest: (s: string) => (s === 'button' ? { disabled: true } : null) };
const elsewhere = { closest: () => null };

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

it('plays the press sound for a click on a button, once the sounds are loaded', async () => {
  const p = fakePage();
  const s = fakeSound();
  soundOnButtons(p.page, s.sound);
  p.click(onButton);
  await settle();
  expect(s.played).toEqual([]); // the first press loads the sounds
  s.loaded();
  await settle();
  expect(s.played).toEqual(['press']);
  p.click(onButton);
  await settle();
  expect(s.played).toEqual(['press', 'press']);
});

it('plays nothing for a click anywhere else, or on a button that is disabled', async () => {
  const p = fakePage();
  const s = fakeSound();
  soundOnButtons(p.page, s.sound);
  s.loaded();
  for (const target of [elsewhere, onDisabled, null, {}]) p.click(target);
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
  p.click(onButton);
  await settle();
  expect(s.played).toEqual([]);
});
