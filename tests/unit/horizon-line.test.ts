import { expect, it } from 'vitest';
import { groundSegment } from '../../shared/sim/course';
import { drawHorizonLine } from '../../src/game/draw/horizon-line';
import { callsOf } from './helpers/fake-ctx';
import { SHEET, fakeDc } from './helpers/fake-dc';

it('horizon: two 600 px pieces; piece 0 flat, piece 1 bumpy; scrolling moves them left', () => {
  const start = fakeDc();
  drawHorizonLine(start.dc, 7, 0);
  expect(callsOf(start.calls, 'drawImage')).toEqual([
    [SHEET, 2, 52, 600, 12, 0, 127, 600, 12],
    [SHEET, 602, 52, 600, 12, 600, 127, 600, 12],
  ]);
  const later = fakeDc();
  drawHorizonLine(later.dc, 7, 650);
  expect(callsOf(later.calls, 'drawImage')).toEqual([
    [SHEET, 602, 52, 600, 12, -50, 127, 600, 12],
    [SHEET, 2 + 600 * groundSegment(7, 2), 52, 600, 12, 550, 127, 600, 12],
  ]);
  // the 2x sheet: source doubled, but the bumpy piece is still 600 sheet pixels along, like the original
  const hd = fakeDc(2, 2);
  drawHorizonLine(hd.dc, 7, 0);
  expect(callsOf(hd.calls, 'drawImage')).toEqual([
    [SHEET, 4, 104, 1200, 24, 0, 254, 1200, 24],
    [SHEET, 604, 104, 1200, 24, 1200, 254, 1200, 24],
  ]);
});

it('horizon: every later piece is the one the seed picks', () => {
  const kinds = new Set<number>();
  for (let n = 2; n < 40; n++) {
    const { dc, calls } = fakeDc();
    drawHorizonLine(dc, 3, n * 600);
    const sx = callsOf(calls, 'drawImage')[0]![1];
    expect(sx, `piece ${n}`).toBe(2 + 600 * groundSegment(3, n));
    kinds.add(groundSegment(3, n));
  }
  expect([...kinds].sort()).toEqual([0, 1]);
});
