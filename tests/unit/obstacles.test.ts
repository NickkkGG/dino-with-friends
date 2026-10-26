import { expect, it } from 'vitest';
import { typeConfig } from '../../shared/sim/obstacle-types';
import type { ObstacleType } from '../../shared/sim/obstacle-types';
import type { ObstacleView } from '../../shared/sim/world';
import { drawObstacles } from '../../src/game/draw/obstacles';
import { callsOf } from './helpers/fake-ctx';
import { SHEET, fakeDc } from './helpers/fake-dc';

const view = (type: ObstacleType, size: number, x: number, y: number): ObstacleView => ({
  index: 0, type, size, x, y, width: typeConfig(type).width * size, height: typeConfig(type).height, boxes: [],
});

it('obstacles: groups use the original source x; birds flap every 10 steps', () => {
  const small = fakeDc();
  drawObstacles(small.dc, [view('cactusSmall', 2, 300, 105)], 0);
  expect(callsOf(small.calls, 'drawImage')).toEqual([[SHEET, 245, 2, 34, 35, 300, 105, 34, 35]]);
  const large = fakeDc(2, 2);
  drawObstacles(large.dc, [view('cactusLarge', 3, 100, 90), view('cactusSmall', 1, 400, 105)], 0);
  expect(callsOf(large.calls, 'drawImage')).toEqual([
    [SHEET, 802, 2, 150, 100, 200, 180, 150, 100],
    [SHEET, 446, 2, 34, 70, 800, 210, 34, 70],
  ]);
  for (const [step, sx] of [[0, 134], [9, 134], [10, 180], [19, 180], [20, 134]] as const) {
    const bird = fakeDc();
    drawObstacles(bird.dc, [view('pterodactyl', 1, 400, 75)], step);
    expect(callsOf(bird.calls, 'drawImage'), `step ${step}`).toEqual([[SHEET, sx, 2, 46, 40, 400, 75, 46, 40]]);
  }
});
