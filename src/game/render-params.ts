/** How a canvas is drawn: k device pixels per world pixel, which sprite sheet, and whether the browser scales it crisply. */
export interface RenderParams {
  k: number;
  sprite: 1 | 2;
  pixelated: boolean;
}

/**
 * Picks the scale for a canvas that shows `logicalWidth` world pixels across `cssWidth` CSS pixels. Whole scales keep
 * every sprite pixel the same size: an even k with the 2x sheet from s = 2 up, the 2x sheet at k = 2 shrunk a little
 * just below that, the 1x sheet at k = 1 below 1.875, and a smooth shrink below s = 1, where pixels would disappear.
 */
export function chooseRenderParams(cssWidth: number, dpr: number, logicalWidth = 600): RenderParams {
  const s = (cssWidth * dpr) / logicalWidth;
  if (s >= 2) return { k: 2 * Math.floor(s / 2), sprite: 2, pixelated: true };
  if (s >= 1.875) return { k: 2, sprite: 2, pixelated: true };
  if (s >= 1) return { k: 1, sprite: 1, pixelated: true };
  return { k: 1, sprite: 1, pixelated: false };
}

/** Gives a canvas a backing store of k device pixels per world pixel and shows it at the given CSS size. */
export function sizeCanvas(
  canvas: HTMLCanvasElement, cssW: number, cssH: number, logicalW: number, logicalH: number, p: RenderParams,
): void {
  canvas.width = logicalW * p.k;
  canvas.height = logicalH * p.k;
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
  canvas.style.imageRendering = p.pixelated ? 'pixelated' : 'auto';
  const ctx = canvas.getContext('2d');
  if (ctx) ctx.imageSmoothingEnabled = false; // resizing resets it, so set it after
}
