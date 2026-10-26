import { SKILL_STEPS } from '../../../shared/sim/constants';
import { skillRemaining } from '../../../shared/sim/world';
import type { World } from '../../../shared/sim/world';
import { HEART, HEART_EMPTY, ICON_DOUBLE_JUMP, ICON_GHOST, ICON_SPEED } from '../bitmaps';
import { INK, PAPER } from '../colors';
import { fillCellsWithHalo, fillWorldRect } from './context';
import type { CellContext } from './context';

/** World pixels per HUD cell: the cell of the original GAME OVER letters. */
export const HUD_CELL = 1.5;

const HEART_STEP = 9; // cells from one heart to the next
const SKILLS_GAP = 3; // cells between the last heart slot and the first skill
const SKILL_STEP = 48; // cells from one skill to the next
const BAR = { x: 16, w: 26, h: 6 }; // the frame of a skill's bar, in cells from the skill's corner
const FILL = { x: 18, y: 2, w: 22, h: 2 }; // the bar inside it, full at 22 cells
const LAST_HEART_BLINK_STEPS = 15; // the last heart shows for 15 steps and hides for 15: twice a second

type TimedSkill = 'doubleJump' | 'ghost' | 'speed';

// The skills always show in this order, whichever was picked first.
const ORDER: readonly TimedSkill[] = ['doubleJump', 'ghost', 'speed'];

// GHOST's icon is dotted, like the dino it stands for: only the cells whose column + row is even.
const GHOST_DOTTED = ICON_GHOST.map((row, r) =>
  [...row].map((ch, c) => (ch === '#' && (c + r) % 2 === 0 ? '#' : '.')).join(''));

const ICONS: Readonly<Record<TimedSkill, readonly string[]>> = {
  doubleJump: ICON_DOUBLE_JUMP,
  ghost: GHOST_DOTTED,
  speed: ICON_SPEED,
};

/** How many heart slots show: 3, or more when the player has more hearts. */
export function heartSlots(hp: number): number {
  return Math.max(3, hp);
}

/** The cell, from the HUD's corner, where the skills start: just after the heart slots. */
export function skillsCell(hpShown: number): number {
  return heartSlots(hpShown) * HEART_STEP + SKILLS_GAP;
}

/** Where the hearts and the running skills go, in cells from the HUD's corner, and how much time each skill has left. */
export function hudCells(hpShown: number, w: World): {
  hearts: number[];
  skills: Array<{ id: TimedSkill; cx: number; frac: number }>;
} {
  const slots = heartSlots(hpShown);
  const hearts = Array.from({ length: slots }, (_, i) => i * HEART_STEP);
  const skills: Array<{ id: TimedSkill; cx: number; frac: number }> = [];
  let cx = skillsCell(hpShown);
  for (const id of ORDER) {
    const left = skillRemaining(w, id);
    if (left <= 0) continue;
    skills.push({ id, cx, frac: left / SKILL_STEPS[id] });
    cx += SKILL_STEP;
  }
  return { hearts, skills };
}

// The HUD sits where a jumping dino goes, so everything in it is outlined in paper, one cell wide, to stay readable.

/** Full hearts, then empty ones, from world (x, y). With one heart left it blinks. */
export function drawHearts(dc: CellContext, x: number, y: number, hpShown: number, step: number): void {
  const slots = heartSlots(hpShown);
  for (let i = 0; i < slots; i++) {
    const full = i < hpShown;
    if (full && hpShown === 1 && Math.floor(step / LAST_HEART_BLINK_STEPS) % 2 !== 0) continue;
    const hx = x + i * HEART_STEP * HUD_CELL;
    fillCellsWithHalo(dc, full ? HEART : HEART_EMPTY, hx, y, INK, PAPER, HUD_CELL, i * HEART_STEP, 0);
  }
}

/** The running skills from world (x, y), each an icon and a bar of the time it has left. */
export function drawSkills(dc: CellContext, x: number, y: number, w: World): void {
  let i = 0;
  for (const id of ORDER) {
    const left = skillRemaining(w, id);
    if (left <= 0) continue;
    const cx = i * SKILL_STEP;
    const sx = x + cx * HUD_CELL;
    const cells = (c: number, r: number, wc: number, hc: number, color = INK) =>
      fillWorldRect(dc, sx + c * HUD_CELL, y + r * HUD_CELL, wc * HUD_CELL, hc * HUD_CELL, color);
    fillCellsWithHalo(dc, ICONS[id], sx, y, INK, PAPER, HUD_CELL, cx, 0);
    cells(BAR.x - 1, -1, BAR.w + 2, BAR.h + 2, PAPER);
    cells(BAR.x, 0, BAR.w, 1);
    cells(BAR.x, BAR.h - 1, BAR.w, 1);
    cells(BAR.x, 0, 1, BAR.h);
    cells(BAR.x + BAR.w - 1, 0, 1, BAR.h);
    const n = Math.round((FILL.w * left) / SKILL_STEPS[id]);
    if (n > 0) cells(FILL.x, FILL.y, n, FILL.h);
    i++;
  }
}
