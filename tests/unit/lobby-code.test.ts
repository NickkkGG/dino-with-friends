import { expect, it } from 'vitest';
import { CODE_ALPHABET, cleanCode, isLobbyCode, makeCode } from '../../shared/lobby/code';

it('has 31 symbols, A to Z and 2 to 9 without O, I, L, 0 and 1', () => {
  expect(CODE_ALPHABET).toHaveLength(31);
  expect(new Set(CODE_ALPHABET).size).toBe(31);
  for (const ch of 'OIL01') expect(CODE_ALPHABET).not.toContain(ch);
});

it('cleans what is typed into a code', () => {
  expect(cleanCode('k7rm-2q!x')).toBe('K7RM2Q');
  expect(cleanCode('o0i1l')).toBe('');
  expect(cleanCode('abcdefgh')).toBe('ABCDEF');
});

it('knows a code', () => {
  expect(isLobbyCode('K7RM2Q')).toBe(true);
  for (const s of ['K7RM2', 'K7RM2QX', 'K7RM2O', 'k7rm2q', '']) expect(isLobbyCode(s), s).toBe(false);
});

it('makes a code from six picks', () => {
  const picks: number[] = [];
  const code = makeCode((n) => {
    picks.push(n);
    return picks.length - 1;
  });
  expect(picks).toEqual([31, 31, 31, 31, 31, 31]);
  expect(code).toBe('ABCDEF');
  expect(makeCode(() => 30)).toBe('999999');
});
