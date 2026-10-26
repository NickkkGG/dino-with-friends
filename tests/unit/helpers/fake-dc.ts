import type { DrawContext } from '../../../src/game/draw/context';
import { HDPI_POS, LDPI_POS } from '../../../src/game/sprite-defs';
import type { SpriteSheet } from '../../../src/game/sprites';
import { makeFakeCtx } from './fake-ctx';
import type { FakeCall } from './fake-ctx';

/** The canvas of the fake sheets, to recognise in recorded drawImage calls. */
export const SHEET = { tag: 'sheet' } as unknown as CanvasImageSource;

/** A sheet with the real positions of the 1x or the 2x sprite and its face rows, but no pixels. */
export function fakeSheet(scale: 1 | 2): SpriteSheet {
  return scale === 1
    ? { canvas: SHEET, scale, pos: LDPI_POS, faceRowY: { normal: 2, hurt: 100, low: 147 } }
    : { canvas: SHEET, scale, pos: HDPI_POS, faceRowY: { normal: 2, hurt: 200, low: 294 } };
}

/** A DrawContext on a recording fake canvas: k device pixels per world pixel, drawing from the 1x or the 2x sheet. */
export function fakeDc(k = 1, scale: 1 | 2 = 1, oy = 0): { dc: DrawContext; calls: FakeCall[] } {
  const { ctx, calls } = makeFakeCtx();
  return { dc: { ctx, k, sheet: fakeSheet(scale), oy }, calls };
}
