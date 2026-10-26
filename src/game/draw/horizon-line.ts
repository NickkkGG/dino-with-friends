// Copyright 2024 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the third_party/chromium/LICENSE file.
// Modified for DINO with FRIENDS: HorizonLine.draw with its two pieces worked out from the scroll and the seed, on a given sheet.

import { groundSegment } from '../../../shared/sim/course';
import { HORIZON_LINE } from '../sprite-defs';
import { blit } from './context';
import type { DrawContext } from './context';

/**
 * Draws the ground: piece n = floor(scroll / 600) with its left edge at -(scroll mod 600), and piece n + 1 right after
 * it. A bumpy piece starts 600 sheet pixels along, on the 2x sheet too, as in the original.
 */
export function drawHorizonLine(dc: DrawContext, seed: number, scroll: number): void {
  const s = dc.sheet.scale;
  const { sourceX, sourceY, width, height, yPos } = HORIZON_LINE;
  const n = Math.floor(scroll / width);
  const x = n * width - scroll;
  for (const piece of [n, n + 1]) {
    const sx = sourceX * s + groundSegment(seed, piece) * width;
    blit(dc, sx, sourceY * s, width * s, height * s, x + (piece - n) * width, yPos, width, height);
  }
}
