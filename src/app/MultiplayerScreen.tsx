import { useState } from 'react';
import { CODE_LENGTH, cleanCode } from '../../shared/lobby/code';
import { SOFT } from '../game/colors';
import { menuSizes } from '../game/layout';
import type { Sound } from '../game/sound';
import type { SpriteSet } from '../game/sprites';
import type { SessionError } from '../net/session';
import { HiddenInput } from '../ui/HiddenInput';
import { PixelButton } from '../ui/PixelButton';
import { PixelText } from '../ui/PixelText';
import { MenuScreen, useBlink, useViewportWidth } from './MenuScreen';

export interface MultiplayerScreenProps {
  sprites: SpriteSet;
  sound: Sound;
  name: string;
  /** A lobby is being made or joined, so neither button may start another. */
  busy: boolean;
  error: SessionError | null;
  onBack(): void;
  onRename(): void;
  onCreate(): void;
  onJoin(code: string): void;
  /** Does the last of CREATE and JOIN again. */
  onRetry(): void;
}

const ERROR_TEXT: Readonly<Record<SessionError, string>> = {
  CANT_CONNECT: "CAN'T CONNECT",
  LOBBY_NOT_FOUND: 'LOBBY NOT FOUND',
  LOBBY_FULL: 'LOBBY IS FULL',
  CONNECTION_LOST: 'CONNECTION LOST',
};

// The letters in the code boxes, in CSS pixels per cell.
const BOX_TEXT = 3;

/** MULTIPLAYER: who is playing, CREATE LOBBY, or JOIN WITH CODE in six boxes, and what went wrong, if anything. */
export function MultiplayerScreen(p: MultiplayerScreenProps) {
  const vw = useViewportWidth();
  const sizes = menuSizes(vw);
  const [code, setCode] = useState('');
  const blink = useBlink();
  const canJoin = code.length === CODE_LENGTH && !p.busy;
  const join = () => {
    if (canJoin) p.onJoin(code);
  };
  const retry = p.error === 'CANT_CONNECT' || p.error === 'CONNECTION_LOST';
  return (
    <MenuScreen
      testId="multiplayer-screen"
      sprites={p.sprites}
      sound={p.sound}
      back={{ label: '< BACK', onClick: p.onBack, testId: 'btn-back' }}
    >
      <PixelText text="MULTIPLAYER" size={sizes.title} />
      <button type="button" className="text-button" data-testid="btn-rename" onClick={p.onRename}>
        <PixelText text={`PLAYING AS ${p.name}`} size={sizes.small} color={SOFT} />
      </button>
      <div className="menu-button-wide" style={{ width: vw < 600 ? 230 : 260 }}>
        <PixelButton label="CREATE LOBBY" variant="filled" onClick={p.onCreate} disabled={p.busy} testId="btn-create" />
      </div>
      <div className="menu-or">
        <span className="menu-or-line" />
        <PixelText text="OR" size={sizes.small} color={SOFT} />
        <span className="menu-or-line" />
      </div>
      <PixelText text="JOIN WITH CODE" size={sizes.body} />
      <div className="code-boxes">
        {Array.from({ length: CODE_LENGTH }, (_, i) => {
          const ch = code[i];
          return (
            <div key={i} data-testid={`code-box-${i}`} className="code-box">
              {ch !== undefined && <PixelText text={ch} size={BOX_TEXT} />}
              {ch === undefined && i === code.length && (
                <span className="cursor" style={{ visibility: blink ? 'visible' : 'hidden' }}>
                  <PixelText text="_" size={BOX_TEXT} />
                </span>
              )}
            </div>
          );
        })}
        <HiddenInput value={code} onChange={(raw) => setCode(cleanCode(raw))} onEnter={join} testId="code-input" />
      </div>
      <div className="menu-button-narrow">
        <PixelButton label="JOIN" variant="outline" onClick={join} disabled={!canJoin} testId="btn-join" />
      </div>
      {p.error && (
        <div data-testid="mp-error" className="mp-error">
          <PixelText text={ERROR_TEXT[p.error]} size={sizes.body} />
          {retry && <PixelButton label="TRY AGAIN" variant="outline" onClick={p.onRetry} testId="btn-retry" />}
        </div>
      )}
    </MenuScreen>
  );
}
