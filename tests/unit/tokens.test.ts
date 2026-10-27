import { expect, it } from 'vitest';
import { sessionTokens } from '../../src/net/tokens';
import { memoryStorage } from './helpers/fake-storage';

it('keeps a token per lobby under dwf.token.<CODE>', () => {
  const storage = memoryStorage();
  const t = sessionTokens(() => storage);
  t.set('K7RM2Q', 'abc');
  expect(storage.getItem('dwf.token.K7RM2Q')).toBe('abc');
  expect([t.get('K7RM2Q'), t.get('AAAAAA')]).toEqual(['abc', null]);
});

it('keeps tokens in memory where sessionStorage is missing or throws', () => {
  const refuse = (): Storage => {
    throw new DOMException('no', 'SecurityError');
  };
  for (const get of [() => null, refuse]) {
    const t = sessionTokens(get);
    t.set('K7RM2Q', 'abc');
    expect(t.get('K7RM2Q')).toBe('abc');
  }
});
