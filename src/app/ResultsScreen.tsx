import { useEffect, useState } from 'react';
import type { ResultRow } from '../../shared/lobby/protocol';
import { SOFT } from '../game/colors';
import { menuSizes } from '../game/layout';
import type { Sound } from '../game/sound';
import type { SpriteSet } from '../game/sprites';
import { PixelButton } from '../ui/PixelButton';
import { PixelText } from '../ui/PixelText';
import { Leaderboard } from './Leaderboard';
import type { BoardRow } from './Leaderboard';
import { MenuScreen, useViewportWidth } from './MenuScreen';

export interface ResultsScreenProps {
  sprites: SpriteSet;
  sound: Sound;
  end: { round: number; results: readonly ResultRow[] };
  /** This player's id, whose line is lit. */
  you: string | null;
  onBack(): void;
}

/** The results stay this many seconds before the lobby comes back by itself, as long as the lobby shows them. */
const AUTO_BACK_S = 5;

/**
 * The end of a round: who won, everyone's final place, and the way back to the lobby, which comes by itself after
 * AUTO_BACK_S seconds. Under it all the winner's dino hops.
 */
export function ResultsScreen({ sprites, sound, end, you, onBack }: ResultsScreenProps) {
  const vw = useViewportWidth();
  const sizes = menuSizes(vw);
  const [left, setLeft] = useState(AUTO_BACK_S);

  useEffect(() => {
    const id = window.setInterval(() => setLeft((n) => n - 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (left <= 0) onBack();
  }, [left, onBack]);

  const winner = end.results[0];
  const rows: BoardRow[] = end.results.map((r) => ({ id: r.id, name: r.name, score: r.score, alive: true, me: r.id === you }));
  return (
    <MenuScreen testId="results-screen" sprites={sprites} sound={sound} hop>
      <span data-testid="results-title">
        <PixelText text={`ROUND ${end.round} RESULTS`} size={sizes.small} color={SOFT} />
      </span>
      {winner && (
        <span data-testid="winner">
          <PixelText text={`${winner.name} WINS!`} size={sizes.title * 1.4} />
        </span>
      )}
      <Leaderboard
        title="" rows={rows} heads={sprites.heads} cell={sizes.body} mode="results" testId="results-board"
        rowTestId="result-row"
      />
      <div className="menu-button-wide" style={{ width: vw < 600 ? 230 : 260 }}>
        <PixelButton label="BACK TO LOBBY" variant="filled" onClick={onBack} testId="btn-back-to-lobby" />
      </div>
      <span data-testid="auto-back">
        <PixelText text={`AUTOMATIC IN ${Math.max(1, left)}`} size={sizes.small} color={SOFT} />
      </span>
    </MenuScreen>
  );
}
