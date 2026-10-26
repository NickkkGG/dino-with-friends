# DINO with FRIENDS

A web remake of the offline dino game from Chromium, built for phones and laptops. It keeps the original look, physics, and sounds, and adds hearts, "?" skill boxes, a title screen with a demo run, and a sound switch. It is a work in progress: stage 1 is solo play, and online multiplayer with friends comes in later stages.

## Controls

|                            | Laptop                                         | Phone              |
| -------------------------- | ---------------------------------------------- | ------------------ |
| Start                      | Space or ↑                                     | Tap anywhere       |
| Jump (hold to jump higher) | Space or ↑                                     | Tap the right half |
| Duck (in the air: drop)    | ↓                                              | Hold the left half |
| Restart after GAME OVER    | Space, ↑ or a click after 1.2 s; Enter at once | Tap after 1.2 s    |

MENU goes back to the title screen, and the speaker in the top right corner switches the sound on and off. The best score and the sound setting are remembered in the browser.

## Run locally

You need Node.js 22.12+, 24, or 26+.

```bash
npm install
npm run dev
```

Open http://localhost:5173. To play on a phone, join the same Wi-Fi network as the laptop and open the laptop's LAN address instead (the dev server prints it as "Network").

## How it works

- **The rules** live in [`shared/sim/`](shared/sim/): a deterministic simulation that moves in fixed 60 Hz steps and draws its course and its boxes from a seeded random generator, with no browser code in it. The same seed gives the same run everywhere; the tests check that Node, Chromium, and WebKit agree.
- **The drawing** lives in [`src/game/draw/`](src/game/draw/), ported from the original game. It reads the world after each step and draws it from the original sprite sheets.
- **Crisp pixels:** every canvas is drawn at a whole number of device pixels per game pixel, from the 1x or the 2x sprite sheet, and the browser scales it the last bit to the screen's size with pixelated scaling, so the pixels stay sharp instead of blurring.
- **The screens** around the game (title, credits, buttons) are React components in [`src/app/`](src/app/).

## Tests

```bash
npm test            # unit tests (Vitest)
npm run typecheck   # TypeScript
npm run test:e2e    # end-to-end tests (Playwright) on a laptop and a phone, in Chromium and WebKit
npm run build       # production build in dist/
```

The end-to-end tests run in Playwright's Chromium and WebKit, which you install once with `npx playwright install chromium webkit`.

## Credits and licenses

This game is based on the offline dino game from Chromium. The original code, sprites, and sounds are © The Chromium Authors and are used under a BSD-style license (see [`third_party/chromium/LICENSE`](third_party/chromium/LICENSE)). They are kept unchanged in [`third_party/chromium/`](third_party/chromium/), and [`third_party/chromium/README.md`](third_party/chromium/README.md) says where they come from. Files ported from them (in `shared/sim/`, `src/game/draw/`, and `src/game/sprite-defs.ts`) keep the Chromium copyright notice at the top and say what was changed. The game's CREDITS screen shows the full license text too.

Everything else is © 2026 NickkkGG and released under the MIT license (see [`LICENSE`](LICENSE)).
