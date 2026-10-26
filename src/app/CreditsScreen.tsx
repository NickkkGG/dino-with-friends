import { useEffect, useState } from 'react';
import { CHROMIUM_LICENSE } from '../game/assets';
import { SOFT } from '../game/colors';
import type { SpriteSet } from '../game/sprites';
import { wrapText } from '../ui/font';
import { PixelText, useDevicePixelRatio } from '../ui/PixelText';
import { IdleStrip } from './IdleStrip';

// The credits, a paragraph each, broken into lines that fit the column.
const PARAGRAPHS: readonly (readonly string[])[] = [
  ['MADE BY NICKKKGG'],
  ['BASED ON THE OFFLINE DINO GAME FROM CHROMIUM.'],
  ['ORIGINAL CODE, SPRITES AND SOUNDS', 'COPYRIGHT THE CHROMIUM AUTHORS'],
];
// The column is at most this wide, with 16 px on each side.
const COLUMN = 720;
const PADDING = 16;

/**
 * CREDITS: who made the game, the original it is built on, and the Chromium license in full, scrolling over the idle
 * strip, which stays at the bottom.
 */
export function CreditsScreen({ sprites, onBack }: { sprites: SpriteSet; onBack(): void }) {
  const dpr = useDevicePixelRatio();
  const [vw, setVw] = useState(() => window.innerWidth);
  useEffect(() => {
    const onResize = () => setVw(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const size = vw < 600 ? 1.5 : 2;
  // PixelText rounds a cell to whole device pixels, so a line is measured at the cell it is really drawn at.
  const cell = Math.max(1, Math.round(size * dpr)) / dpr;
  const maxCells = Math.floor((Math.min(vw, COLUMN) - 2 * PADDING) / cell);
  return (
    <div data-testid="credits-screen" className="credits-screen">
      <button type="button" className="text-button credits-back" data-testid="btn-back" onClick={onBack}>
        <PixelText text="< BACK" size={size} />
      </button>
      <div className="credits-scroll">
        <div className="credits-column" style={{ maxWidth: COLUMN, padding: `64px ${PADDING}px 24px` }}>
          <PixelText text="CREDITS" size={size * 2} />
          <div className="title-logo">
            <PixelText text="DINO" size={size * 1.5} />
            <PixelText text="with" size={size * 0.75} color={SOFT} />
            <PixelText text="FRIENDS" size={size * 1.5} />
          </div>
          {PARAGRAPHS.map((lines) => (
            <div key={lines[0]} className="credits-lines">
              {lines.flatMap((line) => wrapText(line, maxCells)).map((l) => (
                <PixelText key={l} text={l} size={size} />
              ))}
            </div>
          ))}
          <pre data-testid="license-text" className="license-text">{CHROMIUM_LICENSE}</pre>
        </div>
      </div>
      <div className="credits-strip" style={{ maxWidth: COLUMN, padding: `0 ${PADDING}px` }}>
        <IdleStrip sprites={sprites} />
      </div>
    </div>
  );
}
