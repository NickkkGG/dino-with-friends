/** The symbols of a lobby code: A to Z and 2 to 9, without O, I, L, 0 and 1, which are easy to mix up. */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export const CODE_LENGTH = 6;

/** What is typed into the code boxes, as a code so far: capitals, nothing outside the alphabet, at most six. */
export function cleanCode(input: string): string {
  let code = '';
  for (const ch of input.toUpperCase()) {
    if (code.length === CODE_LENGTH) break;
    if (CODE_ALPHABET.includes(ch)) code += ch;
  }
  return code;
}

/** Whether a text is a whole lobby code as it is, without cleaning. */
export function isLobbyCode(s: string): boolean {
  if (s.length !== CODE_LENGTH) return false;
  for (const ch of s) if (!CODE_ALPHABET.includes(ch)) return false;
  return true;
}

/** A new code: six symbols, each picked by `pick(31)`, which returns a whole number from 0 to 30. */
export function makeCode(pick: (n: number) => number): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[pick(CODE_ALPHABET.length)]!;
  return code;
}
