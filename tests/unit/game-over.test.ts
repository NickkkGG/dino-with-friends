import { expect, it } from 'vitest';
import { GameOverView } from '../../src/game/draw/game-over';
import { callsOf } from './helpers/fake-ctx';
import { SHEET, fakeDc } from './helpers/fake-dc';

it('game over: text at (205, 42) and button at (284, 75); frame 2 through the logo pause, then 3..7 a step each like the original, then stays on 7', () => {
  const g = new GameOverView();
  const frames: number[] = [];
  for (let k = 0; k < 200; k++) {
    frames.push(g.restartFrame()); // after k steps
    g.step();
  }
  // the original shows its logo (frames 0 and 1) for 875 ms and then 109 ms; frame 2 stands in for it
  expect(frames.slice(0, 61)).toEqual(Array<number>(61).fill(2));
  expect(frames.slice(61, 67)).toEqual([3, 4, 5, 6, 7, 7]);
  expect(frames.slice(67).every((f) => f === 7)).toBe(true);

  const { dc, calls } = fakeDc();
  g.draw(dc);
  expect(callsOf(calls, 'drawImage')).toEqual([
    [SHEET, 655, 15, 191, 11, 205, 42, 191, 11],
    [SHEET, 2 + 252, 68, 36, 32, 284, 75, 36, 32],
  ]);
  g.reset();
  const hd = fakeDc(2, 2);
  g.draw(hd.dc);
  expect(callsOf(hd.calls, 'drawImage')).toEqual([
    [SHEET, 1294, 28, 382, 22, 410, 84, 382, 22],
    [SHEET, 2 + 144, 130, 72, 64, 568, 150, 72, 64],
  ]);
});

it('can leave out the restart button', () => {
  const g = new GameOverView();
  for (let k = 0; k < 100; k++) g.step();
  const { dc, calls } = fakeDc();
  g.draw(dc, false);
  expect(callsOf(calls, 'drawImage')).toEqual([[SHEET, 655, 15, 191, 11, 205, 42, 191, 11]]);
});
