import type { SkillId } from '../../../shared/sim/boxes';
import { BOX_Y, LABEL_STEPS, TREX_H } from '../../../shared/sim/constants';
import { pendingBox, skillRemaining } from '../../../shared/sim/world';
import type { StepEvents, World } from '../../../shared/sim/world';
import { drawText } from '../../ui/font';
import { BOX, HEART, PUFF, SPARK, SWEAT } from '../bitmaps';
import { INK, PAPER, SOFT } from '../colors';
import { fillCells, fillCellsWithHalo, fillWorldRect } from './context';
import type { DrawContext } from './context';

/** What a box says when it is picked up. */
export const SKILL_LABELS: Readonly<Record<SkillId, string>> = {
  doubleJump: 'DOUBLE JUMP!',
  heart: '+1 HEART!',
  ghost: 'GHOST!',
  speed: 'SPEED!',
};

const CELL = 1.5;
const LABEL = { x: 4, y: 26 };
const SPARK_STEPS = 21;
const PUFF_STEPS = 15;
const RISE_STEPS = 72;
const RISE_PX = 30;
const SWEAT_STEPS = 55;
const SWEAT_FROM = { x: 17, y: -5 };
const SWEAT_DROP = 11; // from y -5 to y 6 over the dino
const DUCK_SHIFT = { x: 15, y: 18 };
const WIND = [{ y: 6, len: 12 }, { y: 18, len: 8 }, { y: 29, len: 15 }];
const WIND_STEPS = 12; // a line goes from 7 to 47 px behind the dino in 12 steps
const WIND_LAG = 4; // and each line is 4 steps behind the one before
const WIND_FROM = 7;
const WIND_TO = 47;
const BOB_PX = 2;
const BOB_STEPS = 120;

interface Shown {
  left: number;
  x: number;
  y: number;
}

// One step less to show, or null once it is over.
const tick = <T extends { left: number }>(e: T | null): T | null =>
  e && e.left > 1 ? { ...e, left: e.left - 1 } : null;

/**
 * The little things around the dino: the skill label, the spark of a hit, the puff of an air jump, a heart rising,
 * sweat and wind.
 */
export class Effects {
  private label: { text: string; left: number } | null = null;
  private spark: Shown | null = null;
  private puff: Shown | null = null;
  private rise: Shown | null = null;
  private sweat = false;
  private wind = false;

  reset(): void {
    this.label = null;
    this.spark = null;
    this.puff = null;
    this.rise = null;
    this.sweat = false;
    this.wind = false;
  }

  /** One step after the world's: what was on show runs down, and what happened on the step starts. */
  step(w: World, ev: StepEvents): void {
    this.label = tick(this.label);
    this.spark = tick(this.spark);
    this.puff = tick(this.puff);
    this.rise = tick(this.rise);
    if (ev.hit) this.spark = { left: SPARK_STEPS, x: ev.hit.x, y: ev.hit.y };
    if (ev.airJumped) this.puff = { left: PUFF_STEPS, x: w.trex.x + 8, y: w.trex.y + TREX_H - 4 };
    if (ev.picked) {
      this.label = { text: SKILL_LABELS[ev.picked.skill], left: LABEL_STEPS };
      if (ev.picked.skill === 'heart') this.rise = { left: RISE_STEPS, x: w.trex.x + 22, y: w.trex.y - 9 };
    }
    this.sweat = w.hp === 1 && w.phase === 'running';
    this.wind = skillRemaining(w, 'speed') > 0;
  }

  /** The hearts the HUD shows: one less while a new heart is still rising to it. */
  hpShown(w: World): number {
    return this.rise ? Math.max(0, w.hp - 1) : w.hp;
  }

  /** The effects on show, by name. */
  active(): string[] {
    const on: string[] = [];
    if (this.label) on.push('label');
    if (this.spark) on.push('spark');
    if (this.puff) on.push('puff');
    if (this.rise) on.push('heart');
    if (this.sweat) on.push('sweat');
    if (this.wind) on.push('wind');
    return on;
  }

  draw(dc: DrawContext, w: World): void {
    const t = w.trex;
    if (this.wind) {
      WIND.forEach((line, i) => {
        const phase = (w.step + i * WIND_LAG) % WIND_STEPS;
        const behind = WIND_FROM + Math.round(((WIND_TO - WIND_FROM) * phase) / (WIND_STEPS - 1));
        fillWorldRect(dc, t.x - behind - line.len, t.y + line.y, line.len, 1, SOFT);
      });
    }
    if (this.sweat) {
      const drop = Math.round((SWEAT_DROP * (w.step % SWEAT_STEPS)) / (SWEAT_STEPS - 1));
      const shift = t.ducking ? DUCK_SHIFT : { x: 0, y: 0 };
      fillCells(dc, SWEAT, t.x + SWEAT_FROM.x + shift.x, t.y + SWEAT_FROM.y + drop + shift.y, SOFT);
    }
    if (this.puff) fillCells(dc, PUFF, this.puff.x, this.puff.y, SOFT, CELL);
    if (this.spark) {
      const half = (SPARK.length * CELL) / 2;
      // outlined in paper: the spark is ink, and it lands on the dino, which is ink too
      fillCellsWithHalo(dc, SPARK, Math.round(this.spark.x - half), Math.round(this.spark.y - half), INK, PAPER, CELL);
    }
    if (this.rise) {
      const p = (RISE_STEPS - this.rise.left) / RISE_STEPS;
      const y = this.rise.y - Math.round(RISE_PX * p);
      dc.ctx.save();
      dc.ctx.globalAlpha = 1 - p;
      fillCells(dc, HEART, this.rise.x, y, INK, CELL);
      drawText(dc, '+1', this.rise.x + 9 * CELL, y, INK);
      dc.ctx.restore();
    }
    // outlined: a jumping dino goes right through it
    if (this.label) drawText(dc, this.label.text, LABEL.x, LABEL.y, INK, PAPER);
  }
}

/** The box coming next, bobbing 2 px up and down once every 2 s. */
export function drawBox(dc: DrawContext, w: World): void {
  const box = pendingBox(w);
  if (!box) return;
  const bob = Math.round(BOB_PX * Math.sin((2 * Math.PI * w.step) / BOB_STEPS));
  fillCells(dc, BOX, box.x, BOX_Y + bob, INK);
}
