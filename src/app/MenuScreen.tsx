import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { Sound } from '../game/sound';
import type { SpriteSet } from '../game/sprites';
import { PixelText } from '../ui/PixelText';
import { IdleStrip } from './IdleStrip';
import { MuteButton } from './MuteButton';

export interface MenuScreenProps {
  testId: string;
  sprites: SpriteSet;
  sound: Sound;
  /** The way back, in the top left corner. */
  back?: { label: string; onClick(): void; testId: string };
  children: ReactNode;
}

// The middle column is at most this wide on a phone held upright (narrower than 600) and on anything wider.
const COLUMN_PHONE = 360;
const COLUMN_WIDE = 480;
// The idle strip at the bottom is at most this wide, with 16 px on each side.
const STRIP = 720;

/** The window's width in CSS pixels, kept current. */
export function useViewportWidth(): number {
  const [vw, setVw] = useState(() => window.innerWidth);
  useEffect(() => {
    const onResize = () => setVw(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return vw;
}

const BLINK_MS = 500;

/** Whether a blinking cursor shows now: it is on and off for BLINK_MS each. */
export function useBlink(): boolean {
  const [on, setOn] = useState(true);
  useEffect(() => {
    const id = window.setInterval(() => setOn((v) => !v), BLINK_MS);
    return () => window.clearInterval(id);
  }, []);
  return on;
}

/**
 * A menu screen: the way back in the top left, the screen's own column in the middle (scrolling if the window is too
 * short for it), the idle strip along the bottom, and the speaker.
 */
export function MenuScreen({ testId, sprites, sound, back, children }: MenuScreenProps) {
  const phone = useViewportWidth() < 600;
  return (
    <div data-testid={testId} className="menu-screen">
      {back && (
        <button type="button" className="text-button menu-back" data-testid={back.testId} onClick={back.onClick}>
          <PixelText text={back.label} size={phone ? 1.5 : 2} />
        </button>
      )}
      <div className="menu-middle">
        <div className="menu-column" style={{ maxWidth: phone ? COLUMN_PHONE : COLUMN_WIDE }}>
          {children}
        </div>
      </div>
      <div className="menu-strip" style={{ maxWidth: STRIP }}>
        <IdleStrip sprites={sprites} />
      </div>
      <MuteButton sound={sound} />
    </div>
  );
}
