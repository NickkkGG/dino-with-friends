import { menuSizes } from '../game/layout';
import type { Sound } from '../game/sound';
import type { SpriteSet } from '../game/sprites';
import type { SessionView } from '../net/session';
import { PixelText } from '../ui/PixelText';
import { MenuScreen, useViewportWidth } from './MenuScreen';

export interface LobbyScreenProps {
  sprites: SpriteSet;
  sound: Sound;
  view: SessionView;
  onLeave(): void;
}

/** LOBBY: the code to share and who is in. */
export function LobbyScreen({ sprites, sound, view, onLeave }: LobbyScreenProps) {
  const sizes = menuSizes(useViewportWidth());
  return (
    <MenuScreen
      testId="lobby-screen"
      sprites={sprites}
      sound={sound}
      back={{ label: '< LEAVE', onClick: onLeave, testId: 'btn-leave' }}
    >
      <span data-testid="lobby-code">
        <PixelText text={view.code} size={sizes.code} />
      </span>
      {view.players.map((p) => (
        <PixelText key={p.id} text={p.name} size={sizes.body} />
      ))}
    </MenuScreen>
  );
}
