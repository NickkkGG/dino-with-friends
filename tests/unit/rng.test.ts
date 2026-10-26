import { expect, it } from 'vitest';
import { hashParts, mulberry32, randInt } from '../../shared/sim/rng';

it('mulberry32 gives the reference sequence', () => {
  const a = mulberry32(1);
  expect([a(), a(), a()]).toEqual([0.6270739405881613, 0.002735721180215478, 0.5274470399599522]);
  const b = mulberry32(42);
  expect([b(), b(), b()]).toEqual([0.6011037519201636, 0.44829055899754167, 0.8524657934904099]);
});

it('mulberry32 gives every generator its own state', () => {
  const alone = mulberry32(5);
  const sequence = [alone(), alone()];
  const a = mulberry32(5);
  const b = mulberry32(5);
  expect([a(), b(), a(), b()]).toEqual([sequence[0], sequence[0], sequence[1], sequence[1]]);
});

it('hashParts mixes numbers and strings', () => {
  expect(hashParts()).toBe(2166136261);
  expect(hashParts(12345, 'obstacle', 0)).toBe(3794633278);
  expect(hashParts(12345, 'ground', 2)).toBe(3101829204);
  expect(hashParts(12345, 'solo', 'box', 0)).toBe(1525208636);
});

it('hashParts keeps the parts apart', () => {
  expect(hashParts('ab', 'c')).not.toBe(hashParts('a', 'bc'));
});

it('randInt matches the original getRandomNum', () => {
  const r = mulberry32(7);
  expect([0, 1, 2, 3, 4].map(() => randInt(r, 0, 2))).toEqual([0, 0, 2, 2, 1]);
});

it('randInt reaches both ends and never goes past them', () => {
  const r = mulberry32(3);
  const seen = new Set<number>();
  for (let i = 0; i < 500; i++) seen.add(randInt(r, 3, 5));
  expect([...seen].sort((x, y) => x - y)).toEqual([3, 4, 5]);
});
