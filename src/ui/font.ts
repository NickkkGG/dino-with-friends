import type { CellContext } from '../game/draw/context';
import { fillCells } from '../game/draw/context';

// The pixel font. G, A, M, E, O, V and R are copied cell for cell from the GAME OVER text of the original 2x sprite
// (third_party/chromium, under third_party/chromium/LICENSE); the rest are drawn in their style: 7 rows, uprights 2
// cells wide, bars 1 cell high, corners rounded with a step. The digits are cell versions of the original digit sprites.

/** One character: its width in cells and its 7 rows of '#' and '.'. */
export interface Glyph {
  w: number;
  rows: readonly string[];
}

/** World pixels per cell: 3 pixels of the 2x sprite, like the original GAME OVER letters. */
export const FONT_CELL = 1.5;

/** Empty cells between two characters. */
export const LETTER_SPACING = 1;

/** Rows in every glyph. */
export const FONT_ROWS = 7;

// A glyph from its rows, written on one line with spaces between them.
function glyph(rows: string): Glyph {
  const r = rows.split(' ');
  return { w: r[0]!.length, rows: r };
}

export const GLYPHS: Readonly<Record<string, Glyph>> = {
  A: glyph('..###.. .##.##. ##...## ##...## ####### ##...## ##...##'),
  B: glyph('######. ##...## ##...## ######. ##...## ##...## ######.'),
  C: glyph('..##### .##.... ##..... ##..... ##..... .##.... ..#####'),
  D: glyph('#####.. ##..##. ##...## ##...## ##...## ##..##. #####..'),
  E: glyph('####### ##..... ##..... ######. ##..... ##..... #######'),
  F: glyph('####### ##..... ##..... ######. ##..... ##..... ##.....'),
  G: glyph('..##### .##.... ##..... ##..### ##...## .##..## ..#####'),
  H: glyph('##...## ##...## ##...## ####### ##...## ##...## ##...##'),
  I: glyph('###### ..##.. ..##.. ..##.. ..##.. ..##.. ######'),
  J: glyph('.....## .....## .....## .....## ##...## ##...## .#####.'),
  K: glyph('##...## ##..##. ##.##.. ####... ##.##.. ##..##. ##...##'),
  L: glyph('##..... ##..... ##..... ##..... ##..... ##..... #######'),
  M: glyph('##...## ###.### ####### ####### ##.#.## ##...## ##...##'),
  N: glyph('##...## ###..## ####.## ##.#### ##..### ##...## ##...##'),
  O: glyph('.#####. ##...## ##...## ##...## ##...## ##...## .#####.'),
  P: glyph('######. ##...## ##...## ######. ##..... ##..... ##.....'),
  Q: glyph('.#####. ##...## ##...## ##...## ##.#.## ##..##. .###.##'),
  R: glyph('######. ##...## ##...## ##..### #####.. ##.###. ##..###'),
  S: glyph('.###### ##..... ##..... .#####. .....## .....## ######.'),
  T: glyph('###### ..##.. ..##.. ..##.. ..##.. ..##.. ..##..'),
  U: glyph('##...## ##...## ##...## ##...## ##...## ##...## .#####.'),
  V: glyph('##...## ##...## ##...## ###.### .#####. ..###.. ...#...'),
  W: glyph('##...## ##...## ##...## ##.#.## ####### ###.### ##...##'),
  X: glyph('##...## ##...## .##.##. ..###.. .##.##. ##...## ##...##'),
  Y: glyph('##..## ##..## .####. ..##.. ..##.. ..##.. ..##..'),
  Z: glyph('####### ....##. ...##.. ..##... .##.... ##..... #######'),
  0: glyph('.####. ##..## ##..## ##..## ##..## ##..## .####.'),
  1: glyph('..##.. .###.. ..##.. ..##.. ..##.. ..##.. ######'),
  2: glyph('.####. ##..## ...### ..###. .###.. ###... ######'),
  3: glyph('###### ...##. ..##.. .####. ....## ##..## .####.'),
  4: glyph('...##. ..###. .####. ##.##. ###### ...##. ...##.'),
  5: glyph('#####. ##.... #####. ....## ....## ##..## .####.'),
  6: glyph('..###. .##... ##.... #####. ##..## ##..## .####.'),
  7: glyph('###### ##..## ...##. ..##.. ..##.. ..##.. ..##..'),
  8: glyph('.####. ##..## ##..## .####. ##..## ##..## .####.'),
  9: glyph('.####. ##..## ##..## .##### ....## ...##. .###..'),
  w: glyph('....... ....... ##...## ##...## ##.#.## ####### .##.##.'),
  i: glyph('## .. ## ## ## ## ##'),
  t: glyph('.##.. .##.. ####. .##.. .##.. .##.. ..###'),
  h: glyph('##.... ##.... #####. ##..## ##..## ##..## ##..##'),
  ' ': glyph('... ... ... ... ... ... ...'),
  ':': glyph('.. ## ## .. ## ## ..'),
  '-': glyph('..... ..... ..... ##### ..... ..... .....'),
  '.': glyph('.. .. .. .. .. ## ##'),
  ',': glyph('.. .. .. .. ## ## #.'),
  '+': glyph('...... ..##.. ..##.. ###### ..##.. ..##.. ......'),
  '!': glyph('## ## ## ## ## .. ##'),
  '?': glyph('.####. ##..## ....## ...##. ..##.. ...... ..##..'),
  '<': glyph('...## ..##. .##.. ##... .##.. ..##. ...##'),
  '>': glyph('##... .##.. ..##. ...## ..##. .##.. ##...'),
  '/': glyph('....## ....## ...##. ..##.. .##... ##.... ##....'),
  "'": glyph('## ## .. .. .. .. ..'),
  '←': glyph('....... ..##... .##.... ####### .##.... ..##... .......'),
  '→': glyph('....... ...##.. ....##. ####### ....##. ...##.. .......'),
};

// A character with no glyph of its own is shown as '?', so a missing one is easy to spot.
const glyphOf = (ch: string): Glyph => GLYPHS[ch] ?? GLYPHS['?']!;

/** How many cells wide a text is, with LETTER_SPACING empty cells between characters. */
export function measureCells(text: string): number {
  let w = 0;
  for (const ch of text) w += glyphOf(ch).w + LETTER_SPACING;
  return Math.max(0, w - LETTER_SPACING);
}

/** Draws a text with its top left corner at world point (x, y), FONT_CELL world pixels per cell. */
export function drawText(dc: CellContext, text: string, x: number, y: number, color: string): void {
  let cx = 0;
  for (const ch of text) {
    const g = glyphOf(ch);
    fillCells(dc, g.rows, x + cx * FONT_CELL, y, color, FONT_CELL, cx, 0);
    cx += g.w + LETTER_SPACING;
  }
}
