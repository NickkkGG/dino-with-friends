// Copyright 2021 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the third_party/chromium/LICENSE file.
// Modified for DINO with FRIENDS: only the sprite positions and the horizon line of the original game.

/** A point in a sprite sheet, in that sheet's own pixels. */
export interface SpritePoint {
  x: number;
  y: number;
}

/** Where each sprite starts in a sheet. */
export interface SpritePositions {
  cactusLarge: SpritePoint;
  cactusSmall: SpritePoint;
  cloud: SpritePoint;
  horizon: SpritePoint;
  moon: SpritePoint;
  pterodactyl: SpritePoint;
  restart: SpritePoint;
  textSprite: SpritePoint;
  tRex: SpritePoint;
  star: SpritePoint;
}

/** The 1x sheet (100-offline-sprite.png). */
export const LDPI_POS: SpritePositions = {
  cactusLarge: { x: 332, y: 2 },
  cactusSmall: { x: 228, y: 2 },
  cloud: { x: 86, y: 2 },
  horizon: { x: 2, y: 54 },
  moon: { x: 484, y: 2 },
  pterodactyl: { x: 134, y: 2 },
  restart: { x: 2, y: 68 },
  textSprite: { x: 655, y: 2 },
  tRex: { x: 848, y: 2 },
  star: { x: 645, y: 2 },
};

/** The 2x sheet (200-offline-sprite.png). */
export const HDPI_POS: SpritePositions = {
  cactusLarge: { x: 652, y: 2 },
  cactusSmall: { x: 446, y: 2 },
  cloud: { x: 166, y: 2 },
  horizon: { x: 2, y: 104 },
  moon: { x: 954, y: 2 },
  pterodactyl: { x: 260, y: 2 },
  restart: { x: 2, y: 130 },
  textSprite: { x: 1294, y: 2 },
  tRex: { x: 1678, y: 2 },
  star: { x: 1276, y: 2 },
};

/** The ground line, in 1x units; its source position doubles on the 2x sheet, as in the original. */
export const HORIZON_LINE = { sourceX: 2, sourceY: 52, width: 600, height: 12, yPos: 127 } as const;
