// Copyright 2014 The Chromium Authors
// Copyright 2024 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the third_party/chromium/LICENSE file.
// Modified for DINO with FRIENDS: w and h boxes, the dino's boxes moved here from Trex, no drawing, plus touchesBox and overlapCenter.

import { TREX_H, TREX_W } from './constants';
import type { TrexState } from './trex';

/** A rectangle in world pixels. x and y are its top-left corner. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** What findCollision needs to know about an obstacle: its top-left corner and size in the world, and its inner boxes. */
export interface Collidable {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Inner collision boxes. x and y are counted from 1 pixel in from the obstacle's top-left corner (its white border). */
  boxes: readonly Box[];
}

/** The dino's inner collision boxes. x and y are counted from 1 pixel in from the dino's top-left corner (its white border). */
export const TREX_BOXES_RUNNING: readonly Box[] = [
  { x: 22, y: 0, w: 17, h: 16 },
  { x: 1, y: 18, w: 30, h: 9 },
  { x: 10, y: 35, w: 14, h: 8 },
  { x: 1, y: 24, w: 29, h: 5 },
  { x: 5, y: 30, w: 21, h: 4 },
  { x: 9, y: 34, w: 15, h: 4 },
];

export const TREX_BOXES_DUCKING: readonly Box[] = [{ x: 1, y: 18, w: 55, h: 25 }];

/** Whether two boxes overlap. Boxes that only touch along an edge do not. */
export function boxCompare(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.h + a.y > b.y;
}

/** An inner box moved to where it really is, from the corner of the box around it (createAdjustedCollisionBox in the original). */
function adjusted(box: Box, around: Box): Box {
  return { x: box.x + around.x, y: box.y + around.y, w: box.w, h: box.h };
}

/** The 44 × 47 box around the dino, less the 1 pixel white border. A ducking dino keeps it, as in the original. */
function trexOuterBox(t: TrexState): Box {
  return { x: t.x + 1, y: t.y + 1, w: TREX_W - 2, h: TREX_H - 2 };
}

function trexInnerBoxes(t: TrexState): readonly Box[] {
  return t.ducking ? TREX_BOXES_DUCKING : TREX_BOXES_RUNNING;
}

/**
 * Whether the dino has run into the obstacle (checkForCollision in the original).
 * The boxes around the two have to overlap first; then the inner boxes are compared one by one, the dino's first,
 * and the first pair that overlaps is given back, the dino's box first, both moved to world coordinates.
 * Null if there is no hit.
 */
export function findCollision(t: TrexState, c: Collidable): [Box, Box] | null {
  const trexBox = trexOuterBox(t);
  const obstacleBox: Box = { x: c.x + 1, y: c.y + 1, w: c.width - 2, h: c.height - 2 };
  if (!boxCompare(trexBox, obstacleBox)) return null;
  for (const trexInner of trexInnerBoxes(t)) {
    const adjTrex = adjusted(trexInner, trexBox);
    for (const obstacleInner of c.boxes) {
      const adjObstacle = adjusted(obstacleInner, obstacleBox);
      if (boxCompare(adjTrex, adjObstacle)) return [adjTrex, adjObstacle];
    }
  }
  return null;
}

/** The centre of where the two boxes overlap, rounded down to whole world pixels. */
export function overlapCenter(pair: [Box, Box]): { x: number; y: number } {
  const [a, b] = pair;
  const left = Math.max(a.x, b.x);
  const right = Math.min(a.x + a.w, b.x + b.w);
  const top = Math.max(a.y, b.y);
  const bottom = Math.min(a.y + a.h, b.y + b.h);
  return { x: Math.floor((left + right) / 2), y: Math.floor((top + bottom) / 2) };
}

/**
 * Whether the dino touches the size × size box with its top-left corner at (x, y).
 * The dino's inner boxes, moved by the 1 pixel border, go straight against the box:
 * there is no outer box to pass first, and the box is not moved in by the border as an obstacle is.
 */
export function touchesBox(t: TrexState, x: number, y: number, size: number): boolean {
  const target: Box = { x, y, w: size, h: size };
  const trexBox = trexOuterBox(t);
  return trexInnerBoxes(t).some((inner) => boxCompare(adjusted(inner, trexBox), target));
}
