import { WORLD_H, WORLD_W } from '../../shared/sim/constants';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** World pixels of open sky above the 150 px world, so a double jump stays on the canvas. */
export const SKY = 40;

/** The HUD strip over a portrait world: drawn 1.75 times the world's scale, 34 of its own pixels high. */
export const HUD_STRIP = { scale: 1.75, height: 34 };

/** Where the solo screen puts things, in CSS pixels. */
export interface SoloLayout {
  mode: 'wide' | 'portrait';
  /** The game canvas: the sky, then the 600 × 150 world. */
  canvas: Rect;
  /** CSS pixels per world pixel. */
  scale: number;
  /** The HUD strip right above the canvas, in portrait only: there the world is too small for the HUD to read. */
  hud: Rect | null;
  /** CSS pixels per HUD strip pixel. */
  hudScale: number;
  /** The top of the line of text under the canvas. */
  below: number;
  /** The halves of the screen that duck (left) and jump (right), on a touch screen only. */
  zones: { left: Rect; right: Rect } | null;
}

export function soloLayout(vw: number, vh: number, coarse: boolean): SoloLayout {
  const portrait = vh > vw;
  let scale: number;
  let x: number;
  let worldTop: number;
  if (portrait) {
    // As wide as the screen, a third of the way down, with the HUD strip above it.
    scale = vw / WORLD_W;
    x = 0;
    worldTop = Math.round(0.32 * vh);
  } else {
    // As big as fits, centred for a mouse; on a touch screen on the bottom edge, under the thumbs.
    scale = Math.min(vw / WORLD_W, (0.85 * vh) / (WORLD_H + SKY));
    x = (vw - WORLD_W * scale) / 2;
    worldTop = coarse ? vh - WORLD_H * scale : (vh - WORLD_H * scale) / 2;
  }
  const canvas = { x, y: worldTop - SKY * scale, w: WORLD_W * scale, h: (WORLD_H + SKY) * scale };
  const hudScale = scale * HUD_STRIP.scale;
  const hudH = HUD_STRIP.height * hudScale;
  let zones: SoloLayout['zones'] = null;
  if (coarse) {
    const top = Math.round((portrait ? 0.66 : 0.38) * vh);
    zones = {
      left: { x: 0, y: top, w: vw / 2, h: vh - top },
      right: { x: vw / 2, y: top, w: vw / 2, h: vh - top },
    };
  }
  return {
    mode: portrait ? 'portrait' : 'wide',
    canvas,
    scale,
    hud: portrait ? { x: 0, y: canvas.y - hudH, w: vw, h: hudH } : null,
    hudScale,
    below: canvas.y + canvas.h + 16,
    zones,
  };
}
