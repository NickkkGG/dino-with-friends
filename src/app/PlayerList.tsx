import { useEffect, useState } from 'react';
import type { LobbyPlayer } from '../../shared/lobby/protocol';
import { SOFT } from '../game/colors';
import type { Heads } from '../game/heads';
import { PixelIcon } from '../ui/PixelIcon';
import { PixelText } from '../ui/PixelText';

export interface PlayerListProps {
  players: readonly LobbyPlayer[];
  heads: Heads;
  /** CSS pixels per cell of the names; the heads and HOST are three quarters of it. */
  size: number;
}

// A head shuts its eyes for BLINK_MS, every 2 to 6 seconds, each on its own time.
const BLINK_MS = 150;
const OPEN_MIN_MS = 2000;
const OPEN_MAX_MS = 6000;

/** Whether a head has its eyes shut now: for a moment every few seconds, on its own time. */
export function useBlinking(): boolean {
  const [shut, setShut] = useState(false);
  useEffect(() => {
    let id = 0;
    const open = () => {
      setShut(false);
      id = window.setTimeout(close, OPEN_MIN_MS + Math.random() * (OPEN_MAX_MS - OPEN_MIN_MS));
    };
    const close = () => {
      setShut(true);
      id = window.setTimeout(open, BLINK_MS);
    };
    open();
    return () => window.clearTimeout(id);
  }, []);
  return shut;
}

function PlayerLine({ player, heads, size }: { player: LobbyPlayer; heads: Heads; size: number }) {
  const shut = useBlinking();
  return (
    <div data-testid="player-row" data-player-id={player.id} data-host={player.host} className="player-row">
      <PixelIcon rows={shut ? heads.blink : heads.alive} size={size * 0.75} />
      <PixelText text={player.name} size={size} />
      {player.host && (
        <span className="player-host">
          <PixelText text="HOST" size={size * 0.75} color={SOFT} />
        </span>
      )}
    </div>
  );
}

/** Who is in the lobby, in the order they came in: a head, the name, and HOST on the host's line. */
export function PlayerList({ players, heads, size }: PlayerListProps) {
  return (
    <div className="player-list">
      {players.map((p) => (
        <PlayerLine key={p.id} player={p} heads={heads} size={size} />
      ))}
    </div>
  );
}
