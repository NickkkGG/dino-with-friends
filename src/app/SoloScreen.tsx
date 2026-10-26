import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { DIM, SOFT } from '../game/colors';
import { soloLayout } from '../game/layout';
import type { Rect } from '../game/layout';
import { SoloGame } from '../game/solo';
import type { SoloView } from '../game/solo';
import type { Sound } from '../game/sound';
import type { SpriteSet } from '../game/sprites';
import type { TestMode } from '../game/test-mode';
import { FONT_CELL, FONT_ROWS } from '../ui/font';
import { PixelButton } from '../ui/PixelButton';
import { PixelText, useDevicePixelRatio } from '../ui/PixelText';

export interface SoloScreenProps {
  sprites: SpriteSet;
  sound: Sound;
  testMode: TestMode;
  onMenu(): void;
}

const FIRST_VIEW: SoloView = { phase: 'waiting', inverted: false, hints: false, deadMs: 0 };
// The touch areas' dashed boxes sit this far in from the screen's edges, and half the gap from the middle.
const HINT_EDGE = 8;
const HINT_GAP = 8;

const viewport = () => ({ w: window.innerWidth, h: window.innerHeight });

/** SOLO: the game canvas, the HUD strip on a portrait screen, the start text, MENU after a crash, and the touch hints. */
export function SoloScreen({ sprites, sound, testMode, onMenu }: SoloScreenProps) {
  const surface = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const hudCanvas = useRef<HTMLCanvasElement>(null);
  const game = useRef<SoloGame | null>(null);
  const [coarse] = useState(() => window.matchMedia('(pointer: coarse)').matches);
  const [size, setSize] = useState(viewport);
  const [view, setView] = useState(FIRST_VIEW);
  const dpr = useDevicePixelRatio();
  const layout = useMemo(() => soloLayout(size.w, size.h, coarse), [size, coarse]);

  useEffect(() => {
    const g = new SoloGame({
      canvas: canvas.current!, hudCanvas: hudCanvas.current!, surface: surface.current!,
      sprites, sound, coarse, testMode, onView: setView,
    });
    game.current = g;
    g.start();
    return () => {
      g.dispose();
      game.current = null;
    };
  }, [sprites, sound, coarse, testMode]);

  useEffect(() => {
    game.current?.setLayout(layout, dpr);
  }, [layout, dpr]);

  useEffect(() => {
    const onResize = () => setSize(viewport());
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);

  const snap = (v: number) => Math.round(v * dpr) / dpr;
  const at = (r: Rect): CSSProperties => ({ position: 'absolute', left: snap(r.x), top: snap(r.y) });
  // The line under the canvas, or over it when the world sits on the bottom edge (a phone on its side).
  const textSize = Math.max(2, layout.scale * FONT_CELL);
  const textH = FONT_ROWS * textSize;
  const lineTop = layout.below + textH + 16 <= size.h ? layout.below : Math.max(8, layout.canvas.y - 16 - textH);

  return (
    <div ref={surface} data-testid="solo-screen" className={view.inverted ? 'solo-screen inverted' : 'solo-screen'}>
      <canvas ref={hudCanvas} data-testid="solo-hud-canvas" style={layout.hud ? at(layout.hud) : { display: 'none' }} />
      <canvas ref={canvas} data-testid="solo-canvas" style={at(layout.canvas)} />
      {view.phase === 'waiting' && (
        <div data-testid="start-text" className="solo-line" style={{ top: snap(lineTop) }}>
          <PixelText text={coarse ? 'TAP TO START' : 'PRESS SPACE TO START'} size={textSize} color={SOFT} />
        </div>
      )}
      {view.phase === 'dead' && (
        <div className="solo-line" style={{ top: snap(lineTop) }}>
          <span data-ui>
            <PixelButton label="MENU" variant="outline" onClick={onMenu} testId="btn-menu" />
          </span>
        </div>
      )}
      {view.hints && layout.zones && (
        <div data-testid="touch-hints" className="touch-hints">
          <TouchHint zone={layout.zones.left} side="left" portrait={layout.mode === 'portrait'} text={['HOLD', 'TO DUCK']} />
          <TouchHint zone={layout.zones.right} side="right" portrait={layout.mode === 'portrait'} text={['TAP', 'TO JUMP']} />
        </div>
      )}
    </div>
  );
}

interface TouchHintProps {
  zone: Rect;
  side: 'left' | 'right';
  portrait: boolean;
  /** The label in two parts: two lines in portrait, one line on a phone on its side. */
  text: [string, string];
}

// One touch area: a dashed box with its label in the middle (portrait) or at the top.
function TouchHint({ zone, side, portrait, text }: TouchHintProps) {
  const left = zone.x + (side === 'left' ? HINT_EDGE : HINT_GAP / 2);
  const w = zone.w - HINT_EDGE - HINT_GAP / 2;
  const h = zone.h - HINT_EDGE;
  const lines = portrait ? text : [text.join(' ')];
  return (
    <div className="touch-hint" style={{ left, top: zone.y, width: w, height: h }}>
      <svg width={w} height={h} aria-hidden="true">
        <rect
          x={0.5} y={0.5} width={w - 1} height={h - 1}
          fill="none" stroke={DIM} strokeWidth={1} strokeDasharray="3 3" shapeRendering="crispEdges"
        />
      </svg>
      <div className="touch-hint-label" style={portrait ? { top: '50%', transform: 'translateY(-50%)' } : { top: 10 }}>
        {lines.map((t) => <PixelText key={t} text={t} size={1.5} color={DIM} />)}
      </div>
    </div>
  );
}
