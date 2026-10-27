import type { SpriteSheet } from './sprites';

/** The dino frames the heads are cut from: x from the start of the dino strip of the 1x sheet. */
export const HEAD_FRAMES = { alive: 0, blink: 44, dead: 220 } as const;

/** Where the head and the jaw are in a frame, in 1x pixels from its corner. */
export const HEAD_AREA = { x: 17, y: 0, w: 25, h: 19 } as const;

/** The dino heads of the leaderboard and the player list: rows of '#' and '.'. */
export interface Heads {
  alive: readonly string[];
  blink: readonly string[];
  dead: readonly string[];
}

/**
 * A head from the pixels of its area: every second pixel across and down, from the second one (as the 16 px icons are
 * made), '#' where the pixel is solid and dark, then cut down to the box its ink fills.
 */
export function cutHead(img: { data: ArrayLike<number>; width: number; height: number }): string[] {
  const grid: string[] = [];
  for (let y = 1; y < img.height; y += 2) {
    let row = '';
    for (let x = 1; x < img.width; x += 2) {
      const i = (y * img.width + x) * 4;
      row += (img.data[i + 3] ?? 0) > 128 && (img.data[i] ?? 255) < 128 ? '#' : '.';
    }
    grid.push(row);
  }
  const inked = grid.flatMap((row, r) => (row.includes('#') ? [r] : []));
  if (inked.length === 0) return [];
  const left = Math.min(...grid.map((row) => (row.includes('#') ? row.indexOf('#') : Infinity)));
  const right = Math.max(...grid.map((row) => row.lastIndexOf('#')));
  return grid.slice(inked[0], inked[inked.length - 1]! + 1).map((row) => row.slice(left, right + 1));
}

/** The three heads, cut from the 1x sheet's own pixels. */
export function headsFrom(sheet: SpriteSheet): Heads {
  const { canvas } = sheet;
  if (!(canvas instanceof HTMLCanvasElement)) throw new Error('the 1x sprite sheet is not a canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('no 2d context for the sprite sheet');
  const cut = (frame: number) =>
    cutHead(ctx.getImageData(sheet.pos.tRex.x + frame + HEAD_AREA.x, sheet.pos.tRex.y + HEAD_AREA.y, HEAD_AREA.w, HEAD_AREA.h));
  return { alive: cut(HEAD_FRAMES.alive), blink: cut(HEAD_FRAMES.blink), dead: cut(HEAD_FRAMES.dead) };
}
