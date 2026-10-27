import { expect, it } from 'vitest';
import {
  HUD_STRIP, PEEK_COLUMN, SKY, boardHeightCells, menuSizes, menuSpacing, raceLayout, soloLayout, titleLayout,
} from '../../src/game/layout';
import type { RaceLayout, TitleLayout } from '../../src/game/layout';
import { FONT_ROWS } from '../../src/ui/font';

it('laptop 1440×900: wide, full width, world centred', () => {
  const l = soloLayout(1440, 900, false);
  expect(l.mode).toBe('wide');
  expect(l.scale).toBeCloseTo(2.4);
  expect(l.canvas.w).toBeCloseTo(1440);
  expect(l.canvas.x).toBeCloseTo(0);
  expect(l.canvas.y + 40 * l.scale).toBeCloseTo((900 - 360) / 2);
  expect(l.canvas.h).toBeCloseTo(190 * 2.4);
  expect(l.below).toBeCloseTo(l.canvas.y + l.canvas.h + 16);
  expect(l.hud).toBeNull();
  expect(l.zones).toBeNull();
});

it('phone portrait 390×844: world top at 270, HUD strip right above the canvas, zones from 557', () => {
  const l = soloLayout(390, 844, true);
  expect(l.mode).toBe('portrait');
  expect(l.scale).toBeCloseTo(0.65);
  expect(l.canvas).toEqual({ x: 0, y: 270 - SKY * 0.65, w: 390, h: 190 * 0.65 });
  expect(l.hudScale).toBeCloseTo(0.65 * HUD_STRIP.scale);
  expect(l.hud!.h).toBeCloseTo(HUD_STRIP.height * 0.65 * 1.75);
  expect(l.hud).toMatchObject({ x: 0, w: 390 });
  expect(l.hud!.y + l.hud!.h).toBeCloseTo(l.canvas.y);
  expect(l.below).toBeCloseTo(244 + 123.5 + 16);
  expect(l.zones).toEqual({ left: { x: 0, y: 557, w: 195, h: 287 }, right: { x: 195, y: 557, w: 195, h: 287 } });
});

it('phone landscape 844×390: wide, world on the bottom edge, zones from 148', () => {
  const l = soloLayout(844, 390, true);
  expect(l.mode).toBe('wide');
  expect(l.scale).toBeCloseTo(844 / 600);
  expect(l.canvas.x).toBeCloseTo(0);
  expect(l.canvas.w).toBeCloseTo(844);
  expect(l.canvas.y + l.canvas.h).toBeCloseTo(390);
  expect(l.hud).toBeNull();
  expect(l.zones).toEqual({ left: { x: 0, y: 148, w: 422, h: 242 }, right: { x: 422, y: 148, w: 422, h: 242 } });
});

it('a very wide, short window limits the scale by height', () => {
  const l = soloLayout(2000, 500, false);
  expect(l.mode).toBe('wide');
  expect(l.scale).toBeCloseTo((0.85 * 500) / 190);
  expect(l.canvas.h).toBeCloseTo(0.85 * 500);
  expect(l.canvas.x).toBeCloseTo((2000 - 600 * l.scale) / 2);
  expect(l.canvas.y + 40 * l.scale).toBeCloseTo((500 - 150 * l.scale) / 2);
});

it('a tall window without touch is portrait with no touch zones; a short one with touch keeps its zones', () => {
  expect(soloLayout(800, 1000, false)).toMatchObject({ mode: 'portrait', zones: null });
  expect(soloLayout(800, 800, false).mode).toBe('wide'); // a square is wide
  expect(soloLayout(1024, 768, true).zones!.left.y).toBe(Math.round(0.38 * 768));
});

// The title's column, top to bottom: the logo (DINO, with at half size, FRIENDS, 8 px apart), the track (150/600 of its
// width), two 30 px buttons, the CREDITS button (its line and 8 px of padding above and below), with a gap between
// each, and 20 px above and below.
function titleHeight(t: TitleLayout): number {
  const logo = 7 * t.logo * 2.5 + 16;
  const buttons = 2 * 30 + t.buttonGap;
  const credits = 7 * t.small + 2 * 8;
  return logo + t.trackWidth / 4 + buttons + credits + 3 * t.gap + 40;
}

it('title on a laptop: the big logo and a track as wide as the screen', () => {
  const t = titleLayout(1440, 900);
  expect(t).toMatchObject({ portrait: false, logo: 6, trackWidth: 1440, buttonWidth: 260, small: 2 });
  expect(titleHeight(t)).toBeLessThanOrEqual(900);
});

it('title on a phone: a smaller logo over a full width track', () => {
  const t = titleLayout(390, 844);
  expect(t).toMatchObject({ portrait: true, logo: 4.5, trackWidth: 390, buttonWidth: 230, small: 1.5 });
  expect(titleHeight(t)).toBeLessThanOrEqual(844);
  expect(titleLayout(320, 568).buttonWidth).toBe(230); // still fits a small phone
});

it('a short window gets a smaller logo and a narrower track, so the title still fits', () => {
  for (const [vw, vh] of [[844, 390], [1024, 600], [1600, 500], [667, 375]] as const) {
    const t = titleLayout(vw, vh);
    expect(t.portrait).toBe(false);
    expect(t.trackWidth).toBeLessThanOrEqual(vw);
    expect(titleHeight(t), `${vw}×${vh}`).toBeLessThanOrEqual(vh);
  }
  expect(titleLayout(844, 390).logo).toBe(3.5);
});

it('sizes the menu text for a phone and a laptop', () => {
  expect(menuSizes(390)).toEqual({ title: 2.5, body: 2, small: 1.5, code: 5 });
  expect(menuSizes(1440)).toEqual({ title: 3, body: 2, small: 1.5, code: 6 });
  expect([menuSizes(599).title, menuSizes(600).title]).toEqual([2.5, 3]);
});

it('spaces a menu screen out on a laptop and an upright phone, and closes it up on a phone on its side', () => {
  const roomy = { top: 56, bottom: 24, gap: 18, strip: 720 };
  expect(menuSpacing(1440, 900)).toEqual(roomy);
  expect(menuSpacing(390, 844)).toEqual(roomy);
  const side = menuSpacing(844, 390);
  expect(side).toMatchObject({ top: 16, bottom: 12, gap: 10 });
  // The idle strip, a quarter as high as it is wide inside its 16 px sides, takes at most 15% of the height.
  expect((side.strip - 32) / 4).toBeCloseTo(0.15 * 390);
  expect(menuSpacing(667, 375).strip).toBeCloseTo(32 + 0.6 * 375);
  // A short window too narrow for the column to miss the corner buttons keeps the room above it.
  expect(menuSpacing(500, 500)).toEqual(roomy);
});

it('measures the tower in cells: a title, then 12 a line', () => {
  expect(boardHeightCells(8)).toBe(107);
  expect(boardHeightCells(2)).toBe(35);
});

// The bottom of a tower of `rows` lines.
const fits = (l: RaceLayout, rows = 8) => l.board.y + boardHeightCells(rows) * l.board.cell;
// The middle of the countdown's number, which is 7 cells high.
const countMiddle = (l: RaceLayout) => l.count.y + (7 * l.count.cell) / 2;

it('puts the tower above the track on a laptop, with the right column kept free', () => {
  const l = raceLayout(1440, 900, false, 2);
  expect(l.board).toEqual({ x: 16, y: 16, cell: 2 });
  expect(l.mode).toBe('wide');
  expect(l.canvas.x).toBe(0);
  expect(l.canvas.w).toBe(1440 - PEEK_COLUMN);
  expect(l.canvas.h).toBeCloseTo(((1440 - PEEK_COLUMN) / 600) * 190);
  expect(fits(l)).toBeLessThanOrEqual(l.canvas.y);
  expect(l.canvas.y).toBeCloseTo(fits(l) + 16);
  expect(l.code).toEqual({ x: 16, y: 900 - 16 - 7 * 1.5 });
  expect(l.code!.y + 7 * 1.5).toBeLessThanOrEqual(900);
  expect(l.count.cell).toBe(14);
  expect(countMiddle(l)).toBeCloseTo(l.canvas.y + l.canvas.h / 2);
  expect([l.hud, l.zones]).toEqual([null, null]);
});

it('shrinks the tower before the track on a short laptop window', () => {
  const l = raceLayout(1440, 680, false, 2);
  expect(l.board.cell).toBe(1.5);
  expect(l.canvas.w).toBe(1440 - PEEK_COLUMN);
  expect(l.canvas.y + l.canvas.h + 46).toBeLessThanOrEqual(680);
});

it('shrinks the track only once the tower is at its smallest', () => {
  const l = raceLayout(1440, 600, false, 2);
  expect(l.board.cell).toBe(1);
  expect(l.canvas.w).toBeLessThan(1440 - PEEK_COLUMN);
  expect(l.canvas.h / l.canvas.w).toBeCloseTo(190 / 600);
  expect(fits(l)).toBeLessThanOrEqual(l.canvas.y);
  expect(l.canvas.y + l.canvas.h + 46 - 600).toBeLessThan(1e-6);
});

it('fits eight rows above the HUD strip on an upright phone', () => {
  const l = raceLayout(390, 844, true, 3);
  // At most 1.5 CSS px a cell, which at 3 device px a CSS px is 4.5 of them: down to 4.
  expect(l.board).toEqual({ x: 8, y: 8, cell: 4 / 3 });
  expect(raceLayout(390, 844, true, 2).board.cell).toBe(1.5);
  expect(fits(l)).toBeLessThanOrEqual(l.hud!.y);
  expect(l.code).toBeNull();
  const solo = soloLayout(390, 844, true);
  expect([l.mode, l.canvas, l.hud, l.zones]).toEqual([solo.mode, solo.canvas, solo.hud, solo.zones]);
  // The number is halfway between the track and the touch areas.
  expect(l.count.cell).toBe(10);
  expect(countMiddle(l)).toBeCloseTo((l.canvas.y + l.canvas.h + l.zones!.left.y) / 2);
});

it('fits eight rows above the track on a phone on its side', () => {
  const l = raceLayout(844, 390, true, 3);
  expect(l.board).toEqual({ x: 8, y: 8, cell: 1 });
  expect(fits(l)).toBeLessThanOrEqual(l.canvas.y);
  expect(l.canvas.y + l.canvas.h).toBeCloseTo(390, 5);
  const solo = soloLayout(844, 390, true);
  expect([l.mode, l.canvas, l.hud, l.zones]).toEqual([solo.mode, solo.canvas, solo.hud, solo.zones]);
  expect(l.code).toBeNull();
  expect(l.count.cell).toBe(8);
  expect(countMiddle(l)).toBeCloseTo(l.canvas.y + l.canvas.h / 2);
});

it('keeps a tower cell on whole device pixels', () => {
  for (const dpr of [1, 1.25, 1.5, 2, 2.625, 3]) {
    for (const [vw, vh, coarse] of [[1440, 680, false], [390, 844, true], [844, 390, true]] as const) {
      const px = raceLayout(vw, vh, coarse, dpr).board.cell * dpr;
      expect(px).toBeCloseTo(Math.round(px), 9);
      expect(px).toBeGreaterThanOrEqual(1);
    }
  }
});

it('puts the watching line in the sky, and the peeking heads from the top of the world, on a laptop', () => {
  const l = raceLayout(1440, 900, false, 2);
  const worldTop = l.canvas.y + SKY * l.scale;
  expect(l.peek).toEqual({ y: worldTop, cell: 1.5, max: 7 });
  expect(l.label.cell).toBe(2);
  expect(l.label.y).toBeGreaterThan(l.canvas.y);
  expect(l.label.y + FONT_ROWS * l.label.cell).toBeLessThan(worldTop);
  expect(l.hint).toEqual({ y: 900 - 16 - FONT_ROWS * 1.5, cell: 1.5 });
});

it('puts the watching line between the tower and the HUD strip, and three heads under the track, upright', () => {
  const l = raceLayout(390, 844, true, 3);
  expect(l.label.y).toBeGreaterThan(l.board.y + boardHeightCells(8) * l.board.cell);
  expect(l.label.y + FONT_ROWS * l.label.cell).toBeLessThan(l.hud!.y);
  expect(l.peek).toEqual({ y: l.canvas.y + l.canvas.h + 20, cell: l.board.cell, max: 3 });
  expect(l.hint.y).toBe(844 - 16 - FONT_ROWS * 1.5);
});

it('puts the heads and the switch hint along the top, on a phone on its side', () => {
  const l = raceLayout(844, 390, true, 3);
  expect(l.peek).toEqual({ y: 12, cell: l.board.cell, max: 3 });
  expect(l.hint.y).toBe(12);
  expect(l.label.y).toBeGreaterThan(l.canvas.y);
  expect(l.label.y + FONT_ROWS * l.label.cell).toBeLessThan(l.canvas.y + SKY * l.scale);
});
