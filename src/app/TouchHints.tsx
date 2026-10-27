import { DIM } from '../game/colors';
import type { Rect } from '../game/layout';
import { PixelText } from '../ui/PixelText';

export interface TouchHintsProps {
  /** The halves of the screen that duck (left) and jump (right). */
  zones: { left: Rect; right: Rect };
  /** A label is two lines on a screen held upright, one on a phone on its side. */
  portrait: boolean;
}

// The touch areas' dashed boxes sit this far in from the screen's edges, and half the gap from the middle.
const HINT_EDGE = 8;
const HINT_GAP = 8;

/** The touch areas, shown at the start of a round: HOLD TO DUCK on the left half, TAP TO JUMP on the right. */
export function TouchHints({ zones, portrait }: TouchHintsProps) {
  return (
    <div data-testid="touch-hints" className="touch-hints">
      <TouchHint zone={zones.left} side="left" portrait={portrait} text={['HOLD', 'TO DUCK']} />
      <TouchHint zone={zones.right} side="right" portrait={portrait} text={['TAP', 'TO JUMP']} />
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
