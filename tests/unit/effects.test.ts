import { expect, it } from 'vitest';
import { BOX_Y } from '../../shared/sim/constants';
import { NO_EVENTS, NO_INPUT, createWorld, pendingBox, stepWorld } from '../../shared/sim/world';
import type { StepEvents, World } from '../../shared/sim/world';
import { INK, PAPER } from '../../src/game/colors';
import { Effects, SKILL_LABELS, drawBox } from '../../src/game/draw/effects';
import { callsOf, fillsIn } from './helpers/fake-ctx';
import { fakeDc } from './helpers/fake-dc';

const world = (): World => createWorld({ seed: 1, playerId: 'solo', invincible: true });
const ev = (o: Partial<StepEvents>): StepEvents => ({ ...NO_EVENTS, ...o });

// How many steps an effect is on show, counting the step that started it.
function lasts(name: string, start: StepEvents): number {
  const fx = new Effects();
  const w = world();
  fx.step(w, start);
  let n = 0;
  while (fx.active().includes(name) && n < 1000) {
    n++;
    fx.step(w, NO_EVENTS);
  }
  return n;
}

it('label shows 48 steps, spark 21, puff 15, heart rise 72', () => {
  expect(SKILL_LABELS).toEqual({ doubleJump: 'DOUBLE JUMP!', heart: '+1 HEART!', ghost: 'GHOST!', speed: 'SPEED!' });
  expect(lasts('label', ev({ picked: { n: 0, skill: 'speed' } }))).toBe(48);
  expect(lasts('spark', ev({ hit: { x: 60, y: 100 } }))).toBe(21);
  expect(lasts('puff', ev({ airJumped: true }))).toBe(15);
  expect(lasts('heart', ev({ picked: { n: 0, skill: 'heart' } }))).toBe(72);
  expect(lasts('heart', ev({ picked: { n: 0, skill: 'ghost' } }))).toBe(0); // only a heart rises
  const fx = new Effects();
  fx.step(world(), ev({ hit: { x: 60, y: 100 }, picked: { n: 1, skill: 'heart' }, airJumped: true }));
  fx.reset();
  expect(fx.active()).toEqual([]);
});

it('hpShown lags one heart behind until the heart has risen', () => {
  const fx = new Effects();
  const w = world();
  w.hp = 4;
  expect(fx.hpShown(w)).toBe(4);
  fx.step(w, ev({ picked: { n: 0, skill: 'heart' } }));
  for (let i = 0; i < 71; i++) {
    expect(fx.hpShown(w), `step ${i}`).toBe(3);
    fx.step(w, NO_EVENTS);
  }
  expect(fx.hpShown(w)).toBe(3);
  fx.step(w, NO_EVENTS);
  expect(fx.hpShown(w)).toBe(4);
});

it('sweat only with one heart while running; wind only while SPEED', () => {
  const fx = new Effects();
  const w = world();
  fx.step(w, NO_EVENTS);
  expect(fx.active()).toEqual([]);
  w.hp = 1;
  fx.step(w, NO_EVENTS);
  expect(fx.active()).toEqual(['sweat']);
  const waiting = createWorld({ seed: 1, playerId: 'solo', phase: 'waiting' });
  waiting.hp = 1;
  fx.step(waiting, NO_EVENTS);
  expect(fx.active()).toEqual([]);
  w.hp = 2;
  w.skillUntil.speed = w.step + 1;
  fx.step(w, NO_EVENTS);
  expect(fx.active()).toEqual(['wind']);
  stepWorld(w, NO_INPUT); // one step later SPEED is over
  fx.step(w, NO_EVENTS);
  expect(fx.active()).toEqual([]);
});

it('the box coming next bobs 2 px around its height, once every 2 s', () => {
  const w = world();
  stepWorld(w, NO_INPUT);
  const box = pendingBox(w)!;
  const ys: number[] = [];
  for (const step of [0, 30, 60, 90, 120]) {
    w.step = step;
    const { dc, calls } = fakeDc();
    drawBox(dc, w);
    const rects = callsOf(calls, 'fillRect') as number[][];
    expect(Math.min(...rects.map((r) => r[0]!))).toBe(box.x);
    ys.push(Math.min(...rects.map((r) => r[1]!)));
  }
  expect(ys).toEqual([BOX_Y, BOX_Y + 2, BOX_Y, BOX_Y - 2, BOX_Y]);
  const bare = createWorld({ seed: 1, playerId: 'solo', boxes: false });
  const { dc, calls } = fakeDc();
  drawBox(dc, bare);
  expect(callsOf(calls, 'fillRect')).toEqual([]);
});

it('the spark and the skill label are outlined in paper, so the dino cannot hide them', () => {
  const fx = new Effects();
  const w = world();
  fx.step(w, ev({ hit: { x: 60, y: 100 }, picked: { n: 0, skill: 'speed' } }));
  const { dc, calls } = fakeDc();
  fx.draw(dc, w);
  const halo = fillsIn(calls, PAPER);
  const ink = fillsIn(calls, INK);
  expect(halo.length).toBeGreaterThan(0);
  // the spark's outline is one cell further out than its ink (at 1x the cell before it is 1 px: cells go 2, 1, 2, 1)
  const left = (rects: number[][]) => Math.min(...rects.map((r) => r[0]!));
  expect(left(ink.filter((r) => r[1]! > 80))).toBe(55);
  expect(left(halo.filter((r) => r[1]! > 80))).toBe(55 - 1);
  // the label at x 4 has its outline from x 4 - 1.5, rounded
  expect(left(halo.filter((r) => r[1]! < 40))).toBe(3);
});
