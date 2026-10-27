import { useEffect, useState } from 'react';
import { HAND } from '../game/bitmaps';
import { INK, SOFT } from '../game/colors';
import { mirror } from '../game/heads';
import type { Heads } from '../game/heads';
import { PEEK_SLOT_CELLS } from '../game/layout';
import { measureCells } from '../ui/font';
import { PixelIcon } from '../ui/PixelIcon';
import { PixelText } from '../ui/PixelText';
import { peekSlots } from './peek';
import type { Peeker } from './peek';
import { useBlinking } from './PlayerList';

export interface PeekRowProps {
  peekers: readonly Peeker[];
  heads: Heads;
  /** CSS pixels from the top of the screen to the first head's place. */
  top: number;
  /** CSS pixels per cell. */
  cell: number;
  /** How many heads show; the rest are counted in a +N under the last one. */
  max: number;
}

// A place's parts, in cells from the screen's right edge and from the place's top: the name's right end, the head's
// left end (its last columns are past the edge) and top, and the hands' left ends and tops, under the chin.
const NAME_RIGHT = 4;
const HEAD = { left: 20, top: 10 };
const HAND_LEFT = 6;
const HAND_TOPS = [27, 31] as const;
// A head that has left stays this long, sliding out past the edge, as a new one slides in.
const SLIDE_MS = 300;

const EDGE_HAND = mirror(HAND);

/** A head's place in the row: who it is, how far down, and whether they have left and the head is sliding out. */
interface Place {
  peeker: Peeker;
  index: number;
  leaving: boolean;
}

/** A head sliding out, until performance.now() is past `until`. */
interface Gone extends Place {
  until: number;
}

const idsOf = (peekers: readonly Peeker[]): string => peekers.map((p) => p.id).join(' ');

/** The places to draw: those on show, and for SLIDE_MS each one that has left, where it was. */
function usePlaces(shown: readonly Peeker[]): Place[] {
  const [last, setLast] = useState(shown);
  const [gone, setGone] = useState<readonly Gone[]>([]);
  if (idsOf(shown) !== idsOf(last)) {
    const ids = new Set(shown.map((p) => p.id));
    const until = performance.now() + SLIDE_MS;
    setLast(shown);
    setGone([
      ...gone.filter((g) => !ids.has(g.peeker.id)),
      ...last.flatMap((peeker, index) => (ids.has(peeker.id) ? [] : [{ peeker, index, leaving: true, until }])),
    ]);
  }
  useEffect(() => {
    if (gone.length === 0) return;
    const wait = Math.min(...gone.map((g) => g.until)) - performance.now();
    const id = window.setTimeout(() => {
      const now = performance.now();
      setGone((all) => all.filter((g) => g.until > now));
    }, Math.max(0, wait));
    return () => window.clearTimeout(id);
  }, [gone]);
  return [...shown.map((peeker, index) => ({ peeker, index, leaving: false })), ...gone];
}

function PeekPlace({ place, heads, cell }: { place: Place; heads: Heads; cell: number }) {
  const shut = useBlinking();
  const { peeker, index, leaving } = place;
  const at = (cells: number): string => `${cells * cell}px`;
  const head = shut ? heads.peekBlink : heads.peek;
  // Where a picture `width` cells wide goes for its left end to be `left` cells from the edge.
  const fromEdge = (left: number, width: number, top: number) => ({ right: at(left - width), top: at(top) });
  return (
    <div
      data-testid="peek-slot"
      data-player-id={peeker.id}
      data-me={peeker.me}
      className="peek-slot"
      style={{
        width: at(Math.max(HEAD.left, NAME_RIGHT + measureCells(peeker.name))),
        height: at(PEEK_SLOT_CELLS),
        transform: `translateY(${index * PEEK_SLOT_CELLS * cell}px)`,
      }}
    >
      <div className={leaving ? 'peek-slide leaving' : 'peek-slide'}>
        <span className="peek-part" style={{ right: at(NAME_RIGHT), top: 0 }}>
          <PixelText text={peeker.name} size={cell} color={peeker.me ? INK : SOFT} />
        </span>
        <span className="peek-part" style={fromEdge(HEAD.left, head[0]?.length ?? 0, HEAD.top)}>
          <PixelIcon rows={head} size={cell} />
        </span>
        {HAND_TOPS.map((top) => (
          <span key={top} className="peek-part" style={fromEdge(HAND_LEFT, EDGE_HAND[0]!.length, top)}>
            <PixelIcon rows={EDGE_HAND} size={cell} />
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * The heads of those watching this screen, peeking in from the right edge one under the other, each with its name: a
 * head slides in when they start watching and out when they stop, and the ones under it move up. Past `max` the rest
 * are a +N under the last head. Touches go through it to the game.
 */
export function PeekRow({ peekers, heads, top, cell, max }: PeekRowProps) {
  const { shown, more } = peekSlots(peekers, max);
  const places = usePlaces(shown);
  return (
    <div data-testid="peek-row" className="peek-row" style={{ top }}>
      {places.map((place) => (
        <PeekPlace key={place.peeker.id} place={place} heads={heads} cell={cell} />
      ))}
      {more > 0 && (
        <span
          data-testid="peek-more"
          className="peek-more"
          style={{ right: `${NAME_RIGHT * cell}px`, transform: `translateY(${shown.length * PEEK_SLOT_CELLS * cell}px)` }}
        >
          <PixelText text={`+${more}`} size={cell} color={SOFT} />
        </span>
      )}
    </div>
  );
}
