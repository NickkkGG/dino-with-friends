import { expect, it } from 'vitest';
import { NO_TEST_MODE, parseTestMode } from '../../src/game/test-mode';

it('reads seed, timeScale (1..8), box, invincible and autopilot only in dev', () => {
  const all = '?seed=7&timeScale=4&box=ghost&invincible=1&autopilot=1';
  expect(parseTestMode(all, true)).toEqual({ seed: 7, timeScale: 4, box: 'ghost', invincible: true, autopilot: true });
  expect(parseTestMode(all, false)).toEqual(NO_TEST_MODE);
  expect(NO_TEST_MODE).toEqual({ seed: null, timeScale: 1, box: null, invincible: false, autopilot: false });
  expect(parseTestMode('', true)).toEqual(NO_TEST_MODE);
  expect(parseTestMode('?view=solo', true)).toEqual(NO_TEST_MODE);
});

it('keeps every value in range, and ignores the ones it cannot read', () => {
  const t = (q: string) => parseTestMode(q, true);
  expect(t('?timeScale=20').timeScale).toBe(8);
  expect(t('?timeScale=0').timeScale).toBe(1);
  expect(t('?timeScale=2.5').timeScale).toBe(2.5);
  expect(t('?timeScale=fast').timeScale).toBe(1);
  expect(t('?seed=0').seed).toBe(0);
  expect(t('?seed=4294967295').seed).toBe(4294967295);
  for (const bad of ['-3', 'abc', '1.5', '4294967296', '']) expect(t(`?seed=${bad}`).seed).toBeNull();
  for (const id of ['doubleJump', 'heart', 'ghost', 'speed'] as const) expect(t(`?box=${id}`).box).toBe(id);
  expect(t('?box=laser').box).toBeNull();
  expect(t('?invincible=0&autopilot=false')).toMatchObject({ invincible: false, autopilot: false });
  expect(t('?invincible&autopilot=true')).toMatchObject({ invincible: true, autopilot: true });
});
