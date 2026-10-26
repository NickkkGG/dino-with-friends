// Copyright 2024 The Chromium Authors
// Copyright 2025 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the third_party/chromium/LICENSE file.
// Modified for DINO with FRIENDS: Cloud and the cloud part of Horizon as one class that is stepped and drawn apart, moving a given number of pixels a step, with its random numbers from an injected source.

import { WORLD_W } from '../../../shared/sim/constants';
import { randInt } from '../../../shared/sim/rng';
import { blit } from './context';
import type { DrawContext } from './context';

const WIDTH = 46;
const HEIGHT = 14;
const MAX_CLOUD_GAP = 400;
const MIN_CLOUD_GAP = 100;
const MAX_SKY_LEVEL = 30;
const MIN_SKY_LEVEL = 71;
const CLOUD_FREQUENCY = 0.5;
const MAX_CLOUDS = 6;

interface Cloud {
  x: number;
  y: number;
  gap: number;
  remove: boolean;
}

/** The clouds behind the track. They are only decoration, so they may differ between screens. */
export class Clouds {
  private clouds: Cloud[] = [];
  private readonly rand: () => number;

  constructor(rand: () => number = Math.random) {
    this.rand = rand;
    this.reset();
  }

  /** One cloud at the right edge, the way the original's horizon starts. */
  reset(): void {
    this.clouds = [];
    this.addCloud();
  }

  /**
   * Moves the clouds px pixels left and maybe adds one. A step of 0 changes nothing: the original only updates its
   * clouds while the game runs, and then they always move at least a pixel.
   */
  step(px: number): void {
    if (px <= 0) return;
    const n = this.clouds.length;
    if (n === 0) {
      this.addCloud();
    } else {
      for (let i = n - 1; i >= 0; i--) this.update(this.clouds[i]!, px);
      const last = this.clouds.at(-1)!;
      if (n < MAX_CLOUDS && WORLD_W - last.x > last.gap && CLOUD_FREQUENCY > this.rand()) this.addCloud();
    }
    this.clouds = this.clouds.filter((c) => !c.remove);
  }

  draw(dc: DrawContext): void {
    const { pos, scale } = dc.sheet;
    for (let i = this.clouds.length - 1; i >= 0; i--) {
      const c = this.clouds[i]!;
      blit(dc, pos.cloud.x, pos.cloud.y, WIDTH * scale, HEIGHT * scale, c.x, c.y, WIDTH, HEIGHT);
    }
  }

  private update(c: Cloud, px: number): void {
    if (c.remove) return;
    c.x -= Math.ceil(px);
    if (c.x + WIDTH <= 0) c.remove = true;
  }

  private addCloud(): void {
    const gap = randInt(this.rand, MIN_CLOUD_GAP, MAX_CLOUD_GAP);
    const y = randInt(this.rand, MAX_SKY_LEVEL, MIN_SKY_LEVEL);
    this.clouds.push({ x: WORLD_W, y, gap, remove: false });
  }
}
