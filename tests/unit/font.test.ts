import { expect, it } from 'vitest';
import { GAME_TEXTS } from '../../src/app/dev/game-texts';
import type { DrawContext } from '../../src/game/draw/context';
import { LDPI_POS } from '../../src/game/sprite-defs';
import { FONT_CELL, GLYPHS, LETTER_SPACING, drawText, measureCells } from '../../src/ui/font';
import { callsOf, makeFakeCtx } from './helpers/fake-ctx';

function dcAt(k: number) {
  const { ctx, calls } = makeFakeCtx();
  const sheet = { canvas: {} as CanvasImageSource, scale: 1 as const, pos: LDPI_POS, faceRowY: { normal: 2, hurt: 100, low: 147 } };
  const dc: DrawContext = { ctx, k, sheet, oy: 0 };
  return { dc, calls };
}

const inked = (text: string): number =>
  [...text].reduce((n, ch) => n + GLYPHS[ch]!.rows.join('').split('').filter((c) => c === '#').length, 0);

it('has a glyph for every character the game shows', () => {
  const listed = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789with :-.,+!?<>/\'←→'];
  for (const ch of listed) expect(GLYPHS[ch], `"${ch}"`).toBeDefined();
  expect(GAME_TEXTS.length).toBeGreaterThan(60);
  for (const text of GAME_TEXTS) for (const ch of text) expect(GLYPHS[ch], `"${ch}" in "${text}"`).toBeDefined();
});

it('every glyph has 7 rows of its own width', () => {
  for (const [ch, g] of Object.entries(GLYPHS)) {
    expect(g.rows, `"${ch}"`).toHaveLength(7);
    for (const row of g.rows) {
      expect(row, `"${ch}"`).toHaveLength(g.w);
      expect(row, `"${ch}"`).toMatch(/^[#.]+$/);
    }
    expect(g.rows.join('').includes('#'), `"${ch}"`).toBe(ch !== ' ');
  }
});

it('copies A E G M O R V exactly from the 2x GAME OVER sprite', () => {
  expect(GLYPHS.G!.rows).toEqual(['..#####', '.##....', '##.....', '##..###', '##...##', '.##..##', '..#####']);
  expect(GLYPHS.A!.rows).toEqual(['..###..', '.##.##.', '##...##', '##...##', '#######', '##...##', '##...##']);
  expect(GLYPHS.M!.rows).toEqual(['##...##', '###.###', '#######', '#######', '##.#.##', '##...##', '##...##']);
  expect(GLYPHS.E!.rows).toEqual(['#######', '##.....', '##.....', '######.', '##.....', '##.....', '#######']);
  expect(GLYPHS.O!.rows).toEqual(['.#####.', '##...##', '##...##', '##...##', '##...##', '##...##', '.#####.']);
  expect(GLYPHS.V!.rows).toEqual(['##...##', '##...##', '##...##', '###.###', '.#####.', '..###..', '...#...']);
  expect(GLYPHS.R!.rows).toEqual(['######.', '##...##', '##...##', '##..###', '#####..', '##.###.', '##..###']);
});

it('measures with one empty cell between characters', () => {
  expect(LETTER_SPACING).toBe(1);
  expect(measureCells('GAME')).toBe(31);
  expect(measureCells('A A')).toBe(19);
  expect(measureCells('I')).toBe(GLYPHS.I!.w);
  expect(measureCells('')).toBe(0);
});

it('drawText draws cells of 1.5 world px', () => {
  expect(FONT_CELL).toBe(1.5);
  const { dc, calls } = dcAt(2);
  drawText(dc, 'GO', 10, 4, '#535353');
  const rects = callsOf(calls, 'fillRect') as number[][];
  expect(rects).toHaveLength(inked('GO'));
  for (const [x, y, w, h] of rects) {
    expect([w, h]).toEqual([3, 3]);
    expect((x! - 20) % 3).toBe(0);
    expect((y! - 8) % 3).toBe(0);
  }
  const xs = rects.map((r) => r[0]!);
  expect(Math.min(...xs)).toBe(20);
  expect(xs).toContain(20 + (GLYPHS.G!.w + LETTER_SPACING) * 3); // O's left edge: one empty cell after G
  expect(Math.max(...xs)).toBe(20 + (measureCells('GO') - 1) * 3);
  expect(dc.ctx.fillStyle).toBe('#535353');
});

it('measures and draws a character it has no glyph for as ?', () => {
  expect(measureCells('é')).toBe(GLYPHS['?']!.w);
  const a = dcAt(1);
  const b = dcAt(1);
  drawText(a.dc, 'é', 0, 0, '#535353');
  drawText(b.dc, '?', 0, 0, '#535353');
  expect(callsOf(a.calls, 'fillRect')).toEqual(callsOf(b.calls, 'fillRect'));
});
