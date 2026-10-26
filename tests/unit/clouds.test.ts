import { expect, it } from 'vitest';
import { Clouds } from '../../src/game/draw/clouds';
import { callsOf } from './helpers/fake-ctx';
import { SHEET, fakeDc } from './helpers/fake-dc';

const drawn = (clouds: Clouds): unknown[][] => {
  const { dc, calls } = fakeDc();
  clouds.draw(dc);
  return callsOf(calls, 'drawImage');
};

it('clouds: the first cloud starts at x 600 with y 30..71; one px per moving step; at most 6', () => {
  for (const r of [0, 0.5, 0.999]) {
    const clouds = new Clouds(() => r);
    expect(drawn(clouds)).toEqual([[SHEET, 86, 2, 46, 14, 600, 30 + Math.floor(r * 42), 46, 14]]);
  }
  const clouds = new Clouds(() => 0); // every new cloud is wanted at once and wants a gap of 100
  clouds.step(1);
  expect(drawn(clouds)[0]![5]).toBe(599);
  clouds.step(0); // a still sky: nothing moves and nothing is added
  expect(drawn(clouds)).toHaveLength(1);
  expect(drawn(clouds)[0]![5]).toBe(599);
  let most = 0;
  for (let i = 0; i < 2000; i++) {
    clouds.step(1);
    const xs = drawn(clouds).map((c) => c[5] as number);
    most = Math.max(most, xs.length);
    expect(xs.length).toBeLessThanOrEqual(6);
    for (const x of xs) expect(x + 46).toBeGreaterThan(0); // a cloud that has left the screen is gone
  }
  expect(most).toBe(6);
});

it('clouds: reset leaves one new cloud at the right edge', () => {
  const clouds = new Clouds(() => 0);
  for (let i = 0; i < 300; i++) clouds.step(1);
  expect(drawn(clouds).length).toBeGreaterThan(1);
  clouds.reset();
  expect(drawn(clouds)).toEqual([[SHEET, 86, 2, 46, 14, 600, 30, 46, 14]]);
});
