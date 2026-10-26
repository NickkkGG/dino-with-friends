// Copyright 2021 The Chromium Authors
// Copyright 2024 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the third_party/chromium/LICENSE file.
// Modified for DINO with FRIENDS: only the three obstacle types, as plain data with desktop bird heights, group boxes as a function.

import type { Box } from './collision';

export type ObstacleType = 'cactusSmall' | 'cactusLarge' | 'pterodactyl';

/** One kind of obstacle. Its boxes and gaps are for a single obstacle; a group is made with boxesForSize. */
export interface ObstacleTypeConfig {
  type: ObstacleType;
  width: number;
  height: number;
  /** Where its top edge is: one y for a cactus, the heights a bird picks from. */
  yPos: number | readonly number[];
  /** The speed from which this obstacle may come in a group of two or three. */
  multipleSpeed: number;
  /** The least space, in pixels, between this obstacle and the next, before the speed is added. */
  minGap: number;
  /** The speed from which this obstacle may appear at all. */
  minSpeed: number;
  /** Inner collision boxes. x and y are counted from 1 pixel in from the obstacle's top-left corner (its white border). */
  boxes: readonly Box[];
  /** How much faster or slower than the ground this obstacle moves; 0 for a cactus. */
  speedOffset: number;
  /** How many pictures it flips through; 0 for an obstacle that is just one picture. */
  numFrames: number;
}

const BY_TYPE: Readonly<Record<ObstacleType, ObstacleTypeConfig>> = {
  cactusSmall: {
    type: 'cactusSmall',
    width: 17,
    height: 35,
    yPos: 105,
    multipleSpeed: 4,
    minGap: 120,
    minSpeed: 0,
    boxes: [
      { x: 0, y: 7, w: 5, h: 27 },
      { x: 4, y: 0, w: 6, h: 34 },
      { x: 10, y: 4, w: 7, h: 14 },
    ],
    speedOffset: 0,
    numFrames: 0,
  },
  cactusLarge: {
    type: 'cactusLarge',
    width: 25,
    height: 50,
    yPos: 90,
    multipleSpeed: 7,
    minGap: 120,
    minSpeed: 0,
    boxes: [
      { x: 0, y: 12, w: 7, h: 38 },
      { x: 8, y: 0, w: 7, h: 49 },
      { x: 13, y: 10, w: 10, h: 38 },
    ],
    speedOffset: 0,
    numFrames: 0,
  },
  pterodactyl: {
    type: 'pterodactyl',
    width: 46,
    height: 40,
    yPos: [100, 75, 50],
    multipleSpeed: 999,
    minGap: 150,
    minSpeed: 8.5,
    boxes: [
      { x: 15, y: 15, w: 16, h: 5 },
      { x: 18, y: 21, w: 24, h: 6 },
      { x: 2, y: 14, w: 4, h: 3 },
      { x: 6, y: 10, w: 4, h: 7 },
      { x: 10, y: 8, w: 6, h: 9 },
    ],
    speedOffset: 0.8,
    numFrames: 2,
  },
};

/** The types in the original order: a course picks one with randInt(0, 2). */
export const OBSTACLE_TYPES: readonly ObstacleTypeConfig[] = [
  BY_TYPE.cactusSmall,
  BY_TYPE.cactusLarge,
  BY_TYPE.pterodactyl,
];

export function typeConfig(type: ObstacleType): ObstacleTypeConfig {
  return BY_TYPE[type];
}

/**
 * The inner boxes for one obstacle of this type in a group of `size`, as a fresh copy.
 * A group is one wide picture, so its middle box stretches to fill the width between the first and the last box,
 * and the last box moves to the right end. The boxes of the type itself are never changed.
 */
export function boxesForSize(cfg: ObstacleTypeConfig, size: number): Box[] {
  const boxes = cfg.boxes.map((b) => ({ ...b }));
  if (size > 1) {
    const [first, middle, last] = boxes;
    if (!first || !middle || !last) throw new RangeError(`${cfg.type} has too few boxes to make a group`);
    const width = cfg.width * size;
    middle.w = width - first.w - last.w;
    last.x = width - last.w;
  }
  return boxes;
}
