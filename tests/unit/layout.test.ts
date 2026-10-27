import { expect, it } from 'vitest';
import { HUD_STRIP, SKY, boardHeightCells, menuSizes, soloLayout, titleLayout } from '../../src/game/layout';
import type { TitleLayout } from '../../src/game/layout';

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

it('measures the tower in cells: a title, then 12 a line', () => {
  expect(boardHeightCells(8)).toBe(107);
  expect(boardHeightCells(2)).toBe(35);
});
