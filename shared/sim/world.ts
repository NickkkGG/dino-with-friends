// Copyright 2014 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the third_party/chromium/LICENSE file.
// Modified for DINO with FRIENDS: Runner.update's running part as a fixed 60 Hz step of plain state with no drawing or sound, plus hearts, a slowdown after a hit and the wait and intro.

import { BoxPlan } from './boxes';
import type { SkillBox, SkillId } from './boxes';
import { findCollision, overlapCenter, touchesBox } from './collision';
import type { Box } from './collision';
import {
  ACHIEVEMENT_SCORE, BOX_SIZE, BOX_Y, CLEAR_STEPS, HP_MAX, HP_START, HURT_STEPS, INTRO_STEPS, INVULN_STEPS, NIGHT_SCORE,
  NIGHT_STEPS, SKILL_STEPS, SLOW_MIN, SLOW_RECOVER_STEPS, SPEED_SKILL_MULTIPLIER, SPEED_START, TREX_X, WORLD_W,
} from './constants';
import { Course } from './course';
import type { CourseObstacle } from './course';
import { typeConfig } from './obstacle-types';
import type { ObstacleType } from './obstacle-types';
import { BASE_TIMELINE, TimelineTable, scoreOf } from './timeline';
import type { Timeline } from './timeline';
import { airJump, createTrex, endJump, resetTrex, setSpeedDrop, startJump, updateJump } from './trex';
import type { TrexState } from './trex';

/**
 * Where a world is in its round: 'waiting' for the first jump, 'intro' (the 24 steps in which the track widens and the
 * dino slides in), 'running', or 'dead' once the last heart is gone.
 */
export type Phase = 'waiting' | 'intro' | 'running' | 'dead';

/**
 * What the player did on one step. A key's pressed and released flags are true only on the step it goes down or up, never
 * again while it is held; duckHeld stays true for as long as ↓ is down.
 */
export interface StepInput {
  jumpPressed: boolean;
  jumpReleased: boolean;
  duckPressed: boolean;
  duckHeld: boolean;
}

/** Nothing pressed. */
export const NO_INPUT: StepInput = Object.freeze({
  jumpPressed: false, jumpReleased: false, duckPressed: false, duckHeld: false,
});

/** What happened on one step, for the sound, the effects and the scoreboard. */
export interface StepEvents {
  /** A jump from the ground began. */
  jumped: boolean;
  /** An air jump began. */
  airJumped: boolean;
  /** The dino came down onto the ground. */
  landed: boolean;
  /** The dino is touching the first obstacle, whether or not that costs a heart. */
  overlap: boolean;
  /** Where the dino and the obstacle overlap, when this step cost a heart. */
  hit: { x: number; y: number } | null;
  /** The last heart was lost on this step. */
  died: boolean;
  /** The skill box picked up on this step. */
  picked: { n: number; skill: SkillId } | null;
  /** The score reached a multiple of ACHIEVEMENT_SCORE. */
  achievement: boolean;
  nightStarted: boolean;
  nightEnded: boolean;
  /** The first jump of a waiting world has landed, and the intro begins. */
  introStarted: boolean;
  /** The intro is over; the round starts, from step 0. */
  runStarted: boolean;
}

export interface WorldOptions {
  seed: number;
  playerId: string;
  /** How fast the ground runs, step by step. Default BASE_TIMELINE. */
  timeline?: Timeline;
  /** 'waiting' puts the dino at x 0 to wait for its first jump. 'running' starts the round at once, with the dino at TREX_X. Default 'running'. */
  phase?: 'waiting' | 'running';
  /** Whether the course has skill boxes. Default true. */
  boxes?: boolean;
  /** Whether a skill that is picked up takes effect. Default true. */
  applySkills?: boolean;
  /** Touching an obstacle is still reported, but never costs a heart. Default false. */
  invincible?: boolean;
  /** Whether night falls every NIGHT_SCORE points. Default true. */
  nightMode?: boolean;
  /** Every box holds this skill, whatever the plan says. Default null. */
  forcedSkill?: SkillId | null;
}

/**
 * One player's world, all of it plain data that stepWorld moves on, one 60 Hz step at a time.
 * Nothing in it comes from a clock or from chance, so the same world and the same inputs always give the same round.
 */
export interface World {
  readonly seed: number;
  readonly playerId: string;
  /** What the timeline adds up to. Worked out once and kept, so clones share it. */
  readonly table: TimelineTable;
  /** The obstacles of this seed. Worked out once and kept, so clones share it. */
  readonly course: Course;
  /** This player's skill boxes, or null in a world without boxes. Worked out once and kept, so clones share it. */
  readonly boxes: BoxPlan | null;
  readonly opts: { applySkills: boolean; invincible: boolean; nightMode: boolean; forcedSkill: SkillId | null };
  phase: Phase;
  /** The number of the next running step. It starts at 0 when the round starts, so waiting and the intro are not counted. */
  step: number;
  /** How many steps of the intro have gone by. */
  introStep: number;
  /** The dino has made its first jump, so when it lands the intro begins. Only a waiting world cares. */
  started: boolean;
  /** How far the ground has scrolled, in whole pixels. */
  scroll: number;
  /** The distance run: the speed of every running step added up. The score comes from it. */
  distance: number;
  score: number;
  trex: TrexState;
  hp: number;
  /** The step of the last hit that cost a heart; null before the first. */
  hitStep: number | null;
  /** Where that hit was. */
  hitPoint: { x: number; y: number } | null;
  /** The step on which each timed skill runs out: it is on while the step number is below it. */
  skillUntil: { doubleJump: number; ghost: number; speed: number };
  /** The skill picked up last, and on which step. */
  lastSkill: { id: SkillId; step: number } | null;
  /** The obstacles from index `first` up to, but not including, `end` are in the world. Those before `first` have gone, those from `end` have not come yet. */
  first: number;
  end: number;
  /** How far each bird in the world has flown on against the ground, in pixels, by obstacle index. */
  drift: Map<number, number>;
  /** The number of the next box to pick up: the ones before it were taken or missed. */
  boxIndex: number;
  /** 0 by day. At night, the number of the night's step, counting from 1. */
  night: number;
  /** The score that an achievement was last reported for, so that a score which stays on a multiple of 100 reports once. */
  lastAchievement: number;
}

/** An obstacle as it is in the world now, in the shape findCollision and the drawing want. */
export interface ObstacleView {
  index: number;
  type: ObstacleType;
  /** How many stand together, 1 to 3. */
  size: number;
  /** The left and top edge in world pixels. The left edge is past the right edge of the world while the obstacle is coming in. */
  x: number;
  y: number;
  /** The width of the whole group, its height and its inner collision boxes. */
  width: number;
  height: number;
  boxes: readonly Box[];
}

export function createWorld(o: WorldOptions): World {
  const table = new TimelineTable(o.timeline ?? BASE_TIMELINE);
  const course = new Course(o.seed, table);
  const waiting = o.phase === 'waiting';
  return {
    seed: o.seed,
    playerId: o.playerId,
    table,
    course,
    boxes: o.boxes === false ? null : new BoxPlan(course, table, o.seed, o.playerId),
    opts: {
      applySkills: o.applySkills ?? true,
      invincible: o.invincible ?? false,
      nightMode: o.nightMode ?? true,
      forcedSkill: o.forcedSkill ?? null,
    },
    phase: waiting ? 'waiting' : 'running',
    step: 0,
    introStep: 0,
    started: !waiting,
    scroll: 0,
    distance: 0,
    score: 0,
    trex: createTrex(waiting ? 0 : TREX_X),
    hp: HP_START,
    hitStep: null,
    hitPoint: null,
    skillUntil: { doubleJump: 0, ghost: 0, speed: 0 },
    lastSkill: null,
    first: 0,
    end: 0,
    drift: new Map(),
    boxIndex: 0,
    night: 0,
    lastAchievement: 0,
  };
}

/** A copy that goes its own way. Only what is worked out once and kept, the table, the course and the boxes, is shared. */
export function cloneWorld(w: World): World {
  return {
    ...w,
    opts: { ...w.opts },
    trex: { ...w.trex },
    hitPoint: w.hitPoint && { ...w.hitPoint },
    skillUntil: { ...w.skillUntil },
    lastSkill: w.lastSkill && { ...w.lastSkill },
    drift: new Map(w.drift),
  };
}

function noEvents(): StepEvents {
  return {
    jumped: false, airJumped: false, landed: false, overlap: false, hit: null, died: false, picked: null,
    achievement: false, nightStarted: false, nightEnded: false, introStarted: false, runStarted: false,
  };
}

/**
 * How fast the ground runs on the next step: the timeline's speed, slowed down after a hit and sped up by the speed skill.
 * A hit drops the speed to SLOW_MIN of what it was, and it climbs back to the full speed over SLOW_RECOVER_STEPS steps.
 */
export function currentSpeed(w: World): number {
  const slow = w.hitStep === null
    ? 1
    : SLOW_MIN + (1 - SLOW_MIN) * Math.min(1, (w.step - w.hitStep) / SLOW_RECOVER_STEPS);
  const boost = skillRemaining(w, 'speed') > 0 ? SPEED_SKILL_MULTIPLIER : 1;
  return w.table.speedAt(w.step) * slow * boost;
}

/** How many steps have gone by since the step of the last hit: 0 right after it, Infinity if there has been no hit. */
export function stepsSinceHit(w: World): number {
  return w.hitStep === null ? Infinity : w.step - 1 - w.hitStep;
}

/** Whether the next step is protected: for INVULN_STEPS steps after a hit, a second hit cannot cost a heart. */
export function isInvulnerable(w: World): boolean {
  return w.hitStep !== null && w.step <= w.hitStep + INVULN_STEPS;
}

/** Whether the dino is still showing the face of a hit, which it does for the first HURT_STEPS steps after one. */
export function isHurt(w: World): boolean {
  return stepsSinceHit(w) < HURT_STEPS;
}

/** How many steps a timed skill has left. */
export function skillRemaining(w: World, id: 'doubleJump' | 'ghost' | 'speed'): number {
  return Math.max(0, w.skillUntil[id] - w.step);
}

// Where the left edge of an obstacle is on the player's screen: it is fixed in the course, the ground scrolls it past,
// and a bird flies on against the ground by its drift.
function screenX(w: World, o: CourseObstacle): number {
  return o.worldX - w.scroll - (w.drift.get(o.index) ?? 0);
}

function viewOf(w: World, i: number): ObstacleView {
  const o = w.course.get(i);
  return {
    index: i, type: o.type, size: o.size, x: screenX(w, o), y: o.yPos, width: o.width, height: o.height, boxes: o.boxes,
  };
}

/** The obstacles that are in the world now, the one nearest the dino first. */
export function visibleObstacles(w: World): ObstacleView[] {
  const views: ObstacleView[] = [];
  for (let i = w.first; i < w.end; i++) views.push(viewOf(w, i));
  return views;
}

/** The box that is coming next and its left edge on the screen, or null when there is none to show. Changes nothing. */
export function pendingBox(w: World): { box: SkillBox; x: number } | null {
  const box = w.boxes?.get(w.boxIndex) ?? null;
  return box && { box, x: box.worldX - w.scroll };
}

/** Puts the dino back on the ground, for when a paused round goes on. Nothing else about the world changes. */
export function resumeAfterPause(w: World): void {
  resetTrex(w.trex);
}

// What the player pressed, before the physics. The jump is dealt with first, so a dino that is ducking cannot jump
// (as in the original), and a jump and a duck that begin together make a jump.
function applyInput(w: World, input: StepInput, v: number, ev: StepEvents): void {
  const t = w.trex;
  if (input.jumpPressed) {
    if (startJump(t, v)) {
      ev.jumped = true;
      if (w.phase === 'waiting') w.started = true;
    } else if (w.phase === 'running' && t.jumping && skillRemaining(w, 'doubleJump') > 0 && airJump(t, v)) {
      ev.airJumped = true;
    }
  }
  if (input.jumpReleased && t.jumping) endJump(t);
  if (w.phase === 'waiting') return; // ↓ means nothing until the round has begun
  if (input.duckPressed && t.jumping) setSpeedDrop(t);
  if (!input.duckHeld) {
    t.speedDrop = false;
    t.ducking = false;
  } else if (!t.jumping) {
    t.ducking = true;
  }
}

// Birds fly on, obstacles whose turn has come enter at the right edge, and those that have left at the left are let go.
function moveObstacles(w: World, v: number): void {
  for (let i = w.first; i < w.end; i++) {
    const o = w.course.get(i);
    if (o.type === 'pterodactyl') {
      w.drift.set(i, (w.drift.get(i) ?? 0) + Math.floor(v + o.speedOffset) - Math.floor(v));
    }
  }

  // An obstacle comes in once the ground has scrolled as far as it had when the course first put it at the right edge,
  // which is when it is 600 + its type width from the left edge of the world. Birds start with no drift.
  let next = w.course.get(w.end);
  while (next.worldX - w.scroll <= WORLD_W + typeConfig(next.type).width) {
    if (next.type === 'pterodactyl') w.drift.set(next.index, 0);
    w.end += 1;
    next = w.course.get(w.end);
  }

  while (w.first < w.end) {
    const o = w.course.get(w.first);
    if (screenX(w, o) + o.width > 0) break;
    w.drift.delete(w.first);
    w.first += 1;
  }
}

// The dino against the first obstacle in the world, the only one tested, as in the original. A touch costs a heart
// unless the dino is invincible, protected after a hit, or a ghost; the last heart ends the round.
function checkCollision(w: World, ev: StepEvents): void {
  if (w.first >= w.end) return;
  const pair = findCollision(w.trex, viewOf(w, w.first));
  if (!pair) return;
  ev.overlap = true;
  if (w.opts.invincible || isInvulnerable(w) || skillRemaining(w, 'ghost') > 0) return;
  w.hp -= 1;
  w.hitStep = w.step;
  const point = overlapCenter(pair);
  w.hitPoint = point;
  ev.hit = { ...point };
  if (w.hp === 0) {
    w.phase = 'dead';
    ev.died = true;
  }
}

// The next box: a dino that touches it takes it, and one that lets it leave the screen has missed it. A box that found
// no wide enough gap is let go once the score reaches its target (targets are at least 400 points apart, so no box that
// was placed is ever passed over early). A +1 HEART with the hearts full gives the box's other skill; a skill picked up
// again starts its time again.
function pickBox(w: World, ev: StepEvents): void {
  const plan = w.boxes;
  if (!plan) return;
  while (plan.get(w.boxIndex) === null && w.score >= plan.target(w.boxIndex)) w.boxIndex += 1;
  const box = plan.get(w.boxIndex);
  if (!box) return;
  const x = box.worldX - w.scroll;
  if (touchesBox(w.trex, x, BOX_Y, BOX_SIZE)) {
    let id = w.opts.forcedSkill ?? box.skill;
    if (id === 'heart' && w.hp >= HP_MAX) id = box.altSkill;
    if (w.opts.applySkills) {
      if (id === 'heart') w.hp = Math.min(HP_MAX, w.hp + 1);
      else w.skillUntil[id] = w.step + 1 + SKILL_STEPS[id];
    }
    w.lastSkill = { id, step: w.step };
    ev.picked = { n: box.n, skill: id };
    w.boxIndex += 1;
  } else if (x + BOX_SIZE < 0) {
    w.boxIndex += 1;
  }
}

// A multiple of ACHIEVEMENT_SCORE is reported once, however many steps the score stays on it. The score is a whole
// number, so % is exact here.
function reportAchievement(w: World, ev: StepEvents): void {
  if (w.score > 0 && w.score % ACHIEVEMENT_SCORE === 0 && w.score !== w.lastAchievement) {
    ev.achievement = true;
    w.lastAchievement = w.score;
  }
}

// Night falls on a multiple of NIGHT_SCORE and lasts NIGHT_STEPS steps.
function advanceNight(w: World, ev: StepEvents): void {
  if (!w.opts.nightMode) return;
  if (w.night > 0) {
    w.night += 1;
    if (w.night > NIGHT_STEPS) {
      w.night = 0;
      ev.nightEnded = true;
    }
  } else if (w.score > 0 && w.score % NIGHT_SCORE === 0) {
    w.night = 1;
    ev.nightStarted = true;
  }
}

// One step of a round that is running, after the input and the jump: the ground, the obstacles, the check for a hit,
// then distance, score and night.
function stepRunning(w: World, v: number, ev: StepEvents): void {
  w.scroll += Math.floor(v);
  if (w.step >= CLEAR_STEPS) {
    moveObstacles(w, v);
    checkCollision(w, ev);
    if (ev.died) return; // the crash step adds no distance and is not counted, as in the original
  }
  pickBox(w, ev); // after the check for a hit, before the distance is added
  w.distance += v;
  w.score = scoreOf(w.distance);
  reportAchievement(w, ev);
  advanceNight(w, ev);
  w.step += 1;
}

/**
 * One fixed step of a player's world, and what happened in it. In this order: the input; the jump; then, by phase:
 * a waiting dino starts the intro when its first jump lands, the intro slides the dino in 1 px a step and starts the
 * round after INTRO_STEPS steps, and a running round scrolls, moves the obstacles, checks for a hit, adds the distance
 * and moves the score and the night on. A dead world does nothing.
 * Intro steps and waiting steps move nothing but the dino: distance and speed only count from the start of the round.
 */
export function stepWorld(w: World, input: StepInput): StepEvents {
  const ev = noEvents();
  if (w.phase === 'dead') return ev;
  const v = w.phase === 'running' ? currentSpeed(w) : SPEED_START;
  applyInput(w, input, v, ev);
  if (w.trex.jumping && updateJump(w.trex)) ev.landed = true;
  if (w.phase === 'waiting') {
    if (ev.landed && w.started) {
      w.phase = 'intro';
      w.introStep = 0;
      ev.introStarted = true;
    }
    return ev;
  }
  if (w.phase === 'intro') {
    w.introStep += 1;
    w.trex.x = Math.min(TREX_X, w.trex.x + 1);
    if (w.introStep === INTRO_STEPS) {
      w.phase = 'running';
      w.step = 0; // the round starts from step 0
      ev.runStarted = true;
    }
    return ev;
  }
  stepRunning(w, v, ev);
  return ev;
}
