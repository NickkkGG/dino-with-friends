import { useState } from 'react';
import { NAME_MAX, cleanName } from '../../shared/lobby/name';
import { SOFT } from '../game/colors';
import { menuSizes } from '../game/layout';
import type { Sound } from '../game/sound';
import type { SpriteSet } from '../game/sprites';
import { HiddenInput } from '../ui/HiddenInput';
import { PixelButton } from '../ui/PixelButton';
import { PixelText } from '../ui/PixelText';
import { MenuScreen, useBlink, useViewportWidth } from './MenuScreen';

export interface NameScreenProps {
  sprites: SpriteSet;
  sound: Sound;
  /** The name to start from: the one saved, when it is being changed. */
  initial: string;
  onBack(): void;
  onDone(name: string): void;
}

// The letters in the box, in CSS pixels per cell.
const BOX_TEXT = 3;

/** YOUR NAME: the name in a box, cleaned as it is typed, and OK once there is one. */
export function NameScreen({ sprites, sound, initial, onBack, onDone }: NameScreenProps) {
  const vw = useViewportWidth();
  const sizes = menuSizes(vw);
  const [name, setName] = useState(() => cleanName(initial));
  const blink = useBlink();
  const ok = () => {
    if (name !== '') onDone(name);
  };
  return (
    <MenuScreen
      testId="name-screen"
      sprites={sprites}
      sound={sound}
      back={{ label: '< BACK', onClick: onBack, testId: 'btn-back' }}
    >
      <PixelText text="YOUR NAME" size={sizes.title} />
      <div data-testid="name-box" className="name-box" style={{ minWidth: vw < 600 ? 240 : 280 }}>
        <PixelText text={name} size={BOX_TEXT} />
        {name.length < NAME_MAX && (
          <span className="cursor" style={{ visibility: blink ? 'visible' : 'hidden' }}>
            <PixelText text="_" size={BOX_TEXT} />
          </span>
        )}
        <HiddenInput value={name} onChange={(raw) => setName(cleanName(raw))} onEnter={ok} testId="name-input" autoFocus />
      </div>
      <PixelText text="UP TO 10 LETTERS OR NUMBERS" size={sizes.small} color={SOFT} />
      <div className="menu-button-narrow">
        <PixelButton label="OK" variant="filled" onClick={ok} disabled={name === ''} testId="btn-ok" />
      </div>
    </MenuScreen>
  );
}
