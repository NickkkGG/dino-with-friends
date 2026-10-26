import type { CSSProperties } from 'react';
import { INK, PAPER } from '../game/colors';
import { PixelText } from './PixelText';

export interface PixelButtonProps {
  label: string;
  onClick: () => void;
  /** Filled is the main button of a screen; outline is the rest. */
  variant: 'outline' | 'filled';
  /** CSS pixels per cell of the label. */
  size?: number;
  disabled?: boolean;
  testId?: string;
}

/** A real button, so Tab, Enter and Space work, with a 2 px ink border and its label in the pixel font. */
export function PixelButton({ label, onClick, variant, size = 2, disabled = false, testId }: PixelButtonProps) {
  const filled = variant === 'filled';
  const style: CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box', margin: 0,
    padding: '6px 14px', border: `2px solid ${INK}`, borderRadius: 0, background: filled ? INK : PAPER, lineHeight: 0,
    cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.4 : 1, appearance: 'none',
  };
  return (
    <button type="button" data-testid={testId} disabled={disabled} onClick={onClick} style={style}>
      <PixelText text={label} size={size} color={filled ? PAPER : INK} />
    </button>
  );
}
