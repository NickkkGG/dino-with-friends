import { INTRO_STEPS, TREX_W, WORLD_H, WORLD_W } from '../../../shared/sim/constants';
import { visibleObstacles } from '../../../shared/sim/world';
import type { StepEvents, World } from '../../../shared/sim/world';
import { PAPER } from '../colors';
import { Clouds } from './clouds';
import { fillWorldRect } from './context';
import type { DrawContext } from './context';
import { Effects, drawBox } from './effects';
import { GameOverView } from './game-over';
import { drawHorizonLine } from './horizon-line';
import { HUD_CELL, drawHearts, drawSkills, skillsCell } from './hud';
import { MeterView } from './meter';
import { NightSky } from './night-sky';
import { drawObstacles } from './obstacles';
import { TrexView } from './trex-view';

export interface SceneOptions {
  /** World pixels of sky above the 150 px world. The DrawContext's oy is the same. */
  sky: number;
  /** Whether the hearts and the skills are drawn in the world ('inside') or left to a HUD strip ('none'). */
  hud: 'inside' | 'none';
  /** Whether the world shows the score and the HI in the top right corner, as the original does. */
  showScore: boolean;
  showHi: boolean;
  /** Whether the track opens from the dino's width over the intro, as the original's does. */
  introClip: boolean;
  /** Clouds drift 1 px every 3 steps whatever the world does, for a screen where nobody plays. */
  idleClouds: boolean;
}

// The HUD in the world: the corner of the hearts, and the top of the score, where the original draws it.
const HUD = { x: 8, y: 7 };
const SCORE_Y = 10;
// The HUD strip over a portrait world, in its own pixels: hearts, score and HI on the first row, the skills below.
const STRIP = { h: 34, row1: 4, row2: 19 };
const IDLE_CLOUD_STEPS = 3;

/** CSS cubic-bezier(0, 0, 0.58, 1), the ease-out of the original's intro: a progress from 0 to 1, eased. */
export function easeOut(x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  // The curve's x and y at parameter t. x rises with t, so t for a given x is found by halving.
  const bx = (t: number) => 3 * (1 - t) * t * t * 0.58 + t * t * t;
  const by = (t: number) => 3 * (1 - t) * t * t + t * t * t;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (bx(mid) < x) lo = mid;
    else hi = mid;
  }
  return by((lo + hi) / 2);
}

/** How much of the track shows: the dino's width while waiting, opening over the intro, then all 600 px. */
export function revealWidth(w: World): number {
  if (w.phase === 'waiting') return TREX_W;
  if (w.phase === 'intro') return TREX_W + (WORLD_W - TREX_W) * easeOut(w.introStep / INTRO_STEPS);
  return WORLD_W;
}

/** Everything drawn for one world: the original's scene, with the hearts, skills and effects on top. */
export class Scene {
  private readonly o: SceneOptions;
  private readonly clouds: Clouds;
  private readonly night: NightSky;
  private readonly trex: TrexView;
  private readonly meter = new MeterView();
  private readonly over = new GameOverView();
  private readonly effects = new Effects();
  private idleStep = 0;

  constructor(o: SceneOptions, rand: () => number = Math.random) {
    this.o = o;
    this.clouds = new Clouds(rand);
    this.night = new NightSky(rand);
    this.trex = new TrexView(rand);
  }

  reset(): void {
    this.clouds.reset();
    this.night.reset();
    this.trex.reset();
    this.meter.reset();
    this.over.reset();
    this.effects.reset();
    this.idleStep = 0;
  }

  /** One step, after the world's. Keep calling it once the world is over, with NO_EVENTS, so GAME OVER plays. */
  step(w: World, ev: StepEvents): void {
    const running = w.phase === 'running';
    let px = running ? 1 : 0;
    if (this.o.idleClouds) px = this.idleStep++ % IDLE_CLOUD_STEPS === 0 ? 1 : 0;
    this.clouds.step(px);
    if (running) {
      this.night.step(w.night > 0);
      this.meter.step(w.score, ev.achievement);
    }
    this.trex.step(w);
    this.effects.step(w, ev);
    if (w.phase === 'dead') this.over.step();
  }

  /** Draws the world (and the sky above it) on a canvas of (150 + sky) world pixels, with dc.oy = sky. */
  draw(dc: DrawContext, w: World, hi: number): void {
    const { ctx, k } = dc;
    fillWorldRect(dc, 0, -this.o.sky, WORLD_W, WORLD_H + this.o.sky, PAPER);
    const clip = this.o.introClip && (w.phase === 'waiting' || w.phase === 'intro');
    if (clip) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, Math.round(revealWidth(w) * k), Math.round((dc.oy + WORLD_H) * k));
      ctx.clip();
    }
    this.night.draw(dc);
    this.clouds.draw(dc);
    drawHorizonLine(dc, w.seed, w.scroll);
    drawBox(dc, w);
    drawObstacles(dc, visibleObstacles(w), w.step);
    this.trex.draw(dc, w);
    this.effects.draw(dc, w);
    if (clip) ctx.restore();
    if (w.phase !== 'waiting') {
      if (this.o.hud === 'inside') {
        const hp = this.effects.hpShown(w);
        drawHearts(dc, HUD.x, HUD.y, hp, w.step);
        drawSkills(dc, HUD.x + skillsCell(hp) * HUD_CELL, HUD.y, w);
      }
      if (this.o.showScore || this.o.showHi) {
        this.meter.draw(dc, { width: WORLD_W, y: SCORE_Y, hi: this.o.showHi ? hi : 0, showScore: this.o.showScore });
      }
    }
    if (w.phase === 'dead') this.over.draw(dc);
  }

  /** The HUD strip over a portrait world, `width` of its own pixels wide and 34 high, with dc.oy = 0. */
  drawHudStrip(dc: DrawContext, w: World, hi: number, width: number): void {
    fillWorldRect(dc, 0, 0, width, STRIP.h, PAPER);
    if (w.phase === 'waiting') return;
    const hp = this.effects.hpShown(w);
    drawHearts(dc, HUD.x, STRIP.row1, hp, w.step);
    this.meter.draw(dc, { width, y: STRIP.row1, hi, showScore: true });
    drawSkills(dc, HUD.x, STRIP.row2, w);
  }
}
