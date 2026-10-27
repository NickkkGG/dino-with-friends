import { expect, it } from 'vitest';
import { cleanName, uniqueName } from '../../shared/lobby/name';

it('cleans a name', () => {
  expect(cleanName('nick')).toBe('NICK');
  expect(cleanName(' Nick Nelson!')).toBe('NICKNELSON');
  expect(cleanName('abcdefghijklmno')).toBe('ABCDEFGHIJ');
  expect(cleanName('🦖rex')).toBe('REX');
  expect(cleanName('ñandú 2')).toBe('AND2');
  expect(cleanName('!!!')).toBe('');
});

it('numbers a name that is taken', () => {
  expect(uniqueName('NICK', [])).toBe('NICK');
  expect(uniqueName('NICK', ['NICK'])).toBe('NICK2');
  expect(uniqueName('NICK', ['NICK', 'NICK2'])).toBe('NICK3');
  expect(uniqueName('ABCDEFGHI', ['ABCDEFGHI'])).toBe('ABCDEFGHI2');
  expect(uniqueName('ABCDEFGHIJ', ['ABCDEFGHIJ'])).toBe('ABCDEFGHI2');
  expect(uniqueName('ABCDEFGHIJ', ['ABCDEFGHIJ', 'ABCDEFGHI2'])).toBe('ABCDEFGHI3');
});
