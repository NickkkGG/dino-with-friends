import { expect, it } from 'vitest';
import { DUCK_LOW_EXTRA, FACE_EDITS, applyPixelEdits, duckEdits, sheetFor } from '../../src/game/sprites';
import type { SpriteSet, SpriteSheet } from '../../src/game/sprites';
import { HDPI_POS, LDPI_POS } from '../../src/game/sprite-defs';

const DARK = [83, 83, 83, 255];
const LIGHT = [255, 255, 255, 255];

// The RGBA pixels of an 8 × 8 buffer that are not blank, as "x,y".
function painted(data: Uint8ClampedArray): Map<string, number[]> {
  const out = new Map<string, number[]>();
  for (let i = 0; i < data.length; i += 4) {
    const px = Array.from(data.slice(i, i + 4));
    if (px.some((v) => v !== 0)) out.set(`${(i / 4) % 8},${Math.floor(i / 4 / 8)}`, px);
  }
  return out;
}

it('applyPixelEdits paints 1×1 pixels at 1x and 2×2 blocks at 2x', () => {
  const one = new Uint8ClampedArray(8 * 8 * 4);
  applyPixelEdits(one, 8, 2, 2, 1, [[1, 1, 'd']], DARK, LIGHT);
  expect(painted(one)).toEqual(new Map([['3,3', DARK]]));
  const two = new Uint8ClampedArray(8 * 8 * 4);
  applyPixelEdits(two, 8, 2, 2, 2, [[1, 1, 'l']], DARK, LIGHT);
  expect(painted(two)).toEqual(new Map([['4,4', LIGHT], ['5,4', LIGHT], ['4,5', LIGHT], ['5,5', LIGHT]]));
});

it('hurt face shuts the eye and draws a 4-pixel slit', () => {
  expect(FACE_EDITS.hurt).toEqual([[26, 5, 'd'], [27, 5, 'd'], [26, 6, 'd'], [27, 6, 'd'], [25, 7, 'l'], [26, 7, 'l'], [27, 7, 'l'], [28, 7, 'l']]);
});

it('low face shuts the eye half-way down and lets the tongue hang out', () => {
  expect(FACE_EDITS.low).toEqual([
    [26, 5, 'd'], [27, 5, 'd'], [26, 6, 'd'], [27, 6, 'd'], [26, 7, 'l'], [27, 7, 'l'], [26, 8, 'l'], [27, 8, 'l'],
    [34, 17, 'd'], [35, 17, 'd'], [34, 18, 'd'], [35, 18, 'd'], [34, 19, 'd'], [35, 19, 'd'], [36, 19, 'l'],
  ]);
});

it('duck frames get the same edits 15 px right and 18 px down, plus 3 outline pixels for the tongue', () => {
  expect(duckEdits([[26, 5, 'd']])).toEqual([[41, 23, 'd']]);
  expect(duckEdits(FACE_EDITS.hurt)).toHaveLength(FACE_EDITS.hurt.length);
  expect(DUCK_LOW_EXTRA).toEqual([[48, 37, 'l'], [49, 38, 'l'], [50, 38, 'l']]);
});

it('sheetFor picks the 2x sheet only when the render params ask for it', () => {
  const canvas = {} as CanvasImageSource;
  const x1: SpriteSheet = { canvas, scale: 1, pos: LDPI_POS, faceRowY: { normal: 2, hurt: 100, low: 147 } };
  const x2: SpriteSheet = { canvas, scale: 2, pos: HDPI_POS, faceRowY: { normal: 2, hurt: 200, low: 294 } };
  const set: SpriteSet = { x1, x2 };
  expect(sheetFor(set, { k: 4, sprite: 2, pixelated: true })).toBe(x2);
  expect(sheetFor(set, { k: 1, sprite: 1, pixelated: true })).toBe(x1);
});
