/** A source of numbers in [0, 1) that a seed can replay. */
export type Rng = () => number;

// Mulberry32: a small generator with a 32-bit state. The same seed gives the same numbers on every engine.
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// FNV-1a: a number adds 4 bytes (uint32, low byte first), a string adds 2 bytes per UTF-16 unit, 0xff closes each part.
export function hashParts(...parts: Array<number | string>): number {
  let h = 0x811c9dc5;
  const byte = (b: number) => { h ^= b & 0xff; h = Math.imul(h, 0x01000193); };
  for (const p of parts) {
    if (typeof p === 'number') { const u = p >>> 0; byte(u); byte(u >>> 8); byte(u >>> 16); byte(u >>> 24); }
    else for (let i = 0; i < p.length; i++) { const c = p.charCodeAt(i); byte(c); byte(c >>> 8); }
    byte(0xff);
  }
  return h >>> 0;
}

// Both ends included, the same as getRandomNum in the original game.
export function randInt(rng: Rng, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}
