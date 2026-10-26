import { useState } from 'react';
import { SPEAKER_OFF, SPEAKER_ON } from '../game/bitmaps';
import type { Sound } from '../game/sound';
import { PixelIcon } from '../ui/PixelIcon';

/**
 * The speaker in the top right corner of every screen: sound on or off, remembered on the device. It is one of the
 * screen's own controls (data-ui), so the game never takes a tap on it, and a click does not keep the focus, so Space
 * goes on jumping instead of pressing it again.
 */
export function MuteButton({ sound }: { sound: Sound }) {
  const [muted, setMuted] = useState(() => sound.muted);
  const toggle = () => {
    sound.setMuted(!muted);
    setMuted(!muted);
  };
  return (
    <button
      type="button"
      className="mute-button"
      data-ui=""
      data-testid="btn-mute"
      aria-label={muted ? 'SOUND OFF' : 'SOUND ON'}
      onMouseDown={(e) => e.preventDefault()}
      onClick={toggle}
    >
      <PixelIcon rows={muted ? SPEAKER_OFF : SPEAKER_ON} size={2} />
    </button>
  );
}
