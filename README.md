# DINO with FRIENDS

A web remake of the offline dino game from Chromium, built for phones and laptops. It keeps the original look, physics, and sounds, and adds hearts, "?" skill boxes, a title screen with a demo run, and a sound switch. It is a work in progress: stage 1 is solo play, and online multiplayer with friends comes in later stages.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:5173. To play on a phone, join the same Wi-Fi network as the laptop and open the laptop's LAN address instead (the dev server prints it as "Network").

## Tests

```bash
npm test            # unit tests (Vitest)
npm run test:e2e    # end-to-end tests (Playwright)
```

## Credits and licenses

This game is based on the offline dino game from Chromium. The original code, sprites, and sounds are © The Chromium Authors and are used under a BSD-style license (see [`third_party/chromium/LICENSE`](third_party/chromium/LICENSE)). Everything else is released under the MIT license (see [`LICENSE`](LICENSE)).
