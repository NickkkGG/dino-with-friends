import type { SessionView } from '../net/session';

/** The results on show: the last round's, until the player leaves them or the next round's countdown has come. */
export function resultsOnShow(
  end: SessionView['end'],
  closed: number,
  countdown: SessionView['countdown'],
): SessionView['end'] {
  if (end === null || end.round <= closed) return null;
  if (countdown !== null && countdown.round > end.round) return null;
  return end;
}
