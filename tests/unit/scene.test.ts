import { expect, it } from 'vitest';
import { INTRO_STEPS } from '../../shared/sim/constants';
import { NO_EVENTS, NO_INPUT, createWorld, stepWorld } from '../../shared/sim/world';
import type { StepInput } from '../../shared/sim/world';
import { Scene, easeOut, revealWidth } from '../../src/game/draw/scene';
import { INK } from '../../src/game/colors';
import { callsOf, fillsIn } from './helpers/fake-ctx';
import { fakeDc } from './helpers/fake-dc';

const JUMP: StepInput = { ...NO_INPUT, jumpPressed: true };

it('revealWidth: 44 while waiting, grows to 600 by the end of the intro, never shrinks', () => {
  const w = createWorld({ seed: 1, playerId: 'solo', phase: 'waiting' });
  expect(revealWidth(w)).toBe(44);
  stepWorld(w, JUMP);
  const widths: number[] = [];
  for (let i = 0; i < 200 && w.phase !== 'running'; i++) {
    stepWorld(w, NO_INPUT);
    widths.push(revealWidth(w));
  }
  expect(w.phase).toBe('running');
  expect(widths.at(-1)).toBe(600);
  expect(widths[0]).toBe(44);
  for (let i = 1; i < widths.length; i++) expect(widths[i]!).toBeGreaterThanOrEqual(widths[i - 1]!);
  expect(widths.filter((x) => x > 44 && x < 600)).toHaveLength(INTRO_STEPS - 1);
});

it('easeOut is CSS cubic-bezier(0, 0, 0.58, 1)', () => {
  expect(easeOut(0)).toBe(0);
  expect(easeOut(1)).toBe(1);
  // at curve parameter t = 0.5 the curve is at x = 3 · 0.5 · 0.25 · 0.58 + 0.125 = 0.3425 and y = 3 · 0.5 · 0.25 + 0.125 = 0.5
  const x = 3 * 0.5 * 0.25 * 0 + 3 * 0.5 * 0.25 * 0.58 + 0.125;
  const y = 3 * 0.5 * 0.25 * 1 + 0.125;
  expect(easeOut(x)).toBeCloseTo(y, 6);
  expect(easeOut(0.5)).toBeGreaterThan(0.5);
});

it('scene draws the HUD from the intro on, and GAME OVER only when dead', () => {
  const opts = { sky: 40, hud: 'inside', showScore: true, showHi: true, introClip: true, idleClouds: false } as const;
  const scene = new Scene(opts, () => 0.5);
  const w = createWorld({ seed: 1, playerId: 'solo', phase: 'waiting' });
  // the score's digits come from the number strip at source y 2, x 655..764; GAME OVER from source y 15
  const parts = () => {
    const { dc, calls } = fakeDc(1, 1, 40);
    scene.draw(dc, w, 1234);
    const images = callsOf(calls, 'drawImage');
    return {
      digits: images.filter((c) => c[2] === 2 && (c[1] as number) >= 655 && (c[1] as number) < 775).length,
      gameOver: images.some((c) => c[1] === 655 && c[2] === 15),
      clipped: calls.some((c) => c.op === 'clip'),
    };
  };
  scene.step(w, NO_EVENTS);
  expect(parts()).toEqual({ digits: 0, gameOver: false, clipped: true });
  stepWorld(w, JUMP);
  while (w.phase === 'waiting') scene.step(w, stepWorld(w, NO_INPUT));
  expect(parts()).toMatchObject({ digits: 5 + 7, gameOver: false, clipped: true }); // score and HI 01234
  while (w.phase !== 'running') scene.step(w, stepWorld(w, NO_INPUT));
  expect(parts()).toMatchObject({ gameOver: false, clipped: false });
  w.phase = 'dead';
  scene.step(w, NO_EVENTS);
  expect(parts().gameOver).toBe(true);
});

it('can leave out the restart button', () => {
  const opts = { sky: 40, hud: 'inside', showScore: true, showHi: true, introClip: false, idleClouds: false } as const;
  const w = createWorld({ seed: 1, playerId: 'solo' });
  w.phase = 'dead';
  // GAME OVER's text is at source (655, 15) of the 1x sheet; the restart button is 36 wide at source y 68.
  const parts = (scene: Scene) => {
    const { dc, calls } = fakeDc(1, 1, 40);
    scene.draw(dc, w, 0);
    const images = callsOf(calls, 'drawImage');
    return {
      text: images.some((c) => c[1] === 655 && c[2] === 15),
      button: images.some((c) => c[2] === 68 && c[3] === 36),
    };
  };
  expect(parts(new Scene(opts, () => 0.5))).toEqual({ text: true, button: true });
  expect(parts(new Scene({ ...opts, restart: true }, () => 0.5))).toEqual({ text: true, button: true });
  expect(parts(new Scene({ ...opts, restart: false }, () => 0.5))).toEqual({ text: true, button: false });
});

it('setHud moves the hearts, the skills and the score out of the world and back', () => {
  const scene = new Scene({ sky: 40, hud: 'inside', showScore: true, showHi: true, introClip: true, idleClouds: false }, () => 0.5);
  const w = createWorld({ seed: 1, playerId: 'solo' });
  scene.step(w, stepWorld(w, NO_INPUT));
  const drawn = () => {
    const { dc, calls } = fakeDc(1, 1, 40);
    scene.draw(dc, w, 1234);
    const digits = callsOf(calls, 'drawImage').filter((c) => c[2] === 2 && (c[1] as number) >= 655 && (c[1] as number) < 775);
    // the hearts are the ink in the top left corner (the box coming next is also ink, far off to the right)
    const hearts = fillsIn(calls, INK).some(([x, y]) => x! < 100 && y! < 40 + 20);
    return { digits: digits.length, hearts };
  };
  expect(drawn()).toEqual({ digits: 5 + 7, hearts: true });
  scene.setHud('none', false, false);
  expect(drawn()).toEqual({ digits: 0, hearts: false });
  scene.setHud('none', false, true); // the title: a HI and nothing else
  expect(drawn()).toEqual({ digits: 7, hearts: false });
  scene.setHud('inside', true, true);
  expect(drawn()).toEqual({ digits: 5 + 7, hearts: true });
});
