import { useEffect, useRef, useState } from 'react';
import { SPRITE_2X_URL, loadImage } from '../../game/assets';
import { FAINT, INK, PAPER } from '../../game/colors';
import { HDPI_POS } from '../../game/sprite-defs';
import { GLYPHS } from '../../ui/font';
import { PixelButton } from '../../ui/PixelButton';
import { PixelText } from '../../ui/PixelText';
import { GAME_TEXTS } from './game-texts';

// A dev page for checking the pixel font by eye: every glyph, the original digits and GAME OVER at the font's scale,
// every text of the design, and the two kinds of button.

const ZOOM = 2; // CSS pixels per pixel of the 2x sprite, so a font cell (3 sprite pixels) is 6 CSS pixels
const CELL = 3 * ZOOM;

// In the 2x text sprite the digits 0-9, H and I are 20 × 26 each, side by side; GAME OVER is 382 × 22, 26 lower.
const DIGITS_W = 12 * 20;
const OVER_W = 382;

function drawOriginals(canvas: HTMLCanvasElement, img: HTMLImageElement): void {
  const { x, y } = HDPI_POS.textSprite;
  canvas.width = OVER_W * ZOOM;
  canvas.height = (26 + 12 + 22) * ZOOM;
  canvas.style.width = `${canvas.width}px`;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, x, y, DIGITS_W, 26, 0, 0, DIGITS_W * ZOOM, 26 * ZOOM);
  ctx.drawImage(img, x, y + 26, OVER_W, 22, 0, 38 * ZOOM, OVER_W * ZOOM, 22 * ZOOM);
}

export function GlyphSheetView() {
  const originals = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let live = true;
    void loadImage(SPRITE_2X_URL).then((img) => {
      if (!live || !originals.current) return;
      drawOriginals(originals.current, img);
      setReady(true);
    });
    return () => {
      live = false;
    };
  }, []);

  const label = { margin: '24px 0 10px', font: '14px/1.4 monospace', color: INK } as const;
  const row = { display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end' } as const;
  return (
    <div style={{ height: '100vh', overflow: 'auto', background: PAPER }}>
      <div data-testid="glyph-sheet" data-ready={ready} style={{ padding: '0 16px 24px', width: 1400 }}>
        <p style={label}>Every glyph, {CELL} px per cell.</p>
        <div style={row}>
          {Object.keys(GLYPHS).map((ch) => (
            <span key={ch} style={{ padding: CELL, border: `1px solid ${FAINT}` }}>
              <PixelText text={ch} size={CELL} />
            </span>
          ))}
        </div>
        <p style={label}>The original digits, H, I and GAME OVER (2x sprite, zoom {ZOOM}), then the font at the same scale.</p>
        <canvas ref={originals} style={{ display: 'block', imageRendering: 'pixelated' }} />
        <div style={{ ...row, marginTop: 16, gap: 40 }}>
          <PixelText text="0123456789 HI" size={CELL} />
          <PixelText text="GAME OVER" size={CELL} />
        </div>
        <p style={label}>Every text of the design, 2 px per cell.</p>
        <div style={{ columns: 2, columnGap: 40 }}>
          {GAME_TEXTS.map((text) => (
            <div key={text} style={{ marginBottom: 10, breakInside: 'avoid' }}>
              <PixelText text={text} size={2} />
            </div>
          ))}
        </div>
        <p style={label}>Buttons: outline, filled, filled and disabled.</p>
        <div style={{ ...row, gap: 16 }}>
          <PixelButton label="SOLO" variant="outline" onClick={() => undefined} />
          <PixelButton label="MULTIPLAYER" variant="filled" onClick={() => undefined} />
          <PixelButton label="START" variant="filled" size={2.5} disabled onClick={() => undefined} />
        </div>
      </div>
    </div>
  );
}
