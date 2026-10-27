import { expect, it } from 'vitest';
import { HEAD_AREA, cutHead } from '../../src/game/heads';

/** A 25 × 19 RGBA area, white and clear but for the given pixels: [x, y, red, alpha]. */
function area(pixels: readonly (readonly [number, number, number, number])[]) {
  const { w, h } = HEAD_AREA;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) data.set([255, 255, 255, 0], i * 4);
  for (const [x, y, red, alpha] of pixels) data.set([red, red, red, alpha], (y * w + x) * 4);
  return { data, width: w, height: h };
}

it('samples every second pixel from the second one and trims to the ink', () => {
  const ink = 83; // the dino's grey, #535353
  expect(cutHead(area([[1, 1, ink, 255], [3, 1, ink, 255], [3, 3, ink, 255], [0, 0, ink, 255], [2, 2, ink, 255]])))
    .toEqual(['##', '.#']);
  expect(cutHead(area([[23, 17, ink, 255], [21, 15, ink, 255]]))).toEqual(['#.', '.#']);
});

it('takes only dark, solid pixels as ink', () => {
  expect(cutHead(area([[1, 1, 83, 100], [3, 1, 200, 255], [5, 1, 83, 255]]))).toEqual(['#']);
  expect(cutHead(area([[1, 1, 83, 128], [3, 1, 128, 255]]))).toEqual([]);
});
