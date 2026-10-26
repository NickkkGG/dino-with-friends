import { expect, it } from 'vitest';
import { NightSky } from '../../src/game/draw/night-sky';
import { callsOf } from './helpers/fake-ctx';
import { SHEET, fakeDc } from './helpers/fake-dc';

// The last drawImage of a draw is the moon; the ones before it are the stars.
const draw = (sky: NightSky) => {
  const { dc, calls } = fakeDc();
  sky.draw(dc);
  const images = callsOf(calls, 'drawImage');
  const alpha = calls.filter((c) => c.op === 'set globalAlpha').map((c) => c.args[0]);
  return { images, moon: images.at(-1), alpha, after: dc.ctx.globalAlpha };
};

it('night sky: opacity rises 0.035 per active step and the moon phase advances each night', () => {
  const sky = new NightSky(() => 0.5);
  expect(sky.opacity).toBe(0);
  expect(draw(sky).images).toEqual([]); // nothing in daylight
  sky.step(true);
  expect(sky.opacity).toBeCloseTo(0.035, 12);
  sky.step(true);
  expect(sky.opacity).toBeCloseTo(0.07, 12);
  sky.step(true);
  const first = draw(sky);
  expect(first.alpha).toContain(sky.opacity);
  expect(first.after).toBe(1);
  // the first night shows phase 1: the moon 120 px along its strip, 20 × 40 at y 30, starting at x 0 and moving left
  expect(first.moon).toEqual([SHEET, 604, 2, 20, 40, -1, 30, 20, 40]);
  const moonX: number[] = [];
  const widths: number[] = [];
  for (let night = 2; night <= 8; night++) {
    while (sky.opacity > 0) sky.step(false); // the night ends
    sky.step(true); // and the next one begins
    const { moon } = draw(sky);
    moonX.push(moon![1] as number);
    widths.push(moon![3] as number);
  }
  // phases 2, 3 (the full moon, twice as wide), 4, 5, 6, 0, 1
  expect(moonX).toEqual([584, 544, 524, 504, 484, 624, 604]);
  expect(widths).toEqual([20, 40, 20, 20, 20, 20, 20]);
});

it('night sky: two stars, drawn at whole pixels, moving 0.3 px a step while the moon moves 0.25', () => {
  const sky = new NightSky(() => 0.5);
  sky.step(true);
  sky.step(true);
  const { images } = draw(sky);
  // stars at random spots in two halves of the original's 150 px sky (it passes the canvas height as the width)
  expect(images.slice(0, 2)).toEqual([
    [SHEET, 645, 2, 9, 9, 38, 35, 9, 9],
    [SHEET, 645, 11, 9, 9, 113, 35, 9, 9],
  ]);
  for (let i = 0; i < 10; i++) sky.step(true);
  const later = draw(sky).images;
  expect(later[0]![5]).toBe(35); // 38 less 0.3 eleven times (the stars wait one step), rounded
  expect(later[2]![5]).toBe(-3); // 0 less 0.25 twelve times
});
