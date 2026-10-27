import { WORLD_H, WORLD_W } from '../../shared/sim/constants';
import { reportGame, worldDebug } from './debug';
import type { GameDebug } from './debug';
import type { DrawContext } from './draw/context';
import { InputController } from './input';
import { HUD_STRIP, SKY } from './layout';
import type { RaceLayout } from './layout';
import { FrameLoop } from './loop';
import { RaceRun } from './race-run';
import type { RaceSend, RaceView } from './race-run';
import { chooseRenderParams, sizeCanvas } from './render-params';
import type { RenderParams } from './render-params';
import type { Sound } from './sound';
import { sheetFor } from './sprites';
import type { SpriteSet } from './sprites';
import type { TestMode } from './test-mode';

export interface RaceGameOptions {
  canvas: HTMLCanvasElement;
  /** The HUD strip over a portrait world. Hidden on a wide screen, where the HUD is in the world. */
  hudCanvas: HTMLCanvasElement;
  /** What the touches land on. */
  surface: HTMLElement;
  sprites: SpriteSet;
  sound: Sound;
  coarse: boolean;
  testMode: TestMode;
  /** The round's seed, this player's id and when the round starts by the server's clock, from the countdown. */
  seed: number;
  you: string;
  startAt: number;
  /** The best score so far. */
  hi: number;
  /** The server's clock now. */
  clock(): number;
  send: RaceSend;
  /** Called when the view changes: the phase, the countdown, the night or the touch hints. */
  onView(v: RaceView): void;
}

// A CSS length on whole device pixels, so the canvases keep sharp edges.
const snap = (v: number, dpr: number) => Math.round(v * dpr) / dpr;

const sameView = (a: RaceView, b: RaceView) =>
  a.phase === b.phase && a.count === b.count && a.inverted === b.inverted && a.hints === b.hints;

/**
 * A race on the page: a RaceRun fed by the keyboard and the touch screen, brought up to the server's clock once a
 * display frame, and drawn on the game canvas (and the HUD strip in portrait). Nothing pauses it, since the round goes on
 * for everyone: a page that was hidden catches up when it is back.
 */
export class RaceGame {
  private readonly o: RaceGameOptions;
  private readonly run: RaceRun;
  private readonly input: InputController;
  private readonly loop: FrameLoop;
  private world: { dc: DrawContext; p: RenderParams; cssWidth: number } | null = null;
  private hud: { dc: DrawContext; width: number } | null = null;
  private view: RaceView | null = null;
  private unreport: () => void = () => {};

  constructor(o: RaceGameOptions) {
    this.o = o;
    this.run = new RaceRun({
      seed: o.seed, you: o.you, startAt: o.startAt, sound: o.sound, testMode: o.testMode, coarse: o.coarse, hi: o.hi,
      send: o.send,
    });
    this.input = new InputController(o.surface);
    this.loop = new FrameLoop(() => this.frame());
  }

  /** Sizes the canvases for a layout and draws at once. The round itself goes on untouched. */
  setLayout(l: RaceLayout, dpr: number): void {
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
    if (import.meta.env.DEV) this.unreport = reportGame(() => this.debug());
    this.emitView();
    this.loop.start();
  }

  dispose(): void {
    this.loop.stop();
    this.input.dispose();
    this.unreport();
  }

  /** The lobby has counted this player out. */
  serverDead(): void {
    this.run.serverDead();
    this.emitView();
  }

  /** The round is over for everyone. */
  end(): void {
    this.run.end();
    this.emitView();
  }

  private frame(): void {
    this.run.frame(this.o.clock(), this.input.state);
    this.render();
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

  private debug(): GameDebug {
    const { canvas } = this.o;
    const p = this.world?.p;
    const { phase, count } = this.run.view();
    return {
      ...worldDebug(this.run.world),
      canvas: p ? { width: canvas.width, height: canvas.height, cssWidth: this.world!.cssWidth, k: p.k, sprite: p.sprite } : null,
      race: { phase, count, startAt: this.o.startAt, serverNow: this.o.clock() },
    };
  }
}
