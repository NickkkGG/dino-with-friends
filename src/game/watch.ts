import type { RunState } from '../../shared/lobby/protocol';
import { GameCanvases } from './canvases';
import { reportGame, worldDebug } from './debug';
import type { GameDebug } from './debug';
import type { SoloLayout } from './layout';
import { FrameLoop } from './loop';
import type { SpriteSet } from './sprites';
import { WatchRun } from './watch-run';

export interface WatchGameOptions {
  canvas: HTMLCanvasElement;
  /** The HUD strip over a portrait world. Hidden on a wide screen, where the HUD is in the world. */
  hudCanvas: HTMLCanvasElement;
  sprites: SpriteSet;
  /** The round's seed, the runner watched and when the round started by the server's clock. */
  seed: number;
  target: string;
  startAt: number;
  /** The watcher's own best score. */
  hi: number;
  /** The server's clock now. */
  clock(): number;
  /** Where relayed states come from; gives back the way to stop. */
  relays(fn: (id: string, s: RunState) => void): () => void;
  /** Called when the night on the watched screen comes or goes. */
  onView(v: { inverted: boolean }): void;
}

/**
 * The screen of the runner being watched, on the page: a WatchRun fed with that runner's relayed states, brought up to
 * the server's clock once a display frame, and drawn on the game canvas (and the HUD strip in portrait).
 */
export class WatchGame {
  private readonly o: WatchGameOptions;
  private readonly run: WatchRun;
  private readonly canvases: GameCanvases;
  private readonly loop: FrameLoop;
  private readonly stopRelays: () => void;
  private inverted: boolean | null = null;
  private unreport: () => void = () => {};

  constructor(o: WatchGameOptions) {
    this.o = o;
    this.run = new WatchRun({ seed: o.seed, target: o.target, startAt: o.startAt });
    this.canvases = new GameCanvases({ canvas: o.canvas, hudCanvas: o.hudCanvas, sprites: o.sprites });
    this.loop = new FrameLoop(() => this.frame());
    this.stopRelays = o.relays((id, s) => {
      if (id === o.target) this.run.add(s);
    });
  }

  /** Sizes the canvases for a layout and draws at once. */
  setLayout(l: SoloLayout, dpr: number): void {
    this.run.setWide(l.mode === 'wide');
    this.canvases.setLayout(l, dpr);
    this.render();
  }

  start(): void {
    if (import.meta.env.DEV) this.unreport = reportGame(() => this.debug());
    this.emitView();
    this.loop.start();
  }

  /** The lobby has the runner out, with no state saying so: GAME OVER on the picture there is. */
  out(): void {
    this.run.out();
  }

  dispose(): void {
    this.loop.stop();
    this.stopRelays();
    this.unreport();
  }

  private frame(): void {
    this.run.frame(this.o.clock());
    this.render();
    this.emitView();
  }

  private render(): void {
    this.canvases.draw(this.run.scene, this.run.world, this.o.hi);
  }

  private emitView(): void {
    const { inverted } = this.run;
    if (inverted === this.inverted) return;
    this.inverted = inverted;
    this.o.onView({ inverted });
  }

  private debug(): GameDebug {
    const w = this.run.world;
    return { ...worldDebug(w), canvas: this.canvases.debug(), watch: { target: this.o.target, scroll: w.scroll } };
  }
}
