import { WORLD_H, WORLD_W } from '../../shared/sim/constants';
import { resumeAfterPause } from '../../shared/sim/world';
import { reportGame, worldDebug } from './debug';
import type { GameDebug } from './debug';
import type { DrawContext } from './draw/context';
import { InputController } from './input';
import { HUD_STRIP, SKY } from './layout';
import type { SoloLayout } from './layout';
import { FixedStepLoop } from './loop';
import { chooseRenderParams, sizeCanvas } from './render-params';
import type { RenderParams } from './render-params';
import { HI_KEY } from './solo-rules';
import { SoloRun } from './solo-run';
import type { SoloView } from './solo-run';
import type { Sound } from './sound';
import { sheetFor } from './sprites';
import type { SpriteSet } from './sprites';
import { readNumber } from './storage';
import type { TestMode } from './test-mode';

export type { SoloView } from './solo-run';

export interface SoloGameOptions {
  canvas: HTMLCanvasElement;
  /** The HUD strip over a portrait world. Hidden on a wide screen, where the HUD is in the world. */
  hudCanvas: HTMLCanvasElement;
  /** What the touches and clicks land on. */
  surface: HTMLElement;
  sprites: SpriteSet;
  sound: Sound;
  coarse: boolean;
  testMode: TestMode;
  /** Called when the view changes: the phase, the night, the touch hints or the moment of death. */
  onView(v: SoloView): void;
}

// A CSS length on whole device pixels, so the canvases keep sharp edges.
const snap = (v: number, dpr: number) => Math.round(v * dpr) / dpr;

const sameView = (a: SoloView, b: SoloView) =>
  a.phase === b.phase && a.inverted === b.inverted && a.hints === b.hints && a.deadMs === b.deadMs;

/**
 * The solo game on the page: a SoloRun fed by the keyboard and the touch screen, stepped at 60 Hz, drawn on the game
 * canvas (and the HUD strip in portrait). A round in play stops while the page is hidden or loses focus, and goes on
 * when it comes back.
 */
export class SoloGame {
  private readonly o: SoloGameOptions;
  private readonly run: SoloRun;
  private readonly input: InputController;
  private readonly loop: FixedStepLoop;
  private world: { dc: DrawContext; p: RenderParams; cssWidth: number } | null = null;
  private hud: { dc: DrawContext; width: number } | null = null;
  private view: SoloView | null = null;
  private paused = false;
  private unreport: () => void = () => {};

  constructor(o: SoloGameOptions) {
    this.o = o;
    this.run = new SoloRun({ sound: o.sound, testMode: o.testMode, coarse: o.coarse, hi: readNumber(HI_KEY, 0) });
    this.input = new InputController(o.surface);
    this.input.state.setTouchMode(this.run.touchMode());
    this.loop = new FixedStepLoop(() => this.step(), () => this.render(), { timeScale: o.testMode.timeScale });
  }

  /** Sizes the canvases for a layout and draws at once. The round itself goes on untouched. */
  setLayout(l: SoloLayout, dpr: number): void {
    this.run.setWide(l.mode === 'wide');
    const cssWidth = snap(l.canvas.w, dpr);
    const p = chooseRenderParams(cssWidth, dpr);
    sizeCanvas(this.o.canvas, cssWidth, snap(l.canvas.h, dpr), WORLD_W, WORLD_H + SKY, p);
    const ctx = this.o.canvas.getContext('2d');
    this.world = ctx && { dc: { ctx, k: p.k, sheet: sheetFor(this.o.sprites, p), oy: SKY }, p, cssWidth };
    this.hud = null;
    if (l.hud) {
      const width = Math.round(l.hud.w / l.hudScale);
      const cssW = snap(l.hud.w, dpr);
      const hp = chooseRenderParams(cssW, dpr, width);
      sizeCanvas(this.o.hudCanvas, cssW, snap(l.hud.h, dpr), width, HUD_STRIP.height, hp);
      const hctx = this.o.hudCanvas.getContext('2d');
      this.hud = hctx && { dc: { ctx: hctx, k: hp.k, sheet: sheetFor(this.o.sprites, hp), oy: 0 }, width };
    }
    this.render();
  }

  start(): void {
    window.addEventListener('blur', this.onBlur);
    window.addEventListener('focus', this.onFocus);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    if (import.meta.env.DEV) this.unreport = reportGame(() => this.debug());
    this.emitView();
    this.loop.start();
  }

  dispose(): void {
    this.loop.stop();
    this.input.dispose();
    window.removeEventListener('blur', this.onBlur);
    window.removeEventListener('focus', this.onFocus);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.unreport();
  }

  private step(): void {
    this.run.step(this.input.state.take());
    this.input.state.setTouchMode(this.run.touchMode());
    this.emitView();
  }

  private render(): void {
    const w = this.run.world;
    if (this.world) this.run.scene.draw(this.world.dc, w, this.run.hi);
    if (this.hud) this.run.scene.drawHudStrip(this.hud.dc, w, this.run.hi, this.hud.width);
  }

  private emitView(): void {
    const v = this.run.view();
    if (this.view && sameView(this.view, v)) return;
    this.view = v;
    this.o.onView(v);
  }

  // Only a round in play stops; the waiting dino and GAME OVER carry on.
  private readonly onBlur = (): void => {
    const { phase } = this.run.world;
    if (this.paused || (phase !== 'intro' && phase !== 'running')) return;
    this.paused = true;
    this.loop.stop();
    this.input.state.clear();
  };

  // Back on the ground, and the clock starts from now, so the time away does not come out as a burst of steps.
  private readonly onFocus = (): void => {
    if (!this.paused || document.visibilityState === 'hidden') return;
    this.paused = false;
    resumeAfterPause(this.run.world);
    this.loop.resetClock();
    this.loop.start();
  };

  private readonly onVisibilityChange = (): void => {
    if (document.visibilityState === 'hidden') this.onBlur();
    else this.onFocus();
  };

  private debug(): GameDebug {
    const { canvas } = this.o;
    const p = this.world?.p;
    return {
      ...worldDebug(this.run.world),
      canvas: p ? { width: canvas.width, height: canvas.height, cssWidth: this.world!.cssWidth, k: p.k, sprite: p.sprite } : null,
    };
  }
}
