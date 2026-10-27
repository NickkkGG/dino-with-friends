import { DIM, INK, PAPER, SOFT } from '../game/colors';
import type { Heads } from '../game/heads';
import { BOARD_CELLS, boardHeightCells } from '../game/layout';
import { measureCells } from '../ui/font';
import { PixelIcon } from '../ui/PixelIcon';
import { PixelText } from '../ui/PixelText';

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
}

// Where a line's parts are, in cells from its left end: the place, the head, the name, and the score's right edge.
const COL = { place: 0, head: 8, name: 22, scoreRight: BOARD_CELLS.width };
// The own line's box reaches this many cells past both ends of the line and above its letters, and is BOX_H high.
const BOX_OUT = 2;
const BOX_H = 11;

const fiveDigits = (score: number): string => String(Math.min(99_999, Math.max(0, Math.floor(score)))).padStart(5, '0');

/**
 * A leaderboard: its title, then a line for each player with the place, a head, the name and the score. A line is placed
 * by a transform that eases, so a player who moves up or down slides there.
 */
export function Leaderboard({ title, rows, heads, cell, mode, testId, rowTestId = 'board-row' }: LeaderboardProps) {
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
        return (
          <div
            key={row.id}
            data-testid={rowTestId}
            data-player-id={row.id}
            data-me={row.me}
            data-alive={row.alive}
            className="board-row"
            style={{ width, transform: `translateY(${(BOARD_CELLS.title + i * BOARD_CELLS.row) * cell}px)` }}
          >
            {lit && <span className="board-box" style={{ left: 0, top: at(-BOX_OUT), width, height: at(BOX_H) }} />}
            <span className="board-part" style={part(COL.place)}>
              <PixelText text={String(i + 1)} size={cell} color={color} />
            </span>
            <span className="board-part" style={part(COL.head, -1)}>
              <PixelIcon rows={out ? heads.dead : heads.alive} size={cell} color={color} />
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
