// Copyright 2024 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the third_party/chromium/LICENSE file.
// Modified for DINO with FRIENDS: plain state and functions instead of the Trex class, 60 Hz steps, no drawing or sound, plus an air jump.

import {
  DROP_VELOCITY, GRAVITY, GROUND_Y, INITIAL_JUMP_VELOCITY, MAX_JUMP_HEIGHT, MIN_JUMP_Y, SPEED_DROP_COEFFICIENT,
} from './constants';

/**
 * The dino's body in the world: where it is and how its jump is going.
 * y counts down from the top of the world, so a jump makes y smaller and GROUND_Y is standing on the ground.
 */
export interface TrexState {
  x: number;
  y: number;
  /** Vertical speed in pixels per step; negative is up. */
  vy: number;
  jumping: boolean;
  ducking: boolean;
  /** ↓ was pressed in the air: the rest of the jump is cut short and the dino falls three times as fast. */
  speedDrop: boolean;
  /** The jump has climbed far enough that letting go of the key may cut it short. */
  reachedMinHeight: boolean;
  /** The air jump of this jump has been used. */
  airJumpUsed: boolean;
}

/** A dino standing on the ground at x. */
export function createTrex(x: number): TrexState {
  return {
    x,
    y: GROUND_Y,
    vy: 0,
    jumping: false,
    ducking: false,
    speedDrop: false,
    reachedMinHeight: false,
    airJumpUsed: false,
  };
}

/**
 * Starts a jump from the ground. False, and nothing changes, if the dino is already jumping or is ducking.
 * The faster the ground runs, the harder the push: vy starts at INITIAL_JUMP_VELOCITY - speed / 10.
 */
export function startJump(t: TrexState, speed: number): boolean {
  if (t.jumping || t.ducking) return false;
  t.vy = INITIAL_JUMP_VELOCITY - speed / 10;
  t.jumping = true;
  t.reachedMinHeight = false;
  t.speedDrop = false;
  t.airJumpUsed = false;
  return true;
}

/**
 * Jumps again in mid-air, once per jump: the same push as the first jump, from wherever the dino is.
 * False, and nothing changes, on the ground or when this jump's air jump has been used. Not in the original game.
 */
export function airJump(t: TrexState, speed: number): boolean {
  if (!t.jumping || t.airJumpUsed) return false;
  t.vy = INITIAL_JUMP_VELOCITY - speed / 10;
  t.reachedMinHeight = false;
  t.speedDrop = false;
  t.airJumpUsed = true;
  return true;
}

/**
 * The jump key was let go. Once the dino has climbed far enough, a rise faster than DROP_VELOCITY is cut back to it,
 * so a short press gives a short jump.
 */
export function endJump(t: TrexState): void {
  if (t.reachedMinHeight && t.vy < DROP_VELOCITY) t.vy = DROP_VELOCITY;
}

/** ↓ was pressed in the air: the dino falls at SPEED_DROP_COEFFICIENT times the speed, starting from vy 1. */
export function setSpeedDrop(t: TrexState): void {
  t.speedDrop = true;
  t.vy = 1;
}

/**
 * One step of a jump. A step is one frame at 60 Hz, so the original's frames-elapsed factor is 1.
 * True on the step the dino lands, and then it is standing on the ground again. Does nothing, and gives false,
 * when the dino is not jumping.
 */
export function updateJump(t: TrexState): boolean {
  if (!t.jumping) return false;
  t.y += Math.round(t.speedDrop ? t.vy * SPEED_DROP_COEFFICIENT : t.vy);
  t.vy += GRAVITY;
  if (t.y < MIN_JUMP_Y || t.speedDrop) t.reachedMinHeight = true;
  // MAX_JUMP_HEIGHT is compared with y, as in the original: above that line the jump may be cut short.
  if (t.y < MAX_JUMP_HEIGHT || t.speedDrop) endJump(t);
  if (t.y <= GROUND_Y) return false;
  // Landed. A speed drop that is still on means ↓ is still held, so the dino lands into a duck, as in the original.
  const fellFast = t.speedDrop;
  resetTrex(t);
  t.ducking = fellFast;
  return true;
}

/**
 * Puts the dino straight back on the ground with every jump and duck flag off.
 * x stays where it is: whatever moves the dino sideways, like the intro, owns it.
 */
export function resetTrex(t: TrexState): void {
  t.y = GROUND_Y;
  t.vy = 0;
  t.jumping = false;
  t.ducking = false;
  t.speedDrop = false;
  t.reachedMinHeight = false;
  t.airJumpUsed = false;
}
