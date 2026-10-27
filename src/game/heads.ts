import type { SpriteSheet } from './sprites';

/** The dino frames the heads are cut from: x from the start of the dino strip of the 1x sheet. */
export const HEAD_FRAMES = { alive: 0, blink: 44, dead: 220 } as const;

/** Where the head and the jaw are in a frame, in 1x pixels from its corner. */
export const HEAD_AREA = { x: 17, y: 0, w: 25, h: 19 } as const;

/** The dino heads of the leaderboard, the player list and the peeking watchers: rows of '#' and '.'. */
export interface Heads {
  alive: readonly string[];
  blink: readonly string[];
  dead: readonly string[];
  /** The standing and the blinking head at full size, facing left, for peeking in from the right edge. */
  peek: readonly string[];
  peekBlink: readonly string[];
}

/**
 * A head from the pixels of its area, '#' where the pixel is solid and dark, cut down to the box its ink fills. `every`
 * 2 takes every second pixel across and down, from the second one, as the 16 px icons are made: the leaderboard head.
 * `every` 1 takes every pixel from the first: the head at full size.
 */
export function cutHead(img: { data: ArrayLike<number>; width: number; height: number }, every: 1 | 2 = 2): string[] {
  const grid: string[] = [];
  for (let y = every - 1; y < img.height; y += every) {
    let row = '';
    for (let x = every - 1; x < img.width; x += every) {
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

/** The rows read from right to left: the picture facing the other way. */
export function mirror(rows: readonly string[]): string[] {
  return rows.map((row) => [...row].reverse().join(''));
}

/** The heads, cut from the 1x sheet's own pixels. */
export function headsFrom(sheet: SpriteSheet): Heads {
  const { canvas } = sheet;
  if (!(canvas instanceof HTMLCanvasElement)) throw new Error('the 1x sprite sheet is not a canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('no 2d context for the sprite sheet');
  const cut = (frame: number, every: 1 | 2 = 2) =>
    cutHead(
      ctx.getImageData(sheet.pos.tRex.x + frame + HEAD_AREA.x, sheet.pos.tRex.y + HEAD_AREA.y, HEAD_AREA.w, HEAD_AREA.h),
      every,
    );
  return {
    alive: cut(HEAD_FRAMES.alive),
    blink: cut(HEAD_FRAMES.blink),
    dead: cut(HEAD_FRAMES.dead),
    peek: mirror(cut(HEAD_FRAMES.alive, 1)),
    peekBlink: mirror(cut(HEAD_FRAMES.blink, 1)),
  };
}
