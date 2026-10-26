import { expect, it } from 'vitest';
import { blit, cellEdge, fillCells, fillWorldRect } from '../../src/game/draw/context';
import type { DrawContext } from '../../src/game/draw/context';
import { LDPI_POS } from '../../src/game/sprite-defs';
import type { SpriteSheet } from '../../src/game/sprites';
import { callsOf, makeFakeCtx } from './helpers/fake-ctx';

const sheetCanvas = { tag: 'sheet' } as unknown as CanvasImageSource;
const sheet = (scale: 1 | 2): SpriteSheet => ({ canvas: sheetCanvas, scale, pos: LDPI_POS, faceRowY: { normal: 2, hurt: 100, low: 147 } });

function dcWith(k: number, oy: number, scale: 1 | 2 = 1) {
  const { ctx, calls } = makeFakeCtx();
  const dc: DrawContext = { ctx, k, sheet: sheet(scale), oy };
  return { dc, calls };
}

it('cell edges follow the original 1x pattern 2,1,2,1 and stay whole at 2x', () => {
  expect([0, 1, 2, 3, 4, 5, 6, 7].map((c) => cellEdge(c, 1.5, 1))).toEqual([0, 2, 3, 5, 6, 8, 9, 11]);
  expect([0, 1, 7].map((c) => cellEdge(c, 1.5, 2))).toEqual([0, 3, 21]);
});

it('fillCells draws whole device pixels', () => {
  const { dc, calls } = dcWith(1, 0);
  fillCells(dc, ['#.', '.#'], 10, 5, '#535353', 1.5);
  expect(callsOf(calls, 'fillRect')).toEqual([[10, 5, 2, 2], [12, 7, 1, 1]]);
  expect(dc.ctx.fillStyle).toBe('#535353');
});

it('fillCells scales by k, adds the sky offset, and keeps the cell pattern of a starting cell', () => {
  const { dc, calls } = dcWith(2, 40);
  fillCells(dc, ['##'], 3, 0, '#757575', 1.5);
  expect(callsOf(calls, 'fillRect')).toEqual([[6, 80, 3, 3], [9, 80, 3, 3]]);
  const shifted = dcWith(1, 0);
  fillCells(shifted.dc, ['#', '#'], 0, 0, '#000', 1.5, 1, 1); // starts at cell (1, 1) of the pattern: 1 px, then 2 px
  expect(callsOf(shifted.calls, 'fillRect')).toEqual([[0, 0, 1, 1], [0, 1, 1, 2]]);
});

it('blit scales the destination by k and adds the sky offset', () => {
  const { dc, calls } = dcWith(2, 40);
  blit(dc, 848, 2, 44, 47, 24, 93);
  expect(callsOf(calls, 'drawImage')).toEqual([[sheetCanvas, 848, 2, 44, 47, 48, 266, 88, 94]]);
});

it('blit from a 2x sheet draws the same world size', () => {
  const { dc, calls } = dcWith(2, 0, 2);
  blit(dc, 1678, 4, 88, 94, 24, 93);
  expect(callsOf(calls, 'drawImage')).toEqual([[sheetCanvas, 1678, 4, 88, 94, 48, 186, 88, 94]]);
  blit(dc, 1678, 4, 88, 94, 0, 0, 22, 23.5); // an explicit destination size wins
  expect(callsOf(calls, 'drawImage')[1]).toEqual([sheetCanvas, 1678, 4, 88, 94, 0, 0, 44, 47]);
});

it('fillWorldRect fills a world rectangle on whole device pixels', () => {
  const { dc, calls } = dcWith(2, 40);
  fillWorldRect(dc, 8, 7, 39, 9, '#bdbdbd');
  expect(callsOf(calls, 'fillRect')).toEqual([[16, 94, 78, 18]]);
  expect(dc.ctx.fillStyle).toBe('#bdbdbd');
  const half = dcWith(1, 0);
  fillWorldRect(half.dc, 1.5, 0, 1.5, 1, '#000'); // edges are rounded, so neighbours never overlap or leave a gap
  expect(callsOf(half.calls, 'fillRect')).toEqual([[2, 0, 1, 1]]);
});
