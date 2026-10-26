import { expect, it } from 'vitest';
import { TREX_X } from '../../shared/sim/constants';
import {
  TREX_BOXES_DUCKING, TREX_BOXES_RUNNING, boxCompare, findCollision, overlapCenter, touchesBox,
} from '../../shared/sim/collision';
import { OBSTACLE_TYPES, boxesForSize, typeConfig } from '../../shared/sim/obstacle-types';
import type { ObstacleType } from '../../shared/sim/obstacle-types';
import { createTrex } from '../../shared/sim/trex';
import type { TrexState } from '../../shared/sim/trex';

const DUCKING = { ducking: true };

const range = (from: number, to: number): number[] => Array.from({ length: to - from + 1 }, (_, i) => from + i);

// What findCollision gets to see: an obstacle with its left edge at x. A bird comes at several heights, so its y must be given.
function obstacle(type: ObstacleType, size: number, x: number, y?: number) {
  const cfg = typeConfig(type);
  const top = y ?? cfg.yPos;
  if (typeof top !== 'number') throw new Error(`${type} comes at several heights, so say which one`);
  return { x, y: top, width: cfg.width * size, height: cfg.height, boxes: boxesForSize(cfg, size) };
}

// The first x, scanning left from 200 to -width, at which the dino at (24, 93) meets the obstacle.
function firstHitX(type: ObstacleType, size: number, y?: number, trex: Partial<TrexState> = {}): number | null {
  const dino = { ...createTrex(TREX_X), ...trex };
  for (let x = 200; x >= -typeConfig(type).width * size; x--) {
    if (findCollision(dino, obstacle(type, size, x, y))) return x;
  }
  return null;
}

it('grounded running dino meets cacti where the original does', () => {
  expect(firstHitX('cactusSmall', 1)).toBe(58);
  expect(firstHitX('cactusSmall', 3)).toBe(58);
  expect(firstHitX('cactusLarge', 1)).toBe(62);
  expect(firstHitX('cactusLarge', 3)).toBe(62);
  // small cactus size 1: hits for every x from 58 down to 10, and not at 9 or 59
  const hits = (x: number) => findCollision(createTrex(TREX_X), obstacle('cactusSmall', 1, x)) !== null;
  expect(range(-30, 100).filter(hits)).toEqual(range(10, 58));
});

it('birds: low hits a ducking dino, middle passes over a ducking dino, high passes over a running one', () => {
  expect(firstHitX('pterodactyl', 1, 100)).toBe(52);
  expect(firstHitX('pterodactyl', 1, 100, DUCKING)).toBe(65);
  expect(firstHitX('pterodactyl', 1, 75)).toBe(47);
  expect(firstHitX('pterodactyl', 1, 75, DUCKING)).toBeNull();
  expect(firstHitX('pterodactyl', 1, 50)).toBeNull();
  expect(firstHitX('pterodactyl', 1, 50, DUCKING)).toBeNull();
});

it('a ducking dino still uses the 44 × 47 outer box', () => {
  expect(firstHitX('cactusSmall', 1, undefined, DUCKING)).toBe(65);
});

it('a dino at y 50 clears a small cactus', () => {
  expect(firstHitX('cactusSmall', 1, undefined, { y: 50 })).toBeNull();
});

it('gives the adjusted inner boxes that met, the dino\'s first', () => {
  expect(findCollision(createTrex(TREX_X), obstacle('cactusSmall', 1, 58))).toEqual([
    { x: 47, y: 94, w: 17, h: 16 }, { x: 63, y: 106, w: 6, h: 34 }]);
  expect(findCollision({ ...createTrex(TREX_X), ...DUCKING }, obstacle('cactusSmall', 1, 65))).toEqual([
    { x: 26, y: 112, w: 55, h: 25 }, { x: 66, y: 113, w: 5, h: 27 }]);
  expect(findCollision(createTrex(TREX_X), obstacle('cactusSmall', 1, 100))).toBeNull();
  // Two pairs overlap here, (dino box 1, cactus box 2) and (dino box 2, cactus box 1). The dino's boxes come in order,
  // each one against all of the cactus's boxes, so the first pair is the one with the dino's first box.
  expect(findCollision(createTrex(TREX_X), obstacle('cactusSmall', 1, 54))).toEqual([
    { x: 47, y: 94, w: 17, h: 16 }, { x: 59, y: 106, w: 6, h: 34 }]);
});

it('overlapCenter is the centre of where the two boxes overlap, rounded down', () => {
  expect(overlapCenter([{ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 7, w: 10, h: 10 }])).toEqual({ x: 7, y: 8 });
  expect(overlapCenter([{ x: 4, y: 4, w: 2, h: 2 }, { x: 0, y: 0, w: 20, h: 20 }])).toEqual({ x: 5, y: 5 });
  const running = findCollision(createTrex(TREX_X), obstacle('cactusSmall', 1, 58));
  const ducking = findCollision({ ...createTrex(TREX_X), ...DUCKING }, obstacle('cactusSmall', 1, 65));
  expect(running && overlapCenter(running)).toEqual({ x: 63, y: 108 });
  expect(ducking && overlapCenter(ducking)).toEqual({ x: 68, y: 125 });
});

it('stretches the middle box of a group', () => {
  expect(boxesForSize(typeConfig('cactusLarge'), 3)).toEqual([
    { x: 0, y: 12, w: 7, h: 38 }, { x: 8, y: 0, w: 58, h: 49 }, { x: 65, y: 10, w: 10, h: 38 }]);
  expect(boxesForSize(typeConfig('cactusSmall'), 2)).toEqual([
    { x: 0, y: 7, w: 5, h: 27 }, { x: 4, y: 0, w: 22, h: 34 }, { x: 27, y: 4, w: 7, h: 14 }]);
});

it('leaves a single obstacle as it is, and never changes the boxes of its type', () => {
  for (const cfg of OBSTACLE_TYPES) {
    const before = cfg.boxes.map((b) => ({ ...b }));
    expect(boxesForSize(cfg, 1)).toEqual(before);
    boxesForSize(cfg, 3);
    expect(cfg.boxes).toEqual(before);
  }
});

it('touchesBox: running touches a box at y 96 for x 32..63, ducking never, a dino at y 60 for x 19..48', () => {
  const touching = (trex: TrexState, y: number) => range(-20, 120).filter((x) => touchesBox(trex, x, y, 16));
  const running = createTrex(TREX_X);
  expect(touching(running, 96)).toEqual(range(32, 63));
  expect(touching({ ...running, ...DUCKING }, 96)).toEqual([]);
  expect(touching({ ...running, y: 60 }, 96)).toEqual(range(19, 48));
  // No outer box to pass first: a ducking dino's inner box reaches past its 44 px outer box, and a box out there is touched.
  expect(touchesBox({ ...running, ...DUCKING }, 70, 120, 16)).toBe(true);
});

it('boxCompare: touching edges do not overlap', () => {
  expect(boxCompare({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 5, h: 5 })).toBe(false);
  expect(boxCompare({ x: 0, y: 0, w: 10, h: 10 }, { x: 0, y: 10, w: 5, h: 5 })).toBe(false);
  expect(boxCompare({ x: 0, y: 0, w: 10, h: 10 }, { x: 9, y: 9, w: 5, h: 5 })).toBe(true);
  expect(boxCompare({ x: 0, y: 0, w: 10, h: 10 }, { x: 3, y: 3, w: 2, h: 2 })).toBe(true);
});

it('lists the three obstacle types in the original order with the original numbers', () => {
  expect(OBSTACLE_TYPES.map((c) => c.type)).toEqual(['cactusSmall', 'cactusLarge', 'pterodactyl']);
  expect(OBSTACLE_TYPES.map((c) =>
    [c.width, c.height, c.yPos, c.multipleSpeed, c.minGap, c.minSpeed, c.speedOffset, c.numFrames])).toEqual([
    [17, 35, 105, 4, 120, 0, 0, 0],
    [25, 50, 90, 7, 120, 0, 0, 0],
    [46, 40, [100, 75, 50], 999, 150, 8.5, 0.8, 2],
  ]);
  for (const cfg of OBSTACLE_TYPES) expect(typeConfig(cfg.type)).toBe(cfg);
});

it('keeps the original collision boxes of the obstacles and of the dino', () => {
  expect(typeConfig('cactusSmall').boxes).toEqual([
    { x: 0, y: 7, w: 5, h: 27 }, { x: 4, y: 0, w: 6, h: 34 }, { x: 10, y: 4, w: 7, h: 14 }]);
  expect(typeConfig('cactusLarge').boxes).toEqual([
    { x: 0, y: 12, w: 7, h: 38 }, { x: 8, y: 0, w: 7, h: 49 }, { x: 13, y: 10, w: 10, h: 38 }]);
  expect(typeConfig('pterodactyl').boxes).toEqual([
    { x: 15, y: 15, w: 16, h: 5 }, { x: 18, y: 21, w: 24, h: 6 }, { x: 2, y: 14, w: 4, h: 3 },
    { x: 6, y: 10, w: 4, h: 7 }, { x: 10, y: 8, w: 6, h: 9 }]);
  expect(TREX_BOXES_RUNNING).toEqual([
    { x: 22, y: 0, w: 17, h: 16 }, { x: 1, y: 18, w: 30, h: 9 }, { x: 10, y: 35, w: 14, h: 8 },
    { x: 1, y: 24, w: 29, h: 5 }, { x: 5, y: 30, w: 21, h: 4 }, { x: 9, y: 34, w: 15, h: 4 }]);
  expect(TREX_BOXES_DUCKING).toEqual([{ x: 1, y: 18, w: 55, h: 25 }]);
});
