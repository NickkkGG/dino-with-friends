import { beforeEach, expect, it } from 'vitest';
import {
  readFlag, readNumber, readText, setStorageForTests, writeFlag, writeNumber, writeText,
} from '../../src/game/storage';
import { memoryStorage } from './helpers/fake-storage';

let store: ReturnType<typeof memoryStorage>;
beforeEach(() => {
  store = memoryStorage();
  setStorageForTests(store);
});

it('numbers and flags go into storage and come back', () => {
  expect(readNumber('dwf.hi', 0)).toBe(0);
  expect(readFlag('dwf.muted', false)).toBe(false);
  writeNumber('dwf.hi', 1234);
  writeFlag('dwf.muted', true);
  expect(store.getItem('dwf.hi')).toBe('1234');
  expect(store.getItem('dwf.muted')).toBe('1');
  expect(readNumber('dwf.hi', 0)).toBe(1234);
  expect(readFlag('dwf.muted', false)).toBe(true);
  writeFlag('dwf.muted', false);
  expect(readFlag('dwf.muted', true)).toBe(false);
});

it('anything unreadable gives the fallback', () => {
  store.setItem('dwf.hi', 'lots');
  store.setItem('dwf.muted', 'maybe');
  expect(readNumber('dwf.hi', 7)).toBe(7);
  expect(readFlag('dwf.muted', true)).toBe(true);
  store.setItem('dwf.hi', 'Infinity');
  expect(readNumber('dwf.hi', 7)).toBe(7);
  store.setItem('dwf.hi', '');
  expect(readNumber('dwf.hi', 7)).toBe(7);
});

it('falls back to memory when localStorage throws', () => {
  setStorageForTests('throw');
  writeNumber('dwf.hi', 120);
  expect(readNumber('dwf.hi', 0)).toBe(120);
  writeFlag('dwf.muted', true);
  expect(readFlag('dwf.muted', false)).toBe(true);
});

it('works in memory when there is no storage at all', () => {
  setStorageForTests(null);
  expect(readNumber('dwf.hi', 5)).toBe(5);
  writeNumber('dwf.hi', 99);
  expect(readNumber('dwf.hi', 5)).toBe(99);
});

it('a write that fails is still read back, and a later one that works wins', () => {
  writeNumber('dwf.hi', 100);
  store.full = true;
  writeNumber('dwf.hi', 200);
  expect(store.getItem('dwf.hi')).toBe('100');
  expect(readNumber('dwf.hi', 0)).toBe(200);
  store.full = false;
  writeNumber('dwf.hi', 300);
  expect(store.getItem('dwf.hi')).toBe('300');
  store.setItem('dwf.hi', '400'); // another tab writes
  expect(readNumber('dwf.hi', 0)).toBe(400);
});

it('keeps text too, in memory where storage refuses', () => {
  expect(readText('dwf.name', '')).toBe('');
  writeText('dwf.name', 'NICK');
  expect(store.getItem('dwf.name')).toBe('NICK');
  expect(readText('dwf.name', '')).toBe('NICK');
  setStorageForTests('throw');
  expect(readText('dwf.name', 'NONE')).toBe('NONE');
  writeText('dwf.name', 'RARA');
  expect(readText('dwf.name', '')).toBe('RARA');
});
