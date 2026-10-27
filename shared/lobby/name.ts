export const NAME_MAX = 10;

const NAME_CHARS = /^[A-Z0-9]$/;

/** A player's name as the game shows it: capitals, only A to Z and 0 to 9, at most ten. Anything else is left out. */
export function cleanName(input: string): string {
  let name = '';
  for (const ch of input.toUpperCase()) {
    if (name.length === NAME_MAX) break;
    if (NAME_CHARS.test(ch)) name += ch;
  }
  return name;
}

/**
 * A name nobody in `taken` has: the name itself, or with 2, 3 and so on after it. A name with no room for the number
 * gives up its last characters to it, so it stays at most ten.
 */
export function uniqueName(name: string, taken: readonly string[]): string {
  if (!taken.includes(name)) return name;
  for (let n = 2; ; n++) {
    const suffix = String(n);
    const candidate = name.length + suffix.length <= NAME_MAX ? name + suffix : name.slice(0, NAME_MAX - suffix.length) + suffix;
    if (!taken.includes(candidate)) return candidate;
  }
}
