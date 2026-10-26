import { expect, it } from 'vitest';
import { chooseRenderParams, sizeCanvas } from '../../src/game/render-params';
import { makeFakeCtx } from './helpers/fake-ctx';

it.each([
  [390, 3, { k: 2, sprite: 2, pixelated: true }], // iPhone portrait, s = 1.95
  [412, 2.625, { k: 1, sprite: 1, pixelated: true }], // s = 1.8
  [1440, 2, { k: 4, sprite: 2, pixelated: true }], // s = 4.8
  [1440, 1, { k: 2, sprite: 2, pixelated: true }], // s = 2.4
  [844, 3, { k: 4, sprite: 2, pixelated: true }], // s = 4.22
  [1200, 1, { k: 2, sprite: 2, pixelated: true }], // s = 2
  [600, 1, { k: 1, sprite: 1, pixelated: true }], // s = 1
  [500, 1, { k: 1, sprite: 1, pixelated: false }], // s < 1: smooth downscale
])('chooseRenderParams(%s, %s)', (w, dpr, want) => {
  expect(chooseRenderParams(w, dpr)).toEqual(want);
});

it('takes the logical width into account', () => {
  expect(chooseRenderParams(390, 3, 300)).toEqual({ k: 2, sprite: 2, pixelated: true }); // s = 3.9
  expect(chooseRenderParams(1125, 1, 600)).toEqual({ k: 2, sprite: 2, pixelated: true }); // s = 1.875 exactly
});

it('sizes the backing store in whole device pixels and the element in CSS pixels', () => {
  const { ctx } = makeFakeCtx();
  const canvas = { width: 0, height: 0, style: {} as Record<string, string>, getContext: () => ctx };
  sizeCanvas(canvas as unknown as HTMLCanvasElement, 1440, 456, 600, 190, { k: 4, sprite: 2, pixelated: true });
  expect([canvas.width, canvas.height]).toEqual([2400, 760]);
  expect(canvas.style).toEqual({ width: '1440px', height: '456px', imageRendering: 'pixelated' });
  expect(ctx.imageSmoothingEnabled).toBe(false);
  sizeCanvas(canvas as unknown as HTMLCanvasElement, 500, 158, 600, 190, { k: 1, sprite: 1, pixelated: false });
  expect([canvas.width, canvas.height, canvas.style.imageRendering]).toEqual([600, 190, 'auto']);
});
