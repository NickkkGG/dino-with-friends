import type { RunState } from '../../shared/lobby/protocol';
import { botInput, earliestSafe } from '../../shared/sim/autopilot';
import { CLEAR_STEPS, TREX_X } from '../../shared/sim/constants';
import { NO_EVENTS, createWorld, retire, skipSteps, stepWorld } from '../../shared/sim/world';
import type { World } from '../../shared/sim/world';
import { Scene } from './draw/scene';
import type { InputFrame } from './input-state';
import { SKY } from './layout';
import { stepsDue } from './race-clock';
import { STATE_EVERY_STEPS, runState } from './run-state';
import { HI_KEY, nextHi } from './solo-rules';
import type { SoundName } from './sound';
import { writeNumber } from './storage';
import type { TestMode } from './test-mode';

/** Where a race is for this player: counting down to the start, running, out of the round, or over for everyone. */
export type RacePhase = 'countdown' | 'running' | 'dead' | 'over';

/** What the race screen around the canvas follows: the phase, the countdown's number, the night and the touch hints. */
export interface RaceView {
  phase: RacePhase;
  /** The number on show over the last three seconds before the start; null before and after them. */
  count: 3 | 2 | 1 | null;
  inverted: boolean;
  hints: boolean;
}

/** Where the run goes: to the lobby. */
export interface RaceSend {
  state(s: RunState): void;
  dead(d: number): void;
}

export interface RaceRunOptions {
  /** The round's seed: everyone in it runs the same course. */
  seed: number;
  /** This player's id in the lobby, which picks their own skill boxes. */
  you: string;
  /** When the round starts, by the server's clock. */
  startAt: number;
  sound: { play(name: SoundName): void };
  testMode: TestMode;
  /** A touch screen: the touch areas are shown through the countdown and at the start of the round. */
  coarse: boolean;
  /** The best score so far. */
  hi: number;
  send: RaceSend;
  /** The scene's own chance: clouds, stars and blinking. Default Math.random. */
  rand?: () => number;
}

type RaceInput = { take(): InputFrame; clear(): void };

const COUNT_MS = 1000;

/** The number on show `left` ms before the start: 3, 2 and 1 over the last three seconds. */
function countFor(left: number): RaceView['count'] {
  if (left <= 0 || left > 3 * COUNT_MS) return null;
  if (left > 2 * COUNT_MS) return 3;
  return left > COUNT_MS ? 2 : 1;
}

/**
 * One player's round of a race, without the page. The round runs on the server's clock, so everyone in it is on the
 * same step at the same moment: each frame runs the steps that are due, and skips the ones too far behind, as after a
 * hidden tab. Before the start the dino waits through a countdown; after its death GAME OVER stays, with no restart.
 */
export class RaceRun {
  readonly scene: Scene;
  private readonly o: RaceRunOptions;
  private w: World;
  private best: number;
  private phase: RacePhase = 'countdown';
  private count: RaceView['count'] = null;
  /** The last floor(step / STATE_EVERY_STEPS) the run was sent at. */
  private sentAt = 0;
  // While the world stands still (the countdown, GAME OVER) the scene keeps its own 60 Hz steps, from the frame at
  // idleFrom on.
  private idleFrom: number | null = null;
  private idleSteps = 0;

  constructor(o: RaceRunOptions) {
    this.o = o;
    this.best = o.hi;
    this.scene = new Scene(
      { sky: SKY, hud: 'inside', showScore: true, showHi: true, introClip: false, idleClouds: false, restart: false },
      o.rand ?? Math.random,
    );
    // There is no intro, so the dino waits where it will run from.
    this.w = createWorld({ seed: o.seed, playerId: o.you, phase: 'waiting', boxes: false, nightMode: false });
    this.w.trex.x = TREX_X;
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

  /** One animation frame at `now`, by the server's clock. */
  frame(now: number, input: RaceInput): void {
    if (this.phase === 'countdown' && now >= this.o.startAt) this.begin();
    switch (this.phase) {
      case 'countdown':
        this.countDown(now);
        input.clear(); // nothing pressed before the start counts
        break;
      case 'running':
        this.race(now, input);
        break;
      case 'dead':
        this.idle(now); // GAME OVER plays on
        input.clear();
        break;
      case 'over':
        break;
    }
  }

  /** The lobby has counted this player out, as after sending nothing for too long: no death is sent for it. */
  serverDead(): void {
    if (this.phase !== 'running') return;
    retire(this.w);
    this.out();
  }

  /** The round is over for everyone: nothing moves any more. */
  end(): void {
    if (this.phase === 'running') this.keepHi();
    this.phase = 'over';
    this.count = null;
  }

  view(): RaceView {
    const { phase, w } = this;
    const start = phase === 'countdown' || (phase === 'running' && w.step < CLEAR_STEPS);
    return { phase, count: this.count, inverted: w.night > 0, hints: this.o.coarse && start };
  }

  private countDown(now: number): void {
    this.idle(now);
    const count = countFor(this.o.startAt - now);
    if (count !== null && count !== this.count) this.o.sound.play('countdown');
    this.count = count;
  }

  // Everyone's round starts on the same step, with no intro; the scene goes on from the countdown's.
  private begin(): void {
    const { seed, you, testMode } = this.o;
    this.w = createWorld({ seed, playerId: you, phase: 'running', invincible: testMode.invincible });
    this.phase = 'running';
    this.count = null;
  }

  private race(now: number, input: RaceInput): void {
    const w = this.w;
    const { skip, run } = stepsDue(w.step, now - this.o.startAt);
    if (skip > 0) {
      skipSteps(w, skip);
      input.clear(); // what was held through the time away is let go
    }
    for (let i = 0; i < run; i++) {
      this.step(input.take());
      if (this.phase !== 'running') return;
    }
    const at = Math.floor(w.step / STATE_EVERY_STEPS);
    if (at > this.sentAt) {
      this.sentAt = at;
      this.o.send.state(runState(w));
    }
  }

  private step(f: InputFrame): void {
    const w = this.w;
    const ev = stepWorld(w, this.o.testMode.autopilot ? botInput(w, earliestSafe) : f.step);
    const { sound } = this.o;
    if (ev.jumped || ev.airJumped) sound.play('press');
    if (ev.hit || ev.died) sound.play('hit');
    if (ev.achievement) sound.play('reached');
    if (ev.picked) sound.play('pickup');
    this.scene.step(w, ev);
    if (ev.died) {
      this.out();
      this.o.send.dead(w.distance);
    }
  }

  // Out of the round: the best score is kept, and GAME OVER plays from the next frame on.
  private out(): void {
    this.phase = 'dead';
    this.keepHi();
    this.idleFrom = null;
    this.idleSteps = 0;
  }

  private keepHi(): void {
    this.best = nextHi(this.best, this.w.score);
    writeNumber(HI_KEY, this.best);
  }

  // The scene's steps for the 60 Hz steps since the last frame, while the world stands still: the waiting dino
  // blinks and GAME OVER plays. After a long gap only the last MAX_CATCHUP_STEPS of them run, as in the round.
  private idle(now: number): void {
    const from = (this.idleFrom ??= now);
    const { skip, run } = stepsDue(this.idleSteps, now - from);
    this.idleSteps += skip + run;
    for (let i = 0; i < run; i++) this.scene.step(this.w, NO_EVENTS);
  }
}
