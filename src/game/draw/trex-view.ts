// Copyright 2024 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the third_party/chromium/LICENSE file.
// Modified for DINO with FRIENDS: Trex.update, blink and draw as a view of the world's dino: its status comes from the world, time from 60 Hz steps, the frame timer restarts with each status, and the waiting dino blinks without end; plus the hurt and low-heart faces, blinking after a hit and at the end of GHOST, and a dotted GHOST.

import { HURT_STEPS, INVULN_STEPS, STEP_MS, TREX_H, TREX_W, TREX_W_DUCK } from '../../../shared/sim/constants';
import { isHurt, skillRemaining, stepsSinceHit } from '../../../shared/sim/world';
import type { World } from '../../../shared/sim/world';
import { blit } from './context';
import type { DrawContext } from './context';

type Status = 'waiting' | 'running' | 'jumping' | 'ducking' | 'crashed';

const ANIM_FRAMES: Readonly<Record<Status, { frames: readonly number[]; msPerFrame: number }>> = {
  waiting: { frames: [44, 0], msPerFrame: 1000 / 3 },
  running: { frames: [88, 132], msPerFrame: 1000 / 12 },
  crashed: { frames: [220], msPerFrame: 1000 / 60 },
  jumping: { frames: [0], msPerFrame: 1000 / 60 },
  ducking: { frames: [264, 323], msPerFrame: 1000 / 8 },
};

const BLINK_TIMING = 7000;
// After the hurt face the dino blinks, 6 steps shown and 6 hidden, until it can be hit again; GHOST blinks the same way
// in its last 60 steps.
const BLINK_STEPS = 6;
const GHOST_WARN_STEPS = 60;

/** How the dino is drawn this step: a frame of its strip, which face row, and where. */
export interface TrexPose {
  /** The frame's x in the dino strip, in 1x pixels. */
  frame: number;
  row: 'normal' | 'hurt' | 'low';
  width: number;
  x: number;
  y: number;
  visible: boolean;
  ghost: boolean;
}

function statusOf(w: World): Status {
  if (w.phase === 'dead') return 'crashed';
  if (w.phase === 'waiting' && !w.trex.jumping) return 'waiting';
  if (w.trex.jumping) return 'jumping';
  if (w.trex.ducking) return 'ducking';
  return 'running';
}

/** The dino as it is drawn: the world says where it is and what it does, this picks and times the frames. */
export class TrexView {
  private status: Status | null = null;
  private currentFrame = 0;
  private timer = 0;
  private time = 0;
  private animStartTime = 0;
  private blinkDelay = 0;
  // The frame drawn last. A waiting dino only draws when it is time to blink, so until then the last one stays.
  private shown = 0;
  private scratch: HTMLCanvasElement | null = null;
  private mask: HTMLCanvasElement | null = null;
  private readonly rand: () => number;

  constructor(rand: () => number = Math.random) {
    this.rand = rand;
  }

  reset(): void {
    this.status = null;
    this.currentFrame = 0;
    this.timer = 0;
    this.time = 0;
    this.animStartTime = 0;
    this.blinkDelay = 0;
    this.shown = 0;
  }

  step(w: World): void {
    const status = statusOf(w);
    this.time += STEP_MS;
    if (status !== this.status) {
      this.status = status;
      this.currentFrame = 0;
      this.timer = 0;
      if (status === 'waiting') {
        this.animStartTime = this.time;
        this.setBlinkDelay();
      }
    }
    this.timer += STEP_MS;
    const { frames, msPerFrame } = ANIM_FRAMES[status];
    if (status === 'waiting') this.blink(frames);
    else this.shown = frames[this.currentFrame]!;
    if (this.timer >= msPerFrame) {
      this.currentFrame = this.currentFrame === frames.length - 1 ? 0 : this.currentFrame + 1;
      this.timer = 0;
    }
  }

  pose(w: World): TrexPose {
    const crashed = w.phase === 'dead';
    let row: TrexPose['row'] = 'normal';
    if (!crashed && isHurt(w)) row = 'hurt';
    else if (!crashed && w.hp === 1 && w.phase === 'running') row = 'low';
    const since = stepsSinceHit(w);
    const ghostLeft = skillRemaining(w, 'ghost');
    let visible = true;
    if (since >= HURT_STEPS && since < INVULN_STEPS) visible = Math.floor((since - HURT_STEPS) / BLINK_STEPS) % 2 === 0;
    if (ghostLeft > 0 && ghostLeft <= GHOST_WARN_STEPS && Math.floor(ghostLeft / BLINK_STEPS) % 2 !== 0) visible = false;
    return {
      frame: this.shown,
      row,
      width: w.trex.ducking && !crashed ? TREX_W_DUCK : TREX_W,
      // Crashed while ducking, the dino is drawn standing, a pixel to the right, as in the original.
      x: w.trex.x + (crashed && w.trex.ducking ? 1 : 0),
      y: w.trex.y,
      visible,
      ghost: ghostLeft > 0,
    };
  }

  draw(dc: DrawContext, w: World): void {
    const p = this.pose(w);
    if (!p.visible) return;
    const { pos, scale: s, faceRowY } = dc.sheet;
    const sx = pos.tRex.x + p.frame * s;
    const sy = faceRowY[p.row];
    if (p.ghost) this.drawDotted(dc, sx, sy, p.width, p.x, p.y);
    else blit(dc, sx, sy, p.width * s, TREX_H * s, p.x, p.y);
  }

  private setBlinkDelay(): void {
    this.blinkDelay = Math.ceil(this.rand() * BLINK_TIMING);
  }

  private blink(frames: readonly number[]): void {
    if (this.time - this.animStartTime < this.blinkDelay) return;
    this.shown = frames[this.currentFrame]!;
    if (this.currentFrame === 1) {
      this.setBlinkDelay();
      this.animStartTime = this.time;
    }
  }

  // GHOST: the frame goes onto a scratch canvas, which then keeps only the world pixels whose x + y is even.
  private drawDotted(dc: DrawContext, sx: number, sy: number, width: number, x: number, y: number): void {
    const { k, sheet } = dc;
    const w = width * k;
    const h = TREX_H * k;
    const scratch = (this.scratch ??= document.createElement('canvas'));
    if (scratch.width !== w || scratch.height !== h) {
      scratch.width = w;
      scratch.height = h;
    }
    const ctx = scratch.getContext('2d');
    if (!ctx) return;
    ctx.globalCompositeOperation = 'source-over';
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(sheet.canvas, sx, sy, width * sheet.scale, TREX_H * sheet.scale, 0, 0, w, h);
    ctx.globalCompositeOperation = 'destination-in';
    const shift = (((x + y) % 2) + 2) % 2; // one cell along the mask when x + y is odd
    ctx.drawImage(this.maskFor(k), shift * k, 0, w, h, 0, 0, w, h);
    dc.ctx.drawImage(scratch, Math.round(x * k), Math.round((y + dc.oy) * k));
  }

  // A checkerboard of k-pixel cells, filled where column + row is even, one column wider than the widest frame.
  private maskFor(k: number): HTMLCanvasElement {
    const cols = TREX_W_DUCK + 1;
    if (this.mask && this.mask.width === cols * k) return this.mask;
    const mask = document.createElement('canvas');
    mask.width = cols * k;
    mask.height = TREX_H * k;
    const ctx = mask.getContext('2d');
    if (ctx) {
      for (let r = 0; r < TREX_H; r++) {
        for (let c = r % 2; c < cols; c += 2) ctx.fillRect(c * k, r * k, k, k);
      }
    }
    this.mask = mask;
    return mask;
  }
}
