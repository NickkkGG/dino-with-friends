import { botInput, earliestSafe } from '../../shared/sim/autopilot';
import { CLEAR_STEPS, STEP_MS } from '../../shared/sim/constants';
import { NO_EVENTS, NO_INPUT, createWorld, stepWorld } from '../../shared/sim/world';
import type { Phase, StepInput, World } from '../../shared/sim/world';
import { Scene } from './draw/scene';
import type { InputFrame } from './input-state';
import { SKY } from './layout';
import { HI_KEY, canRestart, nextHi } from './solo-rules';
import type { SoundName } from './sound';
import { writeNumber } from './storage';
import type { TestMode } from './test-mode';

/** What the solo screen around the canvas follows: the phase, the night, the touch hints, and when the dino died. */
export interface SoloView {
  phase: Phase;
  inverted: boolean;
  hints: boolean;
  /** When the dino died, in milliseconds of game time since the screen opened; 0 while it is alive. */
  deadMs: number;
}

export interface SoloRunOptions {
  sound: { play(name: SoundName): void };
  testMode: TestMode;
  /** A touch screen: the touch areas are shown at the start of each round. */
  coarse: boolean;
  /** The best score so far. */
  hi: number;
  /** A seed for each round the test mode does not fix. Default: a random one. */
  newSeed?: () => number;
  /** The scene's own chance: clouds, stars and blinking. Default Math.random. */
  rand?: () => number;
}

const JUMP: StepInput = { ...NO_INPUT, jumpPressed: true };

function randomSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0]!;
}

/**
 * The solo game without the page: one round after another of the world and its scene, the sounds, the best score and
 * the restart rules, one 60 Hz step at a time.
 */
export class SoloRun {
  readonly scene: Scene;
  private readonly o: SoloRunOptions;
  private w: World;
  private best: number;
  private steps = 0;
  private diedAt: number | null = null;

  constructor(o: SoloRunOptions) {
    this.o = o;
    this.best = o.hi;
    this.scene = new Scene(
      { sky: SKY, hud: 'inside', showScore: true, showHi: true, introClip: true, idleClouds: false },
      o.rand ?? Math.random,
    );
    this.w = this.newWorld('waiting');
  }

  get world(): World {
    return this.w;
  }

  get hi(): number {
    return this.best;
  }

  /** A wide screen has the HUD in the world, as the original; a portrait one has it in a strip above. */
  setWide(wide: boolean): void {
    this.scene.setHud(wide ? 'inside' : 'none', wide, wide);
  }

  /** On a touch screen, the first tap anywhere starts the round; after that the left half ducks. */
  touchMode(): 'split' | 'any' {
    return this.w.phase === 'waiting' ? 'any' : 'split';
  }

  step(f: InputFrame): void {
    this.steps += 1;
    const w = this.w;
    if (w.phase === 'dead') {
      this.scene.step(w, NO_EVENTS); // GAME OVER and its restart button keep playing
      if (this.restartAsked(f.restart)) this.restart();
      return;
    }
    const ev = stepWorld(w, this.input(f));
    const { sound } = this.o;
    if (ev.jumped || ev.airJumped) sound.play('press');
    if (ev.hit || ev.died) sound.play('hit');
    if (ev.achievement) sound.play('reached');
    if (ev.picked) sound.play('pickup');
    this.scene.step(w, ev);
    if (ev.died) {
      this.diedAt = this.steps;
      this.best = nextHi(this.best, w.score);
      writeNumber(HI_KEY, this.best);
    }
  }

  view(): SoloView {
    const w = this.w;
    const start = w.phase === 'intro' || (w.phase === 'running' && w.step < CLEAR_STEPS);
    return {
      phase: w.phase,
      inverted: w.night > 0,
      hints: this.o.coarse && start,
      deadMs: this.diedAt === null ? 0 : this.diedAt * STEP_MS,
    };
  }

  private input(f: InputFrame): StepInput {
    if (!this.o.testMode.autopilot) return f.step;
    return this.w.phase === 'waiting' ? JUMP : botInput(this.w, earliestSafe);
  }

  private restartAsked(r: InputFrame['restart']): boolean {
    const ms = (this.steps - (this.diedAt ?? this.steps)) * STEP_MS;
    return (r.enter && canRestart('enter', ms)) || (r.jumpKey && canRestart('jumpKey', ms))
      || (r.pointer && canRestart('pointer', ms));
  }

  // A new round runs at once, with no intro, on a new seed.
  private restart(): void {
    this.w = this.newWorld('running');
    this.diedAt = null;
    this.scene.reset();
    this.o.sound.play('press');
  }

  private newWorld(phase: 'waiting' | 'running'): World {
    const t = this.o.testMode;
    const seed = t.seed ?? (this.o.newSeed ?? randomSeed)();
    return createWorld({ seed, playerId: 'solo', phase, invincible: t.invincible, forcedSkill: t.box });
  }
}
