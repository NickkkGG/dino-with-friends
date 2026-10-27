import type { RunState } from '../../shared/lobby/protocol';
import { HP_MAX, SKILL_STEPS, STEP_MS, TREX_X } from '../../shared/sim/constants';
import { scoreOf } from '../../shared/sim/timeline';
import { NO_EVENTS, createWorld } from '../../shared/sim/world';
import type { StepEvents, World } from '../../shared/sim/world';
import { Scene } from './draw/scene';
import { SKY } from './layout';
import { stepsDue } from './race-clock';

/** How far behind the shared clock a watched screen is drawn, so that the next state has usually come in. */
export const WATCH_DELAY_MS = 150;

/** How many steps a watched screen runs on past its latest state, at that state's speed, before it holds still. */
export const RUN_ON_STEPS = 15;

export interface WatchRunOptions {
  seed: number;
  /** Who is watched: their id picks the boxes of their course. */
  target: string;
  startAt: number;
  /** The scene's own chance: clouds, stars and blinking. Default Math.random. */
  rand?: () => number;
}

const TIMED = ['doubleJump', 'ghost', 'speed'] as const;

/** The step a state was sent on. */
const stepOf = (s: RunState): number => Math.round(s.t / STEP_MS);

const lerp = (from: number, to: number, f: number): number => from + (to - from) * f;

/**
 * The screen of a runner being watched, without the page: their world as their states tell it, drawn by a Scene.
 * The world is a puppet: each frame puts it where the runner's was WATCH_DELAY_MS ago by the shared clock, between the
 * two states around that moment. What moves all the time (the ground, the distance, the dino's height, the birds) is
 * moved smoothly between them; the rest comes from the earlier state, but for a hit or a box taken in between, which
 * shows on its own step. Past the latest state the ground runs on for a moment, then holds. The clouds, the stars and
 * the dino's legs are the watcher's own.
 */
export class WatchRun {
  readonly scene: Scene;
  private readonly o: WatchRunOptions;
  private w: World;
  /** The states still needed, oldest first: the one shown now and those after it. */
  private states: RunState[] = [];
  private begun = false;
  private isOut = false;
  /** The step shown at the last frame; it never goes back. */
  private shown = 0;
  // What the screen has shown already, so each frame tells only what is new.
  private shownHit: number | null = null;
  private shownSkill: number | null = null;
  private shownAirJump = false;
  private shownHundreds = 0;
  // Before the first state the scene keeps its own 60 Hz steps, from the frame at idleFrom on, as a race's countdown.
  private idleFrom: number | null = null;
  private idleSteps = 0;

  constructor(o: WatchRunOptions) {
    this.o = o;
    this.scene = new Scene(
      { sky: SKY, hud: 'inside', showScore: true, showHi: true, introClip: false, idleClouds: false, restart: false },
      o.rand ?? Math.random,
    );
    // Until the first state, the dino waits where it will run from, as the runner's did through the countdown.
    this.w = createWorld({ seed: o.seed, playerId: o.target, phase: 'waiting', boxes: false, nightMode: false });
    this.w.trex.x = TREX_X;
  }

  get world(): World {
    return this.w;
  }

  /** Night on the watched screen. */
  get inverted(): boolean {
    return this.w.night > 0;
  }

  /** A wide screen has the HUD in the world, as the original; a portrait one has it in a strip above. */
  setWide(wide: boolean): void {
    this.scene.setHud(wide ? 'inside' : 'none', wide, wide);
  }

  /**
   * A relayed state of the runner. One not newer than the latest is dropped, but for the state of a crash: the crash
   * step is not counted, so that state can have the time of the one before it, which it takes the place of.
   */
  add(s: RunState): void {
    const latest = this.states.at(-1);
    if (latest && s.t === latest.t && s.hp === 0 && latest.hp > 0) this.states[this.states.length - 1] = s;
    else if (!latest || s.t > latest.t) this.states.push(s);
  }

  /**
   * The lobby has the runner out. With the state of their crash in, the screen runs on to it and shows it at its own
   * step; without one, GAME OVER on the picture there is.
   */
  out(): void {
    this.isOut = true;
  }

  /** One animation frame at `now` by the server's clock. */
  frame(now: number): void {
    if (this.states.length === 0) {
      this.idle(now);
      return;
    }
    if (!this.begun) this.begin();
    const t = now - this.o.startAt - WATCH_DELAY_MS;
    const step = Math.max(this.shown, Math.round(t / STEP_MS));
    const steps = Math.min(step - this.shown, RUN_ON_STEPS);
    this.shown = step;
    if (this.w.phase !== 'dead') {
      if (this.isOut && this.states.at(-1)!.hp > 0) this.w.phase = 'dead';
      else this.fill(step, t);
    }
    if (steps <= 0) return;
    const ev = this.events();
    for (let i = 0; i < steps; i++) this.scene.step(this.w, i === 0 ? ev : NO_EVENTS);
  }

  // The runner's own world from here on. What the first state has already happened is not shown again.
  private begin(): void {
    const first = this.states[0]!;
    this.w = createWorld({ seed: this.o.seed, playerId: this.o.target, phase: 'running' });
    this.begun = true;
    this.shownHit = first.hit?.step ?? null;
    this.shownSkill = first.skill?.step ?? null;
    this.shownAirJump = first.airJumped;
    this.shownHundreds = Math.floor(scoreOf(first.d) / 100);
  }

  // Puts the world where the runner's was on `step`, `t` ms into the round.
  private fill(step: number, t: number): void {
    while (this.states.length > 1 && stepOf(this.states[1]!) <= step) this.states.shift();
    const a = this.states[0]!;
    const b = this.states[1];
    const w = this.w;
    let f = 0;
    if (b) {
      f = Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t)));
      w.scroll = Math.round(lerp(a.x, b.x, f));
      w.distance = lerp(a.d, b.d, f);
      w.trex.y = Math.round(lerp(a.y, b.y, f));
      w.first = a.first;
      w.end = Math.max(a.end, b.end);
      const from = new Map(a.birds);
      const to = new Map(b.birds);
      w.drift = new Map();
      for (const i of new Set([...from.keys(), ...to.keys()])) {
        const d0 = from.get(i) ?? 0;
        w.drift.set(i, Math.round(lerp(d0, to.get(i) ?? d0, f)));
      }
    } else {
      // A runner out of hearts has stopped; any other runs on a little at the last speed, then holds.
      const k = a.hp === 0 ? 0 : Math.max(0, Math.min(step - stepOf(a), RUN_ON_STEPS));
      w.scroll = a.x + Math.floor(a.spd) * k;
      w.distance = a.d + a.spd * k;
      w.trex.y = a.y;
      w.first = a.first;
      w.end = a.end;
      w.drift = new Map(a.birds);
    }
    const pose = a.pose === 'jump' || b?.pose === 'jump' ? 'jump' : b && f >= 0.5 ? b.pose : a.pose;
    w.trex.x = TREX_X;
    w.trex.jumping = pose === 'jump';
    w.trex.ducking = pose === 'duck';
    w.trex.airJumpUsed = a.airJumped;

    w.hp = a.hp;
    w.boxIndex = a.got;
    w.night = a.night;
    const from = stepOf(a);
    for (const id of TIMED) w.skillUntil[id] = from + Math.round(a.fx[id] / STEP_MS);
    let hit = a.hit;
    let skill = a.skill;
    // A hit or a box between the two states shows on its own step, not at the next state.
    if (b?.hit && b.hit.step > (a.hit?.step ?? -1) && b.hit.step < step) {
      w.hp -= 1;
      hit = b.hit;
    }
    if (b?.skill && b.skill.step > (a.skill?.step ?? -1) && b.skill.step < step) {
      skill = b.skill;
      w.boxIndex = b.got;
      const { id } = b.skill;
      if (id === 'heart') w.hp = Math.min(HP_MAX, w.hp + 1);
      else w.skillUntil[id] = b.skill.step + 1 + SKILL_STEPS[id];
    }
    w.hitStep = hit && hit.step;
    w.hitPoint = hit && { x: hit.x, y: hit.y };
    w.lastSkill = skill && { ...skill };

    w.step = step;
    w.score = scoreOf(w.distance);
    w.phase = w.hp === 0 ? 'dead' : 'running';
  }

  // What happened on the screen since the last frame: a hit, a box, an air jump, a hundred more points.
  private events(): StepEvents {
    const w = this.w;
    const ev: StepEvents = { ...NO_EVENTS };
    if (w.hitStep !== null && w.hitStep !== this.shownHit && w.hitPoint) ev.hit = { ...w.hitPoint };
    this.shownHit = w.hitStep;
    if (w.lastSkill && w.lastSkill.step !== this.shownSkill) ev.picked = { n: w.boxIndex - 1, skill: w.lastSkill.id };
    this.shownSkill = w.lastSkill?.step ?? null;
    ev.airJumped = w.trex.airJumpUsed && !this.shownAirJump;
    this.shownAirJump = w.trex.airJumpUsed;
    const hundreds = Math.floor(w.score / 100);
    ev.achievement = w.score > 0 && hundreds > this.shownHundreds;
    this.shownHundreds = Math.max(this.shownHundreds, hundreds);
    return ev;
  }

  // The scene's 60 Hz steps since the last frame, while there is no state yet: the waiting dino blinks.
  private idle(now: number): void {
    const from = (this.idleFrom ??= now);
    const { skip, run } = stepsDue(this.idleSteps, now - from);
    this.idleSteps += skip + run;
    for (let i = 0; i < run; i++) this.scene.step(this.w, NO_EVENTS);
  }
}
