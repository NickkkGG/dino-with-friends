import { botInput, earliestSafe } from '../../shared/sim/autopilot';
import { CLEAR_STEPS, SPEED_START, TREX_X, WORLD_H, WORLD_W } from '../../shared/sim/constants';
import { constantTimeline } from '../../shared/sim/timeline';
import { endJump, startJump, updateJump } from '../../shared/sim/trex';
import { NO_EVENTS, createWorld, stepWorld } from '../../shared/sim/world';
import type { StepEvents, World } from '../../shared/sim/world';
import { PAPER } from './colors';
import { reportGame, worldDebug } from './debug';
import { fillWorldRect } from './draw/context';
import type { DrawContext } from './draw/context';
import { MeterView } from './draw/meter';
import { Scene } from './draw/scene';
import { FixedStepLoop } from './loop';
import { chooseRenderParams, sizeCanvas } from './render-params';
import type { RenderParams } from './render-params';
import { sheetFor } from './sprites';
import type { SpriteSet } from './sprites';

/** The title's demo runs at the original's starting speed, for good. */
export const DEMO_SPEED = 6;

// The HI over a portrait demo: its own small canvas, at 1.25 times the track's scale so it reads on a phone.
const HI_W = 100;
const HI_H = 13;
const HI_SCALE = 1.25;

// A CSS length on whole device pixels.
const snap = (v: number, dpr: number) => Math.round(v * dpr) / dpr;

function randomSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0]!;
}

/** A round for the title: constant speed, nothing can hurt the dino, no boxes, no night, and already past the first 3 s. */
export function demoWorld(seed: number): World {
  const w = createWorld({
    seed, playerId: 'demo', timeline: constantTimeline(DEMO_SPEED), invincible: true, boxes: false, nightMode: false,
  });
  // The original keeps its first 3 s free of obstacles; the demo starts after them, so the dino has something to jump.
  while (w.step < CLEAR_STEPS) demoStep(w);
  return w;
}

/** One step of the demo, played by the bot. */
export function demoStep(w: World): StepEvents {
  return stepWorld(w, botInput(w, earliestSafe));
}

/** The strip under the other screens: a dino waiting at x 24, as on the original's waiting screen, with nothing coming. */
export function idleWorld(): World {
  const w = createWorld({ seed: 1, playerId: 'idle', phase: 'waiting', boxes: false, nightMode: false });
  w.trex.x = TREX_X;
  return w;
}

/** The winner's dino on the results screen hops every this many steps: 1.25 s. */
export const HOP_EVERY_STEPS = 75;

/**
 * Step `n` of the idle strip's dino, which only moves to hop: with `hop` it jumps every HOP_EVERY_STEPS steps and lets
 * go at once, as a quick tap does, so each jump ends as soon as it is high enough to count. The world itself is never
 * stepped, so it stays waiting and no round begins.
 */
export function idleStep(w: World, n: number, hop: boolean): void {
  const t = w.trex;
  if (hop && n % HOP_EVERY_STEPS === 0) startJump(t, SPEED_START);
  updateJump(t);
  if (hop) endJump(t);
}

interface Canvas2D {
  dc: DrawContext;
  p: RenderParams;
  cssWidth: number;
}

// Sizes a canvas for `logicalW` × `logicalH` world pixels shown `cssW` CSS pixels wide.
function sizeFor(canvas: HTMLCanvasElement, cssW: number, dpr: number, logicalW: number, logicalH: number, sprites: SpriteSet, oy: number): Canvas2D | null {
  const w = snap(cssW, dpr);
  const p = chooseRenderParams(w, dpr, logicalW);
  sizeCanvas(canvas, w, snap((w * logicalH) / logicalW, dpr), logicalW, logicalH, p);
  const ctx = canvas.getContext('2d');
  return ctx && { dc: { ctx, k: p.k, sheet: sheetFor(sprites, p), oy }, p, cssWidth: w };
}

export interface DemoRunOptions {
  canvas: HTMLCanvasElement;
  /** Where the HI goes on a portrait screen, over the right end of the track. */
  hiCanvas: HTMLCanvasElement | null;
  sprites: SpriteSet;
  hi: number;
}

/** The title's demo: a dino running and jumping by itself, the HI in the corner (in the world, or over it in portrait). */
export class DemoRun {
  private readonly o: DemoRunOptions;
  private readonly world = demoWorld(randomSeed());
  private readonly scene = new Scene({ sky: 0, hud: 'none', showScore: false, showHi: true, introClip: false, idleClouds: false });
  private readonly hiMeter = new MeterView();
  private readonly loop: FixedStepLoop;
  private main: Canvas2D | null = null;
  private hiDc: DrawContext | null = null;
  private unreport: () => void = () => {};

  constructor(o: DemoRunOptions) {
    this.o = o;
    this.loop = new FixedStepLoop(() => this.scene.step(this.world, demoStep(this.world)), () => this.render());
  }

  setSize(cssWidth: number, dpr: number, portrait: boolean): void {
    this.scene.setHud('none', false, !portrait);
    this.main = sizeFor(this.o.canvas, cssWidth, dpr, WORLD_W, WORLD_H, this.o.sprites, 0);
    this.hiDc = null;
    if (portrait && this.o.hiCanvas && this.o.hi > 0) {
      const cssW = (cssWidth / WORLD_W) * HI_SCALE * HI_W;
      this.hiDc = sizeFor(this.o.hiCanvas, cssW, dpr, HI_W, HI_H, this.o.sprites, 0)?.dc ?? null;
    }
    this.render();
  }

  start(): void {
    if (import.meta.env.DEV) {
      this.unreport = reportGame(() => ({ ...worldDebug(this.world), canvas: this.canvasDebug() }));
    }
    this.loop.start();
  }

  dispose(): void {
    this.loop.stop();
    this.unreport();
  }

  private render(): void {
    if (this.main) this.scene.draw(this.main.dc, this.world, this.o.hi);
    if (this.hiDc) {
      fillWorldRect(this.hiDc, 0, 0, HI_W, HI_H, PAPER);
      this.hiMeter.draw(this.hiDc, { width: HI_W, y: 0, hi: this.o.hi, showScore: false });
    }
  }

  private canvasDebug() {
    const m = this.main;
    const c = this.o.canvas;
    return m && { width: c.width, height: c.height, cssWidth: m.cssWidth, k: m.p.k, sprite: m.p.sprite };
  }
}

/**
 * The strip under the menu screens: clouds drifting 1 px every 3 steps over the ground, and the dino waiting, blinking,
 * or on the results screen hopping.
 */
export class IdleRun {
  private readonly canvas: HTMLCanvasElement;
  private readonly sprites: SpriteSet;
  private readonly hop: boolean;
  private readonly world = idleWorld();
  private readonly scene = new Scene({ sky: 0, hud: 'none', showScore: false, showHi: false, introClip: false, idleClouds: true });
  private readonly loop: FixedStepLoop;
  private main: Canvas2D | null = null;
  private steps = 0;

  constructor(o: { canvas: HTMLCanvasElement; sprites: SpriteSet; hop?: boolean }) {
    this.canvas = o.canvas;
    this.sprites = o.sprites;
    this.hop = o.hop ?? false;
    this.loop = new FixedStepLoop(() => this.step(), () => this.render());
  }

  setSize(cssWidth: number, dpr: number): void {
    this.main = sizeFor(this.canvas, cssWidth, dpr, WORLD_W, WORLD_H, this.sprites, 0);
    this.render();
  }

  start(): void {
    this.loop.start();
  }

  dispose(): void {
    this.loop.stop();
  }

  private step(): void {
    idleStep(this.world, this.steps, this.hop);
    this.steps += 1;
    this.scene.step(this.world, NO_EVENTS);
  }

  private render(): void {
    if (this.main) this.scene.draw(this.main.dc, this.world, 0);
  }
}
