import type { ReactNode } from 'react';
import { INK } from '../game/colors';
import { PixelText } from '../ui/PixelText';
import { useBlink } from './MenuScreen';

/** What it holds, shown and hidden in turn every half second; it keeps its place while hidden. */
export function Blinking({ children }: { children: ReactNode }) {
  const on = useBlink();
  return (
    <span className="blinking" style={{ visibility: on ? 'visible' : 'hidden' }}>
      {children}
    </span>
  );
}

/** RECONNECTING..., blinking, while the session tries to get its seat back. */
export function Reconnecting({ size, color = INK }: { size: number; color?: string }) {
  return (
    <span data-testid="reconnecting" className="reconnecting">
      <Blinking>
        <PixelText text="RECONNECTING..." size={size} color={color} />
      </Blinking>
    </span>
  );
}
