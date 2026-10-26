// Copyright 2024 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the third_party/chromium/LICENSE file.
// Modified for DINO with FRIENDS: DistanceMeter stepped and drawn apart: the score and its achievements come from the world, HI shows only once there is one (in the score's place when the score is not shown), the place is worked out from the width at each draw, and reset also stops a flash.

import { STEP_MS } from '../../../shared/sim/constants';
import { blit } from './context';
import type { DrawContext } from './context';

const WIDTH = 10;
const HEIGHT = 13;
const DEST_WIDTH = 11;
const MAX_DISTANCE_UNITS = 5;
const FLASH_DURATION = 1000 / 4;
const FLASH_ITERATIONS = 3;
const HI_ALPHA = 0.8;
const DEFAULT_STRING = '00000';

/** The score in the top right corner, which flashes at every 100 points, and the HI score left of it. */
export class MeterView {
  private units = MAX_DISTANCE_UNITS;
  private maxScore = 99999;
  private shown = DEFAULT_STRING;
  private achievement = false;
  private flashTimer = 0;
  private flashIterations = 0;
  private paint = true;

  reset(): void {
    this.shown = DEFAULT_STRING;
    this.achievement = false;
    this.flashTimer = 0;
    this.flashIterations = 0;
    this.paint = true;
  }

  /** One step: show the score, or, after an achievement, keep the digits and flash them off and on. */
  step(score: number, achievement: boolean): void {
    this.paint = true;
    if (!this.achievement) {
      if (score > this.maxScore && this.units === MAX_DISTANCE_UNITS) {
        this.units++;
        this.maxScore = parseInt(`${this.maxScore}9`, 10);
      }
      if (score > 0) {
        if (achievement) {
          this.achievement = true;
          this.flashTimer = 0;
        }
        this.shown = (DEFAULT_STRING + score).slice(-this.units);
      } else {
        this.shown = DEFAULT_STRING;
      }
    } else if (this.flashIterations <= FLASH_ITERATIONS) {
      this.flashTimer += STEP_MS;
      if (this.flashTimer < FLASH_DURATION) {
        this.paint = false;
      } else if (this.flashTimer > FLASH_DURATION * 2) {
        this.flashTimer = 0;
        this.flashIterations++;
      }
    } else {
      this.achievement = false;
      this.flashIterations = 0;
      this.flashTimer = 0;
    }
  }

  /** The digits on show: 5, or 6 once the score has passed 99999. */
  digits(): string {
    return this.shown;
  }

  /** Whether the digits are drawn this step: not while a flash is off. */
  visible(): boolean {
    return this.paint;
  }

  /**
   * Draws the score (unless showScore is false) with its top at y, and HI when hi > 0, in a world `width` wide. HI
   * stands left of the score, or ends where the score would when there is none, as on the title.
   */
  draw(dc: DrawContext, o: { width: number; y: number; hi: number; showScore: boolean }): void {
    const x = o.width - DEST_WIDTH * (this.units + 1);
    if (o.showScore && this.paint) {
      for (let i = this.shown.length - 1; i >= 0; i--) drawChar(dc, x + i * DEST_WIDTH, o.y, Number(this.shown[i]));
    }
    if (o.hi > 0) {
      const hi = `HI ${(DEFAULT_STRING + o.hi).slice(-this.units)}`;
      const hx = o.showScore ? x - this.units * 2 * WIDTH : x - (hi.length - this.units) * DEST_WIDTH;
      dc.ctx.save();
      dc.ctx.globalAlpha = HI_ALPHA;
      for (let i = hi.length - 1; i >= 0; i--) {
        const ch = hi[i]!;
        const index = ch === 'H' ? 10 : ch === 'I' ? 11 : Number.parseInt(ch, 10);
        if (!Number.isNaN(index)) drawChar(dc, hx + i * DEST_WIDTH, o.y, index);
      }
      dc.ctx.restore();
    }
  }
}

// Character `index` of the number strip (0-9, then H and I) at world (x, y).
function drawChar(dc: DrawContext, x: number, y: number, index: number): void {
  const { pos, scale: s } = dc.sheet;
  blit(dc, pos.textSprite.x + WIDTH * index * s, pos.textSprite.y, WIDTH * s, HEIGHT * s, x, y, WIDTH, HEIGHT);
}
