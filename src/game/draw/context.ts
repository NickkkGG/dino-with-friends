import type { SpriteSheet } from '../sprites';

/**
 * Where a frame is drawn: the context (left at the identity transform), k device pixels per world pixel, the sheet to
 * draw sprites from, and oy, how far down the world starts in world pixels (the sky room above the solo world).
 */
export interface DrawContext {
  ctx: CanvasRenderingContext2D;
  k: number;
  sheet: SpriteSheet;
  oy: number;
}

/**
 * The device-pixel edge of cell c of a bitmap whose cells are `cell` world pixels wide. Cells of 1.5 come out 2, 1, 2, 1
 * device pixels at k = 1, like the original 1x sprites, and whole at 2x.
 */
export function cellEdge(c: number, cell: number, k: number): number {
  return Math.floor(cell * c * k + 0.5);
}

/** Draws part of the sprite sheet: s* in the sheet's own pixels, d* in world pixels (by default the sprite's own size). */
export function blit(
  dc: DrawContext, sx: number, sy: number, sw: number, sh: number, dx: number, dy: number,
  dw = sw / dc.sheet.scale, dh = sh / dc.sheet.scale,
): void {
  const { k } = dc;
  dc.ctx.drawImage(dc.sheet.canvas, sx, sy, sw, sh, dx * k, (dy + dc.oy) * k, dw * k, dh * k);
}

/**
 * Fills the '#' cells of a bitmap (rows of '#' and '.') at world point (x, y), each cell `cell` world pixels, on whole
 * device pixels. cx and cy say which cell of the pattern the first column and row are, so a bitmap drawn in parts keeps
 * the same cell sizes.
 */
export function fillCells(
  dc: DrawContext, rows: readonly string[], x: number, y: number, color: string, cell = 1, cx = 0, cy = 0,
): void {
  const { ctx, k } = dc;
  const ox = Math.round(x * k);
  const oy = Math.round((y + dc.oy) * k);
  const edge = (c: number) => cellEdge(c, cell, k);
  ctx.fillStyle = color;
  rows.forEach((row, r) => {
    const top = oy + edge(cy + r) - edge(cy);
    const height = edge(cy + r + 1) - edge(cy + r);
    for (let c = 0; c < row.length; c++) {
      if (row[c] !== '#') continue;
      ctx.fillRect(ox + edge(cx + c) - edge(cx), top, edge(cx + c + 1) - edge(cx + c), height);
    }
  });
}

/** Fills a rectangle given in world pixels, with its edges rounded to device pixels. */
export function fillWorldRect(dc: DrawContext, x: number, y: number, w: number, h: number, color: string): void {
  const { ctx, k } = dc;
  const x0 = Math.round(x * k);
  const y0 = Math.round((y + dc.oy) * k);
  ctx.fillStyle = color;
  ctx.fillRect(x0, y0, Math.round((x + w) * k) - x0, Math.round((y + dc.oy + h) * k) - y0);
}
