// Settings, the best score and the player's name in localStorage, under keys that start with 'dwf.'. Where localStorage is missing or
// refuses (private browsing, blocked site data, a full quota), the values live in memory for as long as the page is open.

type Backing = Storage | null | 'throw';

// The storage the tests put in place of localStorage, if any.
let forTests: Backing | undefined;
// The values whose last write did not reach storage.
const memory = new Map<string, string>();

function storage(): Storage | null {
  if (forTests === 'throw') throw new DOMException('The operation is insecure.', 'SecurityError');
  if (forTests !== undefined) return forTests;
  return globalThis.localStorage ?? null; // reading localStorage itself throws where site data is blocked
}

function read(key: string): string | null {
  const kept = memory.get(key);
  if (kept !== undefined) return kept;
  try {
    return storage()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    const s = storage();
    if (s) {
      s.setItem(key, value);
      memory.delete(key);
      return;
    }
  } catch {
    // kept in memory below
  }
  memory.set(key, value);
}

export function readNumber(key: string, fallback: number): number {
  const v = read(key);
  const n = v === null || v.trim() === '' ? NaN : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function writeNumber(key: string, v: number): void {
  write(key, String(v));
}

export function readFlag(key: string, fallback: boolean): boolean {
  const v = read(key);
  if (v === '1') return true;
  if (v === '0') return false;
  return fallback;
}

export function writeFlag(key: string, v: boolean): void {
  write(key, v ? '1' : '0');
}

export function readText(key: string, fallback: string): string {
  return read(key) ?? fallback;
}

export function writeText(key: string, v: string): void {
  write(key, v);
}

/** Puts a storage in place of localStorage: a Storage, none at all, or one that throws on every use. Memory starts empty. */
export function setStorageForTests(s: Backing): void {
  forTests = s;
  memory.clear();
}
