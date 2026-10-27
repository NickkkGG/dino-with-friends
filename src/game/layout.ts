import { WORLD_H, WORLD_W } from '../../shared/sim/constants';
import { FONT_ROWS } from '../ui/font';

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

/** The pixel text of the menu screens, in CSS pixels per cell. */
export interface MenuSizes {
  title: number;
  body: number;
  small: number;
  /** The lobby code. */
  code: number;
}

/** The menu text for a window `vw` CSS pixels wide: a little smaller below 600, which is a phone held upright. */
export function menuSizes(vw: number): MenuSizes {
  return vw < 600 ? { title: 2.5, body: 2, small: 1.5, code: 5 } : { title: 3, body: 2, small: 1.5, code: 6 };
}

/** The room in a menu screen, in CSS pixels: above and below its column, between the column's parts, and the idle strip's width. */
export interface MenuSpacing {
  top: number;
  bottom: number;
  gap: number;
  strip: number;
}

// The idle strip is at most this wide, with 16 px on each side; on a phone on its side it takes at most this share of
// the height (its world is a quarter as high as it is wide).
const STRIP_MAX = 720;
const STRIP_SIDE = 16;
const STRIP_SHARE = 0.15;

/**
 * A menu screen's room for a window `vw` × `vh` CSS pixels. A short window that is wide enough for the column to miss
 * the corner buttons (a phone on its side) closes the column up and makes the idle strip smaller, so the screen fits
 * without scrolling.
 */
export function menuSpacing(vw: number, vh: number): MenuSpacing {
  if (vh >= SHORT || vw < 600) return { top: 56, bottom: 24, gap: 18, strip: STRIP_MAX };
  const strip = Math.min(STRIP_MAX, 2 * STRIP_SIDE + (WORLD_W / WORLD_H) * STRIP_SHARE * vh);
  return { top: 16, bottom: 12, gap: 10, strip };
}

/** The leaderboard in cells of its text: a line is `width` wide and `row` high, under a title `title` high. */
export const BOARD_CELLS = { width: 140, row: 12, title: 11 } as const;

/** How many cells high a leaderboard of `rows` lines is. */
export function boardHeightCells(rows: number): number {
  return BOARD_CELLS.title + BOARD_CELLS.row * rows;
}

/** On a laptop the race keeps this many CSS pixels free along the right edge, for the heads of the players watching. */
export const PEEK_COLUMN = 112;

/** Where the race screen puts things, in CSS pixels: the track as in solo, the tower, the lobby code and the countdown. */
export interface RaceLayout extends SoloLayout {
  /** The tower's top left corner, and its cell: a whole number of device pixels. */
  board: { x: number; y: number; cell: number };
  /** The lobby code's line, in the bottom left corner of a laptop; a phone has no room for it. */
  code: { x: number; y: number } | null;
  /** The top of the countdown's number, which is centred across the screen, and its cell. */
  count: { y: number; cell: number };
}

// The tower holds a line for each player a lobby can have.
const BOARD_ROWS = 8;
// On a laptop: the gaps above the tower and between it and the track, and the lobby code's line with its gap above.
const EDGE = 16;
const CODE_LINE = 46;
const CODE_CELL = 1.5;

/** The largest cell up to `cell` that is a whole number of device pixels, and at least one of them. */
const deviceCell = (cell: number, dpr: number): number => Math.max(1, Math.floor(cell * dpr + 1e-9)) / dpr;

/** Where a countdown number of `cell` goes to have its middle at `mid`. */
const countAt = (mid: number, cell: number): RaceLayout['count'] => ({ y: mid - (FONT_ROWS * cell) / 2, cell });

/**
 * The race screen. A phone has the solo track and touch areas, with a tower that fits in the top left corner. A laptop
 * has the tower in the top left corner and the track right under it, as wide as leaves the right column free; on a
 * short window the tower shrinks first, and the track only once the tower is at one CSS pixel a cell.
 */
export function raceLayout(vw: number, vh: number, coarse: boolean, dpr: number): RaceLayout {
  const towerCells = boardHeightCells(BOARD_ROWS);
  if (vh > vw || coarse) {
    const solo = soloLayout(vw, vh, coarse);
    const { canvas } = solo;
    const portrait = solo.hud !== null;
    // Upright, above the HUD strip, with the number between the track and the touch areas; on its side, above the
    // track, with the number in its middle.
    const room = portrait ? solo.hud!.y - 16 : canvas.y - 12;
    const count = portrait
      ? countAt((canvas.y + canvas.h + (solo.zones?.left.y ?? vh)) / 2, 10)
      : countAt(canvas.y + canvas.h / 2, 8);
    return { ...solo, board: { x: 8, y: 8, cell: deviceCell(Math.min(1.5, room / towerCells), dpr) }, code: null, count };
  }
  const fixed = 2 * EDGE + CODE_LINE;
  let scale = Math.max(0, vw - PEEK_COLUMN) / WORLD_W;
  let cell = Math.min(2, (vh - (WORLD_H + SKY) * scale - fixed) / towerCells);
  if (cell < 1) {
    cell = 1;
    scale = Math.min(scale, Math.max(0, vh - fixed - towerCells) / (WORLD_H + SKY));
  }
  cell = deviceCell(cell, dpr);
  const top = EDGE + towerCells * cell + EDGE;
  const canvas = { x: 0, y: top, w: WORLD_W * scale, h: (WORLD_H + SKY) * scale };
  return {
    mode: 'wide',
    canvas,
    scale,
    hud: null,
    hudScale: scale * HUD_STRIP.scale,
    below: canvas.y + canvas.h + 16,
    zones: null,
    board: { x: EDGE, y: EDGE, cell },
    code: { x: EDGE, y: vh - EDGE - FONT_ROWS * CODE_CELL },
    count: countAt(canvas.y + canvas.h / 2, 14),
  };
}
