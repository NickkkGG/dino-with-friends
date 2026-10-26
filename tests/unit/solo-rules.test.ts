import { expect, it } from 'vitest';
import { RESTART_DELAY_MS, canRestart, nextHi } from '../../src/game/solo-rules';

it('Enter restarts at once; jump keys and taps after 1200 ms', () => {
  expect(RESTART_DELAY_MS).toBe(1200); // gameoverClearTime in the original
  expect(canRestart('enter', 0)).toBe(true);
  expect(canRestart('jumpKey', 1199)).toBe(false);
  expect(canRestart('jumpKey', 1200)).toBe(true);
  expect(canRestart('pointer', 1199)).toBe(false);
  expect(canRestart('pointer', 1200)).toBe(true);
});

it('keeps the best score', () => {
  expect(nextHi(120, 80)).toBe(120);
  expect(nextHi(120, 130)).toBe(130);
  expect(nextHi(0, 0)).toBe(0);
});
