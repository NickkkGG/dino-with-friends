import { DIM, INK, PAPER, SOFT } from '../game/colors';
import type { Heads } from '../game/heads';
import { BOARD_CELLS, boardHeightCells } from '../game/layout';
import { measureCells } from '../ui/font';
import { PixelIcon } from '../ui/PixelIcon';
import { PixelText } from '../ui/PixelText';
import { Blinking } from './Blinking';

/** One line of a leaderboard. */
export interface BoardRow {
  id: string;
  name: string;
  score: number;
  alive: boolean;
  /** This player's own line. */
  me: boolean;
}

export interface LeaderboardProps {
  title: string;
  /** First place first. */
  rows: readonly BoardRow[];
  heads: Heads;
  /** CSS pixels per cell: a whole number of device pixels, so the text and the boxes line up. */
  cell: number;
  /** During a race the players who are out are dimmed, and the own line is lit only while it runs. */
  mode: 'race' | 'results';
  testId: string;
  rowTestId?: string;
  /** The line of the runner being watched gets a frame. */
  framed?: string | null;
  /** Called with the id of a running runner's line that is tapped or clicked; those lines can be picked. */
  onPick?: (id: string) => void;
  /** Players whose connection is down: their heads come and go. */
  away?: ReadonlySet<string>;
}

// Where a line's parts are, in cells from its left end: the place, the head, the name, and the score's right edge.
const COL = { place: 0, head: 8, name: 22, scoreRight: BOARD_CELLS.width };
// The own line's box reaches this many cells past both ends of the line and above its letters, and is BOX_H high.
const BOX_OUT = 2;
const BOX_H = 11;

const fiveDigits = (score: number): string => String(Math.min(99_999, Math.max(0, Math.floor(score)))).padStart(5, '0');

/**
 * A leaderboard: its title, then a line for each player with the place, a head, the name and the score. A line is placed
 * by a transform that eases, so a player who moves up or down slides there. The line of the runner being watched is
 * framed, and with `onPick` the lines of the others still running can be picked. The head of a player whose connection
 * is down comes and goes.
 */
export function Leaderboard({
  title, rows, heads, cell, mode, testId, rowTestId = 'board-row', framed = null, onPick, away,
}: LeaderboardProps) {
  const at = (cells: number): string => `${cells * cell}px`;
  const width = (BOARD_CELLS.width + 2 * BOX_OUT) * cell;
  return (
    <div data-testid={testId} className="leaderboard" style={{ width, height: boardHeightCells(rows.length) * cell }}>
      <span className="board-part" style={{ left: at(BOX_OUT), top: 0 }}>
        <PixelText text={title} size={cell} color={SOFT} />
      </span>
      {rows.map((row, i) => {
        const lit = row.me && (mode === 'results' || row.alive);
        const out = mode === 'race' && !row.alive;
        const color = lit ? PAPER : out ? DIM : INK;
        const score = fiveDigits(row.score);
        const part = (cells: number, top = 0) => ({ left: at(BOX_OUT + cells), top: at(top) });
        const box = { left: 0, top: at(-BOX_OUT), width, height: at(BOX_H) };
        const pickable = onPick !== undefined && row.alive && !row.me;
        const gone = away?.has(row.id) ?? false;
        const head = <PixelIcon rows={out ? heads.dead : heads.alive} size={cell} color={color} />;
        return (
          <div
            key={row.id}
            data-testid={rowTestId}
            data-player-id={row.id}
            data-me={row.me}
            data-alive={row.alive}
            data-framed={row.id === framed}
            data-away={gone}
            data-pickable={pickable}
            className={pickable ? 'board-row pickable' : 'board-row'}
            style={{
              width,
              height: at(BOARD_CELLS.row),
              transform: `translateY(${(BOARD_CELLS.title + i * BOARD_CELLS.row) * cell}px)`,
            }}
            onClick={pickable ? () => onPick(row.id) : undefined}
          >
            {lit && <span className="board-box" style={box} />}
            {row.id === framed && <span className="board-frame" style={{ ...box, borderWidth: cell }} />}
            <span className="board-part" style={part(COL.place)}>
              <PixelText text={String(i + 1)} size={cell} color={color} />
            </span>
            <span className="board-part" style={part(COL.head, -1)}>
              {gone ? <Blinking>{head}</Blinking> : head}
            </span>
            <span className="board-part" style={part(COL.name)}>
              <PixelText text={row.name} size={cell} color={color} />
            </span>
            <span className="board-part" style={part(COL.scoreRight - measureCells(score))}>
              <PixelText text={score} size={cell} color={color} />
            </span>
          </div>
        );
      })}
    </div>
  );
}
