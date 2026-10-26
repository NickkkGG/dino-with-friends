import { expect, it } from 'vitest';
import { CLEAR_STEPS } from '../../shared/sim/constants';
import { currentSpeed } from '../../shared/sim/world';
import { demoStep, demoWorld, idleWorld } from '../../src/game/demo';

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
