# DINO with FRIENDS

A web remake of the offline dino game from Chromium, built for phones and laptops. It keeps the original look, physics, and sounds, and adds hearts, "?" skill boxes, a title screen with a demo run, and a sound switch. Play it solo, or race your friends: everyone in a lobby runs the same course at the same moment, and a 6-character code is all it takes to join.

Play it at https://dino-with-friends.nicknelsoon30.workers.dev.

## Controls

|                            | Laptop                                         | Phone              |
| -------------------------- | ---------------------------------------------- | ------------------ |
| Start                      | Space or ↑                                     | Tap anywhere       |
| Jump (hold to jump higher) | Space or ↑                                     | Tap the right half |
| Duck (in the air: drop)    | ↓                                              | Hold the left half |
| Restart after GAME OVER    | Space, ↑ or a click after 1.2 s; Enter at once | Tap after 1.2 s    |

MENU goes back to the title screen, and the speaker in the top right corner switches the sound on and off. The best score and the sound setting are remembered in the browser.

## Play with friends

1. Choose MULTIPLAYER on the title screen and type your name. It is remembered for next time.
2. Choose CREATE LOBBY and share the code that comes up (TAP TO COPY copies it).
3. Your friends choose MULTIPLAYER, type the code under JOIN WITH CODE, and choose JOIN.
4. The host, who made the lobby, presses START. Everyone counts down together and runs the same course, and the tower in the top left corner shows who is ahead.
5. The round goes on until everyone is out, so the last one running plays on while the others watch. After the results everyone is back in the lobby, ready for the next round.

A lobby holds up to 8 players, and a friend who comes in during a round plays the next one. Until then, and once you are out, you watch the runner in the lead: tap a name in the tower, or press ← and →, to watch someone else. Whoever you watch sees your dino's head peeking in at the edge of their screen.

If the connection drops, the game gets back in by itself. Your seat is kept for 2 minutes in the lobby, and for 10 seconds in the middle of a round.

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
- **The screens** around the game (title, credits, lobby, race, results, buttons) are React components in [`src/app/`](src/app/).
- **The lobby rules** live in [`shared/lobby/`](shared/lobby/): who is in a lobby and who is the host, the countdown, the tower and the results, as a plain state machine that the client and the server share and that is tested without a server.
- **The lobby server** is a Cloudflare Worker with a Durable Object, `Lobby`, for each lobby, in [`worker/`](worker/). The players' WebSockets stay open on the object while it sleeps between messages, and a round runs on the server's clock, which every browser keeps in step with.
- **Watching:** the lobby passes each runner's states on to whoever watches them, and the screen they watch is drawn from those states a little behind the shared clock, moving smoothly from one to the next.
- **On a laptop**, `npm run dev` runs the Worker and the Durable Object too, through the Cloudflare plugin for Vite, so a phone on the same Wi-Fi can join a race through the laptop's LAN address.
- **Hosting:** Cloudflare builds every push to `main` with `npm run build` and serves the files in `dist/` as a Worker ([`wrangler.jsonc`](wrangler.jsonc)). The same Worker answers `/api/lobby` and `/ws/…`, where the lobbies are.

## Tests

```bash
npm test            # unit tests (Vitest)
npm run typecheck   # TypeScript
npm run test:e2e    # end-to-end tests (Playwright) on a laptop and a phone, in Chromium and WebKit
npm run build       # production build in dist/
```

The end-to-end tests run in Playwright's Chromium and WebKit, which you install once with `npx playwright install chromium webkit`.

## Credits and licenses

This game is based on the offline dino game from Chromium. The original code, sprites, and sounds are © The Chromium Authors and are used under a BSD-style license (see [`third_party/chromium/LICENSE`](third_party/chromium/LICENSE)). They are kept unchanged in [`third_party/chromium/`](third_party/chromium/), and [`third_party/chromium/README.md`](third_party/chromium/README.md) says where they come from. Files ported from them (in `shared/sim/`, `src/game/draw/`, and `src/game/sprite-defs.ts`) keep the Chromium copyright notice at the top and say what was changed. The tab and home screen icons in `public/` are made from the dino's head in the same sprite sheet. The game's CREDITS screen shows the full license text too.

Everything else is © 2026 NickkkGG and released under the MIT license (see [`LICENSE`](LICENSE)).
