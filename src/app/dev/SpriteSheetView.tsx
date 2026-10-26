import { useEffect, useRef, useState } from 'react';
import * as B from '../../game/bitmaps';
import { INK, PAPER, SOFT } from '../../game/colors';
import { blit, fillCells } from '../../game/draw/context';
import type { DrawContext } from '../../game/draw/context';
import { loadSpriteSet } from '../../game/sprites';
import type { SpriteSheet } from '../../game/sprites';

// A dev page for checking the sprites by eye: both sheets at the same size on screen (the 1x sheet zoomed 4×, the 2x
// sheet 2×), every dino frame that has new faces in its three rows, and all the new pixel pictures.

const K = 4; // device pixels per world pixel
const GAP = 8;
const W = 298;
const H = 228;
const TREX_H = 47;

// Running 88 and 132, jumping 0, ducking 264 and 323: [x in the strip, width], in 1x pixels.
const FRAMES = [[88, 44], [132, 44], [0, 44], [264, 59], [323, 59]] as const;
const FACES = ['normal', 'hurt', 'low'] as const;

const PICTURES: ReadonlyArray<readonly [rows: readonly string[], color: string, dotted?: boolean]> = [
  [B.BOX, INK], [B.HEART, INK], [B.HEART_EMPTY, INK], [B.SPARK, INK], [B.SWEAT, SOFT], [B.PUFF, SOFT],
  [B.ICON_DOUBLE_JUMP, INK], [B.ICON_SPEED, INK], [B.ICON_GHOST, INK, true], [B.SPEAKER_ON, INK], [B.SPEAKER_OFF, INK],
];

// Keeps the cells of a picture at world (x, y) whose x + y is even, the dotted look of GHOST.
function dotted(rows: readonly string[], x: number, y: number): string[] {
  return rows.map((row, r) => [...row].map((ch, c) => (ch === '#' && (x + c + y + r) % 2 === 0 ? '#' : '.')).join(''));
}

// Draws a dino frame through the dotted mask: on a scratch canvas, then only the world pixels whose x + y is even.
function blitDotted(dc: DrawContext, sx: number, sy: number, sw: number, sh: number, dx: number, dy: number): void {
  const { k, sheet } = dc;
  const w = sw / sheet.scale;
  const h = sh / sheet.scale;
  const scratch = document.createElement('canvas');
  scratch.width = w * k;
  scratch.height = h * k;
  const ctx = scratch.getContext('2d');
  if (!ctx) return;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(sheet.canvas, sx, sy, sw, sh, 0, 0, w * k, h * k);
  ctx.globalCompositeOperation = 'destination-out';
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) if ((dx + x + dy + y) % 2 !== 0) ctx.fillRect(x * k, y * k, k, k);
  }
  dc.ctx.drawImage(scratch, dx * k, (dy + dc.oy) * k);
}

function drawSheet(canvas: HTMLCanvasElement, sheet: SpriteSheet): void {
  canvas.width = W * K;
  canvas.height = H * K;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const dc: DrawContext = { ctx, k: K, sheet, oy: 0 };
  const s = sheet.scale;
  const tx = sheet.pos.tRex.x;

  FACES.forEach((face, row) => {
    let x = GAP;
    for (const [fx, fw] of FRAMES) {
      blit(dc, tx + fx * s, sheet.faceRowY[face], fw * s, TREX_H * s, x, GAP + row * (TREX_H + GAP));
      x += fw + GAP;
    }
  });

  const y = GAP + FACES.length * (TREX_H + GAP);
  blit(dc, tx + 220 * s, sheet.faceRowY.normal, 44 * s, TREX_H * s, GAP, y); // dead
  blitDotted(dc, tx + 88 * s, sheet.faceRowY.normal, 44 * s, TREX_H * s, 2 * GAP + 44, y); // GHOST
  let x = 3 * GAP + 88;
  for (const [rows, color, isDotted] of PICTURES) {
    const py = y + Math.floor((TREX_H - rows.length) / 2);
    fillCells(dc, isDotted ? dotted(rows, x, py) : rows, x, py, color);
    x += (rows[0]?.length ?? 0) + GAP;
  }
}

export function SpriteSheetView() {
  const one = useRef<HTMLCanvasElement>(null);
  const two = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let live = true;
    void loadSpriteSet().then((set) => {
      if (!live || !one.current || !two.current) return;
      drawSheet(one.current, set.x1);
      drawSheet(two.current, set.x2);
      setReady(true);
    });
    return () => {
      live = false;
    };
  }, []);

  const canvas = { display: 'block', imageRendering: 'pixelated' } as const;
  const label = { margin: '16px 0 8px', font: '14px/1.4 monospace', color: INK } as const;
  return (
    <div style={{ height: '100vh', overflow: 'auto', background: PAPER }}>
      <div data-testid="sprite-sheet" data-ready={ready} style={{ padding: '0 16px 16px', width: 'max-content' }}>
        <p style={label}>1x sheet, zoom 4. Rows: normal, hurt, low heart. Frames: run, run, jump, duck, duck.</p>
        <canvas ref={one} style={canvas} />
        <p style={label}>2x sheet, zoom 2. Last row: dead, GHOST, box, hearts, spark, sweat, puff, skill icons, sound.</p>
        <canvas ref={two} style={canvas} />
      </div>
    </div>
  );
}
