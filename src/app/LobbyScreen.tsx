import { useEffect, useState } from 'react';
import { MAX_PLAYERS, MIN_PLAYERS } from '../../shared/lobby/core';
import { DIM, SOFT } from '../game/colors';
import { menuSizes } from '../game/layout';
import type { Sound } from '../game/sound';
import type { SpriteSet } from '../game/sprites';
import type { SessionView } from '../net/session';
import { PixelButton } from '../ui/PixelButton';
import { PixelText } from '../ui/PixelText';
import { Reconnecting } from './Blinking';
import { copyText } from './copy';
import { MenuScreen, useViewportWidth } from './MenuScreen';
import { PlayerList } from './PlayerList';

export interface LobbyScreenProps {
  sprites: SpriteSet;
  sound: Sound;
  view: SessionView;
  onLeave(): void;
  onStart(): void;
}

// How long COPIED! stays after a tap on the code.
const COPIED_MS = 1500;

/**
 * LOBBY: the code to share, which a tap copies, who is in, and START for the host (WAITING FOR HOST... for everyone
 * else). START needs two players, and the lobby back from the last round's results. While the connection is down,
 * RECONNECTING... takes their place.
 */
export function LobbyScreen({ sprites, sound, view, onLeave, onStart }: LobbyScreenProps) {
  const vw = useViewportWidth();
  const sizes = menuSizes(vw);
  // Counts the copies, so a second tap while COPIED! shows keeps it up for the whole time again.
  const [copies, setCopies] = useState(0);
  useEffect(() => {
    if (copies === 0) return undefined;
    const id = window.setTimeout(() => setCopies(0), COPIED_MS);
    return () => window.clearTimeout(id);
  }, [copies]);
  const copy = async () => {
    if (await copyText(view.code)) setCopies((n) => n + 1);
  };
  const host = view.players.some((p) => p.id === view.you && p.host);
  const enough = view.players.filter((p) => p.connected).length >= MIN_PLAYERS;
  return (
    <MenuScreen
      testId="lobby-screen"
      sprites={sprites}
      sound={sound}
      back={{ label: '< LEAVE', onClick: onLeave, testId: 'btn-leave' }}
    >
      <PixelText text="LOBBY CODE" size={sizes.small} color={SOFT} />
      <button type="button" data-testid="lobby-code" className="lobby-code" onClick={() => void copy()}>
        <PixelText text={view.code} size={sizes.code} />
      </button>
      <span data-testid="copy-hint">
        <PixelText text={copies > 0 ? 'COPIED!' : 'TAP TO COPY'} size={sizes.small} color={SOFT} />
      </span>
      <span data-testid="players-count" className="players-count">
        <PixelText text={`PLAYERS ${view.players.length}/${MAX_PLAYERS}`} size={sizes.small} color={SOFT} />
      </span>
      <PlayerList players={view.players} heads={sprites.heads} size={sizes.body} />
      {view.status === 'reconnecting' ? (
        <Reconnecting size={sizes.body} color={SOFT} />
      ) : host ? (
        <>
          <div className="menu-button-wide" style={{ width: vw < 600 ? 230 : 260 }}>
            <PixelButton
              label={enough ? 'START' : 'NEED 2 PLAYERS'}
              variant="filled"
              onClick={onStart}
              disabled={!enough || view.phase !== 'lobby'}
              testId="btn-start"
            />
          </div>
          <span data-testid="host-note">
            <PixelText text="ONLY THE HOST CAN START" size={sizes.small} color={DIM} />
          </span>
        </>
      ) : (
        <span data-testid="waiting-host">
          <PixelText text="WAITING FOR HOST..." size={sizes.body} color={SOFT} />
        </span>
      )}
    </MenuScreen>
  );
}
