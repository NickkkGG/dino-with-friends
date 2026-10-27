import { WORLD_H, WORLD_W } from '../../shared/sim/constants';
import type { World } from '../../shared/sim/world';
import type { GameDebug } from './debug';
import type { DrawContext } from './draw/context';
import type { Scene } from './draw/scene';
import { HUD_STRIP, SKY } from './layout';
import type { SoloLayout } from './layout';
import { chooseRenderParams, sizeCanvas } from './render-params';
import type { RenderParams } from './render-params';
import { sheetFor } from './sprites';
import type { SpriteSet } from './sprites';

export interface GameCanvasesOptions {
  canvas: HTMLCanvasElement;
  /** The HUD strip over a portrait world. Hidden on a wide screen, where the HUD is in the world. */
  hudCanvas: HTMLCanvasElement;
  sprites: SpriteSet;
}

// A CSS length on whole device pixels, so the canvases keep sharp edges.
const snap = (v: number, dpr: number) => Math.round(v * dpr) / dpr;

/** The game canvas and, over a portrait world, the HUD strip: sized for a layout, and drawn from a scene. */
export class GameCanvases {
  private readonly o: GameCanvasesOptions;
  private world: { dc: DrawContext; p: RenderParams; cssWidth: number } | null = null;
  private hud: { dc: DrawContext; width: number } | null = null;

  constructor(o: GameCanvasesOptions) {
    this.o = o;
  }

  /** Sizes the game canvas, and in portrait the HUD strip, on whole device pixels. */
  setLayout(l: SoloLayout, dpr: number): void {
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
  }

  /** Draws a world with its scene, and the HUD strip when there is one. */
  draw(scene: Scene, w: World, hi: number): void {
    if (this.world) scene.draw(this.world.dc, w, hi);
    if (this.hud) scene.drawHudStrip(this.hud.dc, w, hi, this.hud.width);
  }

  /** The game canvas as the tests see it; null before the first layout. */
  debug(): GameDebug['canvas'] {
    const { canvas } = this.o;
    const world = this.world;
    return world
      ? { width: canvas.width, height: canvas.height, cssWidth: world.cssWidth, k: world.p.k, sprite: world.p.sprite }
      : null;
  }
}
