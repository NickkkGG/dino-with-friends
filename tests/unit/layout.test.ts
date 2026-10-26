import { expect, it } from 'vitest';
import { HUD_STRIP, SKY, soloLayout } from '../../src/game/layout';

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
