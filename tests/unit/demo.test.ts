import { expect, it } from 'vitest';
import { CLEAR_STEPS, GROUND_Y, SPEED_START } from '../../shared/sim/constants';
import { startJump, updateJump } from '../../shared/sim/trex';
import { currentSpeed } from '../../shared/sim/world';
import { HOP_EVERY_STEPS, demoStep, demoWorld, idleStep, idleWorld } from '../../src/game/demo';

it('the demo world runs at a constant 6, cannot be hurt, has no boxes or night, and starts with cacti on the way', () => {
  const w = demoWorld(5);
  expect(w.phase).toBe('running');
  expect(w.playerId).toBe('demo');
  expect(w.opts).toMatchObject({ invincible: true, nightMode: false });
  expect(w.boxes).toBeNull();
  expect(w.step).toBe(CLEAR_STEPS); // run on past the original's empty first 3 s
  expect(w.trex.jumping).toBe(false);
  for (let i = 0; i < 600; i++) demoStep(w);
  expect(currentSpeed(w)).toBe(6);
});

it('demoStep: the bot jumps every cactus and never touches one', () => {
  const w = demoWorld(5);
  let jumps = 0;
  for (let i = 0; i < 3000; i++) {
    const ev = demoStep(w);
    if (ev.jumped) jumps++;
    expect(ev.overlap).toBe(false);
  }
  expect(jumps).toBeGreaterThan(10);
});

it('the idle world: a dino waiting at x 24, nothing coming', () => {
  const w = idleWorld();
  expect(w.phase).toBe('waiting');
  expect(w.trex.x).toBe(24);
  expect(w.boxes).toBeNull();
});

it('lets the winner hop again and again, without starting a round', () => {
  const w = idleWorld();
  let hops = 0;
  let landings = 0;
  let top = GROUND_Y;
  for (let n = 0; n < 300; n++) {
    const up = w.trex.jumping;
    idleStep(w, n, true);
    if (!up && w.trex.jumping) hops++;
    if (up && !w.trex.jumping) landings++;
    top = Math.min(top, w.trex.y);
  }
  expect(hops).toBe(Math.ceil(300 / HOP_EVERY_STEPS));
  expect(landings).toBe(hops);
  expect(w.phase).toBe('waiting');
  expect(w.trex.y).toBe(GROUND_Y);
  // A hop: lower than a jump the original holds as long as it can.
  const held = idleWorld();
  let heldTop = GROUND_Y;
  startJump(held.trex, SPEED_START);
  while (held.trex.jumping) {
    updateJump(held.trex);
    heldTop = Math.min(heldTop, held.trex.y);
  }
  expect(top).toBeGreaterThan(heldTop);
});

it('keeps the plain idle dino on the ground', () => {
  const w = idleWorld();
  for (let n = 0; n < 300; n++) {
    idleStep(w, n, false);
    expect(w.trex.jumping).toBe(false);
    expect(w.trex.y).toBe(GROUND_Y);
  }
  expect(w.phase).toBe('waiting');
});
