import { SPRITE_1X_URL, SPRITE_2X_URL, loadImage } from './assets';
import type { RenderParams } from './render-params';
import { HDPI_POS, LDPI_POS } from './sprite-defs';
import type { SpritePositions } from './sprite-defs';

/**
 * A sprite sheet ready to draw from: the original sheet, with rows of edited dino frames below it for the hurt and the
 * low-heart faces. Positions are in the sheet's own pixels.
 */
export interface SpriteSheet {
  canvas: CanvasImageSource;
  scale: 1 | 2;
  pos: SpritePositions;
  /** The y of the dino strip for each face. */
  faceRowY: { normal: number; hurt: number; low: number };
}

/** Both sheets, each with its face rows. */
export interface SpriteSet {
  x1: SpriteSheet;
  x2: SpriteSheet;
}

/** One pixel to repaint in a dino frame, in 1x pixels from the frame's corner: 'd' is the body's grey, 'l' the white. */
export type PixelEdit = readonly [x: number, y: number, tone: 'd' | 'l'];

// The eye of the standing, running and jumping frames is 2 × 2 white pixels at (26, 5). Painting it grey shuts it.
const EYE_SHUT: readonly PixelEdit[] = [[26, 5, 'd'], [27, 5, 'd'], [26, 6, 'd'], [27, 6, 'd']];

/**
 * The two new faces, as edits to the standing, running and jumping frames. Hurt: the eye shut, with a slit just under
 * it. Low heart: the eye half shut, two pixels lower, and the tongue hanging out of the mouth with an outline pixel.
 */
export const FACE_EDITS: { hurt: readonly PixelEdit[]; low: readonly PixelEdit[] } = {
  hurt: [...EYE_SHUT, [25, 7, 'l'], [26, 7, 'l'], [27, 7, 'l'], [28, 7, 'l']],
  low: [
    ...EYE_SHUT, [26, 7, 'l'], [27, 7, 'l'], [26, 8, 'l'], [27, 8, 'l'],
    [34, 17, 'd'], [35, 17, 'd'], [34, 18, 'd'], [35, 18, 'd'], [34, 19, 'd'], [35, 19, 'd'], [36, 19, 'l'],
  ],
};

/** The same edits for a ducking frame, where the head is 15 pixels further right and 18 lower. */
export function duckEdits(edits: readonly PixelEdit[]): PixelEdit[] {
  return edits.map(([x, y, tone]) => [x + 15, y + 18, tone]);
}

/** Ducking, the tongue hangs out past the outline, so it gets three outline pixels of its own. */
export const DUCK_LOW_EXTRA: readonly PixelEdit[] = [[48, 37, 'l'], [49, 38, 'l'], [50, 38, 'l']];

/**
 * Repaints pixels of one frame in an RGBA buffer `width` pixels wide whose corner is at (frameX, frameY): each edit is
 * one pixel at 1x and a 2 × 2 block at 2x.
 */
export function applyPixelEdits(
  data: Uint8ClampedArray, width: number, frameX: number, frameY: number, scale: 1 | 2, edits: readonly PixelEdit[],
  dark: readonly number[], light: readonly number[],
): void {
  for (const [x, y, tone] of edits) {
    const color = tone === 'd' ? dark : light;
    for (let dy = 0; dy < scale; dy++) {
      for (let dx = 0; dx < scale; dx++) data.set(color, ((frameY + y * scale + dy) * width + frameX + x * scale + dx) * 4);
    }
  }
}

// The dino frames, in 1x pixels from the start of its strip (the original's animation frames): standing and jumping
// at 0, running at 88 and 132, ducking at 264 and 323. All are 47 pixels high.
const FACE_FRAMES = [0, 88, 132];
const DUCK_FRAMES = [264, 323];
const TREX_H = 47;

const FACE_ROW_Y = { 1: { normal: 2, hurt: 100, low: 147 }, 2: { normal: 2, hurt: 200, low: 294 } } as const;

/**
 * Copies a sheet onto a canvas with two more dino strips under it: one with the hurt face, one with the low-heart face.
 * Each strip runs from the first dino frame to the sheet's right edge, so a frame has the same x in every row. The grey
 * and the white come from the sheet itself: a body pixel and an eye pixel of the first running frame.
 */
export function buildSheet(img: HTMLImageElement, scale: 1 | 2): SpriteSheet {
  const pos = scale === 1 ? LDPI_POS : HDPI_POS;
  const faceRowY = FACE_ROW_Y[scale];
  const h = TREX_H * scale;
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = faceRowY.low + h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('no 2d context for the sprite sheet');
  ctx.drawImage(img, 0, 0);
  const x0 = pos.tRex.x;
  const w = canvas.width - x0;
  const strip = ctx.getImageData(x0, pos.tRex.y, w, h);
  const pixel = (x: number, y: number): number[] => {
    const i = (y * scale * w + x * scale) * 4;
    return Array.from(strip.data.subarray(i, i + 4));
  };
  const dark = pixel(88 + 24, 4);
  const light = pixel(88 + 26, 5);
  for (const face of ['hurt', 'low'] as const) {
    const row = new ImageData(new Uint8ClampedArray(strip.data), w, h);
    const duck = face === 'low' ? [...duckEdits(FACE_EDITS.low), ...DUCK_LOW_EXTRA] : duckEdits(FACE_EDITS.hurt);
    for (const f of FACE_FRAMES) applyPixelEdits(row.data, w, f * scale, 0, scale, FACE_EDITS[face], dark, light);
    for (const f of DUCK_FRAMES) applyPixelEdits(row.data, w, f * scale, 0, scale, duck, dark, light);
    ctx.putImageData(row, x0, faceRowY[face]);
  }
  return { canvas, scale, pos, faceRowY };
}

/** Loads the 1x and the 2x sheet and adds the face rows to both. */
export async function loadSpriteSet(): Promise<SpriteSet> {
  const [one, two] = await Promise.all([loadImage(SPRITE_1X_URL), loadImage(SPRITE_2X_URL)]);
  return { x1: buildSheet(one, 1), x2: buildSheet(two, 2) };
}

/** The sheet a canvas with these render params draws from. */
export function sheetFor(set: SpriteSet, p: RenderParams): SpriteSheet {
  return p.sprite === 2 ? set.x2 : set.x1;
}
