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

/** Sizes on the title screen, in CSS pixels. */
export interface TitleLayout {
  portrait: boolean;
  /** Pixels per cell of DINO and FRIENDS; "with" is half that. */
  logo: number;
  /** The demo track, 600 × 150 at this width. */
  trackWidth: number;
  buttonWidth: number;
  /** Between SOLO and MULTIPLAYER. */
  buttonGap: number;
  /** Between the logo, the track, the buttons and CREDITS. */
  gap: number;
  /** Pixels per cell of CREDITS. */
  small: number;
}

// The height of a 2-cell PixelButton: 7 rows of 2, 6 px of padding and a 2 px border above and below.
const BUTTON_H = 30;
// The padding above and below the CREDITS line, which is a text button.
const CREDITS_PAD = 8;
// A window shorter than this (a phone on its side) gets the small logo.
const SHORT = 560;

/**
 * The title: the logo, a demo track as wide as the screen, SOLO and MULTIPLAYER, then CREDITS, one
 * above the other. A short wide window keeps the track only as wide as leaves room for the rest.
 */
export function titleLayout(vw: number, vh: number): TitleLayout {
  if (vh > vw) return { portrait: true, logo: 4.5, trackWidth: vw, buttonWidth: 230, buttonGap: 16, gap: 48, small: 1.5 };
  const short = vh < SHORT;
  const logo = short ? 3.5 : 6;
  const small = short ? 1.5 : 2;
  const gap = short ? 14 : 26;
  const buttonGap = 14;
  // Everything but the track: the logo's three lines 8 px apart, the buttons, CREDITS, the gaps and 20 px above and below.
  const rest = 7 * logo * 2.5 + 16 + 2 * BUTTON_H + buttonGap + 7 * small + 2 * CREDITS_PAD + 3 * gap + 40;
  return {
    portrait: false,
    logo,
    trackWidth: Math.max(0, Math.min(vw, (WORLD_W / WORLD_H) * (vh - rest))),
    buttonWidth: short ? 230 : 260,
    buttonGap,
    gap,
    small,
  };
}
