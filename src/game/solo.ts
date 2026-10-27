import { resumeAfterPause } from '../../shared/sim/world';
import { GameCanvases } from './canvases';
import { reportGame, worldDebug } from './debug';
import type { GameDebug } from './debug';
import { InputController } from './input';
import type { SoloLayout } from './layout';
import { FixedStepLoop } from './loop';
import { HI_KEY } from './solo-rules';
import { SoloRun } from './solo-run';
import type { SoloView } from './solo-run';
import type { Sound } from './sound';
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
  private readonly canvases: GameCanvases;
  private view: SoloView | null = null;
  private paused = false;
  private unreport: () => void = () => {};

  constructor(o: SoloGameOptions) {
    this.o = o;
    this.run = new SoloRun({ sound: o.sound, testMode: o.testMode, coarse: o.coarse, hi: readNumber(HI_KEY, 0) });
    this.input = new InputController(o.surface);
    this.input.state.setTouchMode(this.run.touchMode());
    this.loop = new FixedStepLoop(() => this.step(), () => this.render(), { timeScale: o.testMode.timeScale });
    this.canvases = new GameCanvases({ canvas: o.canvas, hudCanvas: o.hudCanvas, sprites: o.sprites });
  }

  /** Sizes the canvases for a layout and draws at once. The round itself goes on untouched. */
  setLayout(l: SoloLayout, dpr: number): void {
    this.run.setWide(l.mode === 'wide');
    this.canvases.setLayout(l, dpr);
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
    this.canvases.draw(this.run.scene, this.run.world, this.run.hi);
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
    return { ...worldDebug(this.run.world), canvas: this.canvases.debug() };
  }
}
