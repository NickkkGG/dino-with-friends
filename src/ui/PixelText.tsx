import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { INK } from '../game/colors';
import { FONT_CELL, FONT_ROWS, drawText, measureCells } from './font';

export interface PixelTextProps {
  text: string;
  /** CSS pixels per cell. */
  size: number;
  color?: string;
  className?: string;
}

const WRAP: CSSProperties = { display: 'inline-block', position: 'relative', lineHeight: 0, verticalAlign: 'middle' };
const CANVAS: CSSProperties = { display: 'block', imageRendering: 'pixelated' };

// Out of sight, but read by screen readers (and found by its text in the browser tests).
const VISUALLY_HIDDEN: CSSProperties = {
  position: 'absolute', top: 0, left: 0, width: 1, height: 1, margin: -1, padding: 0, border: 0, overflow: 'hidden',
  clipPath: 'inset(50%)', whiteSpace: 'nowrap',
};

/** The device pixel ratio, kept current when the window moves to another screen or the page is zoomed. */
export function useDevicePixelRatio(): number {
  const [dpr, setDpr] = useState(() => window.devicePixelRatio || 1);
  useEffect(() => {
    const query = window.matchMedia(`(resolution: ${dpr}dppx)`);
    const update = () => setDpr(window.devicePixelRatio || 1);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, [dpr]);
  return dpr;
}

/**
 * Text in the pixel font, drawn on a canvas in whole device pixels: a cell is max(1, round(size × dpr)) of them, and
 * the canvas is shown at that size divided by dpr. The text is in the page too, out of sight.
 */
export function PixelText({ text, size, color = INK, className }: PixelTextProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const dpr = useDevicePixelRatio();

  useLayoutEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const cell = Math.max(1, Math.round(size * dpr));
    canvas.width = measureCells(text) * cell;
    canvas.height = FONT_ROWS * cell;
    canvas.style.width = `${canvas.width / dpr}px`;
    canvas.style.height = `${canvas.height / dpr}px`;
    const ctx = canvas.getContext('2d');
    if (ctx) drawText({ ctx, k: cell / FONT_CELL, oy: 0 }, text, 0, 0, color);
  }, [text, size, color, dpr]);

  return (
    <span className={className} style={WRAP}>
      <canvas ref={ref} aria-hidden="true" style={CANVAS} />
      <span style={VISUALLY_HIDDEN}>{text}</span>
    </span>
  );
}
