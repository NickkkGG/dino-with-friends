/** Where the best score is kept. */
export const HI_KEY = 'dwf.hi';

/** How long after a crash the jump keys and taps restart, as the original's gameoverClearTime. Enter restarts at once. */
export const RESTART_DELAY_MS = 1200;

export function canRestart(kind: 'enter' | 'jumpKey' | 'pointer', msSinceDeath: number): boolean {
  return kind === 'enter' || msSinceDeath >= RESTART_DELAY_MS;
}

/** The best score after a round that ended on `score`. */
export function nextHi(hi: number, score: number): number {
  return Math.max(hi, score);
}
