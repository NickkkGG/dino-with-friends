import { useLayoutEffect, useRef } from 'react';
import { INK } from '../game/colors';
import { fillCells } from '../game/draw/context';
import { useDevicePixelRatio } from './PixelText';

export interface PixelIconProps {
  /** The bitmap: rows of '#' and '.'. */
  rows: readonly string[];
  /** CSS pixels per cell. */
  size: number;
  color?: string;
}

/** A bitmap drawn in whole device pixels, as PixelText draws its letters. */
export function PixelIcon({ rows, size, color = INK }: PixelIconProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const dpr = useDevicePixelRatio();

  useLayoutEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const cell = Math.max(1, Math.round(size * dpr));
    canvas.width = rows[0]!.length * cell;
    canvas.height = rows.length * cell;
    canvas.style.width = `${canvas.width / dpr}px`;
    canvas.style.height = `${canvas.height / dpr}px`;
    const ctx = canvas.getContext('2d');
    if (ctx) fillCells({ ctx, k: cell, oy: 0 }, rows, 0, 0, color);
  }, [rows, size, color, dpr]);

  return <canvas ref={ref} aria-hidden="true" style={{ display: 'block', imageRendering: 'pixelated' }} />;
}
