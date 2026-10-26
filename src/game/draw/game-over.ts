// Copyright 2024 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the third_party/chromium/LICENSE file.
// Modified for DINO with FRIENDS: GameOverPanel stepped and drawn apart, on a given sheet; the logo frames (0 and 1) of the restart button are never drawn, frame 2 shows in their place, and the button stays on its last frame.

import { STEP_MS, WORLD_H, WORLD_W } from '../../../shared/sim/constants';
import { blit } from './context';
import type { DrawContext } from './context';

const RESTART_ANIM_DURATION = 875;
const LOGO_PAUSE_DURATION = 875;
const FRAMES = [0, 36, 72, 108, 144, 180, 216, 252];
const MS_PER_FRAME = RESTART_ANIM_DURATION / 8;
const TEXT_X = 0;
const TEXT_Y = 13;
const TEXT_WIDTH = 191;
const TEXT_HEIGHT = 11;
const RESTART_WIDTH = 36;
const RESTART_HEIGHT = 32;
const FIRST_FRAME_SHOWN = 2;

/** GAME OVER and the restart button under it. */
export class GameOverView {
  private animTimer = 0;
  private currentFrame = 0;

  reset(): void {
    this.animTimer = 0;
    this.currentFrame = 0;
  }

  /**
   * One step of the button's animation, as the original runs it: the logo frames wait LOGO_PAUSE_DURATION, then
   * MS_PER_FRAME; from there its timer is never reset, so the remaining frames follow one a step.
   */
  step(): void {
    this.animTimer += STEP_MS;
    if (this.currentFrame === 0 && this.animTimer > LOGO_PAUSE_DURATION) {
      this.animTimer = 0;
      this.currentFrame++;
    } else if (this.currentFrame > 0 && this.currentFrame < FRAMES.length && this.animTimer >= MS_PER_FRAME) {
      this.currentFrame++;
    }
    // At FRAMES.length the original stops, and the last frame it drew stays on the screen.
  }

  /** The restart frame on show: 2 in place of the logo frames, then up to 7. */
  restartFrame(): number {
    return Math.min(FRAMES.length - 1, Math.max(FIRST_FRAME_SHOWN, this.currentFrame));
  }

  draw(dc: DrawContext): void {
    const { pos, scale: s } = dc.sheet;
    const centerX = WORLD_W / 2;
    blit(
      dc, pos.textSprite.x + TEXT_X * s, pos.textSprite.y + TEXT_Y * s, TEXT_WIDTH * s, TEXT_HEIGHT * s,
      Math.round(centerX - TEXT_WIDTH / 2), Math.round((WORLD_H - 25) / 3), TEXT_WIDTH, TEXT_HEIGHT,
    );
    // The original centres the button with half its height, not its width.
    blit(
      dc, pos.restart.x + FRAMES[this.restartFrame()]! * s, pos.restart.y, RESTART_WIDTH * s, RESTART_HEIGHT * s,
      centerX - RESTART_HEIGHT / 2, WORLD_H / 2, RESTART_WIDTH, RESTART_HEIGHT,
    );
  }
}
