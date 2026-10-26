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
