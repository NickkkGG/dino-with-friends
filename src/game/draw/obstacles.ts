// Copyright 2024 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the third_party/chromium/LICENSE file.
// Modified for DINO with FRIENDS: Obstacle.draw for the obstacles of a world, on a given sheet; a bird's wings follow the world's step.

import { typeConfig } from '../../../shared/sim/obstacle-types';
import type { ObstacleView } from '../../../shared/sim/world';
import { blit } from './context';
import type { DrawContext } from './context';

// A bird flips its wings every 1000 / 6 ms in the original: every 10 steps.
const FLAP_STEPS = 10;

/** Draws each obstacle, a group of two or three as one wider picture from further along the sheet, like the original. */
export function drawObstacles(dc: DrawContext, views: readonly ObstacleView[], step: number): void {
  const { pos, scale: s } = dc.sheet;
  for (const o of views) {
    const cfg = typeConfig(o.type);
    const sw = cfg.width * s;
    const sh = cfg.height * s;
    let sx = sw * o.size * (0.5 * (o.size - 1)) + pos[o.type].x;
    const frame = cfg.numFrames ? Math.floor(step / FLAP_STEPS) % cfg.numFrames : 0;
    if (frame > 0) sx += sw * frame;
    blit(dc, sx, pos[o.type].y, sw * o.size, sh, o.x, o.y, cfg.width * o.size, cfg.height);
  }
}
