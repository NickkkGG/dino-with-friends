// Copyright 2024 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the third_party/chromium/LICENSE file.
// Modified for DINO with FRIENDS: NightMode stepped and drawn apart, on a given sheet, with its random numbers from an injected source.

import { WORLD_H } from '../../../shared/sim/constants';
import { randInt } from '../../../shared/sim/rng';
import { blit } from './context';
import type { DrawContext } from './context';

const PHASES = [140, 120, 100, 60, 40, 20, 0];
const FADE_SPEED = 0.035;
const HEIGHT = 40;
const MOON_SPEED = 0.25;
const NUM_STARS = 2;
const STAR_SIZE = 9;
const STAR_SPEED = 0.3;
const STAR_MAX_Y = 70;
const WIDTH = 20;
const MOON_Y = 30;
// The original builds its night mode with the canvas height where the width belongs, so the moon and the stars stay in
// the left 150 px of the sky. Kept as it is.
const SKY_WIDTH = WORLD_H;

interface Star {
  x: number;
  y: number;
}

/** The moon and two stars, fading in at night. Decoration, so they may differ between screens. */
export class NightSky {
  private moonX = 0;
  private phase = 0;
  private fade = 0;
  private stars: Star[] = [];
  private drawStars = false;
  private starsShown = false;
  private readonly rand: () => number;

  constructor(rand: () => number = Math.random) {
    this.rand = rand;
    this.placeStars();
  }

  /** How strongly the moon and stars show, 0 by day. */
  get opacity(): number {
    return this.fade;
  }

  reset(): void {
    this.phase = 0;
    this.fade = 0;
    this.step(false);
  }

  /** One step: a new night moves the moon on a phase, then the sky fades in (night) or out (day), and drifts. */
  step(active: boolean): void {
    if (active && this.fade === 0) {
      this.phase++;
      if (this.phase >= PHASES.length) this.phase = 0;
    }
    if (active && (this.fade < 1 || this.fade === 0)) {
      this.fade += FADE_SPEED;
    } else if (this.fade > 0) {
      this.fade -= FADE_SPEED;
    }
    if (this.fade > 0) {
      this.moonX = this.updateXpos(this.moonX, MOON_SPEED);
      if (this.drawStars) for (const star of this.stars) star.x = this.updateXpos(star.x, STAR_SPEED);
      this.starsShown = this.drawStars;
    } else {
      this.fade = 0;
      this.placeStars();
    }
    this.drawStars = true;
  }

  draw(dc: DrawContext): void {
    if (this.fade <= 0) return;
    const { ctx } = dc;
    const { pos, scale: s } = dc.sheet;
    const moonWidth = this.phase === 3 ? WIDTH * 2 : WIDTH;
    ctx.save();
    ctx.globalAlpha = this.fade;
    if (this.starsShown) {
      this.stars.forEach((star, i) => {
        const sy = pos.star.y + STAR_SIZE * s * i;
        blit(dc, pos.star.x, sy, STAR_SIZE * s, STAR_SIZE * s, Math.round(star.x), star.y, STAR_SIZE, STAR_SIZE);
      });
    }
    const sx = pos.moon.x + PHASES[this.phase]! * s;
    blit(dc, sx, pos.moon.y, moonWidth * s, HEIGHT * s, Math.round(this.moonX), MOON_Y, moonWidth, HEIGHT);
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  private updateXpos(x: number, speed: number): number {
    return x < -WIDTH ? SKY_WIDTH : x - speed;
  }

  private placeStars(): void {
    const segment = Math.round(SKY_WIDTH / NUM_STARS);
    this.stars = [];
    for (let i = 0; i < NUM_STARS; i++) {
      const x = randInt(this.rand, segment * i, segment * (i + 1));
      this.stars.push({ x, y: randInt(this.rand, 0, STAR_MAX_Y) });
    }
  }
}
