import { copyFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import type { Page, TestInfo } from '@playwright/test';
import { makeCode } from '../../shared/lobby/code';
import { BOT, createLobby, joinLobby, named, openPlayer, startRace } from './players';

// Screenshots of every screen and two short videos, for checking the game by eye. They go to shots/, which git ignores.

const SHOTS = fileURLToPath(new URL('../../shots/', import.meta.url));
const isPhone = (project: string) => project.endsWith('-phone');

async function shoot(page: Page, info: TestInfo, name: string): Promise<void> {
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}${info.project.name}-${name}.png` });
}

// Waits in the page, frame by frame, until window.__dwf shows what `condition` asks for.
const until = (page: Page, condition: string, timeout = 30_000) =>
  page.waitForFunction(`window.__dwf && (${condition})`, null, { timeout, polling: 'raf' });

// The first jump, from a touch on the right half, the same on every project.
async function startRound(page: Page): Promise<void> {
  await until(page, "window.__dwf.phase === 'waiting'");
  await page.evaluate(() => {
    const at = { pointerId: 50, pointerType: 'touch', clientX: innerWidth * 0.75, clientY: innerHeight * 0.9, bubbles: true };
    const surface = document.querySelector('[data-testid="solo-screen"]')!;
    surface.dispatchEvent(new PointerEvent('pointerdown', at));
    surface.dispatchEvent(new PointerEvent('pointerup', at));
  });
  await until(page, "window.__dwf.phase === 'running'");
}

for (const landscape of [false, true]) {
  test.describe(landscape ? 'shots, phone on its side' : 'shots', () => {
    const tag = landscape ? '-landscape' : '';
    if (landscape) test.use({ viewport: { width: 844, height: 390 } });
    test.beforeEach(({}, info) => {
      test.skip(landscape && !isPhone(info.project.name), 'phones only');
    });

    test('title', async ({ page }, info) => {
      await page.addInitScript(() => localStorage.setItem('dwf.hi', '1240'));
      await page.goto('/');
      await until(page, "window.__dwf.phase === 'running'");
      await page.waitForTimeout(1500);
      await shoot(page, info, `title${tag}`);
    });

    test('solo waiting', async ({ page }, info) => {
      await page.goto('/?view=solo&seed=7');
      await until(page, "window.__dwf.phase === 'waiting'");
      await page.waitForTimeout(500);
      await shoot(page, info, `solo-waiting${tag}`);
    });

    test('solo running with GHOST', async ({ page }, info) => {
      await page.goto('/?view=solo&seed=7&autopilot=1&box=ghost');
      await until(page, 'window.__dwf.skills && window.__dwf.skills.ghost > 200', 60_000);
      await shoot(page, info, `solo-running${tag}`);
    });

    test('solo hurt', async ({ page }, info) => {
      await page.goto('/?view=solo&seed=7');
      await startRound(page);
      await until(page, 'window.__dwf.hp === 2', 60_000);
      await shoot(page, info, `solo-hurt${tag}`);
    });

    test('solo on the last heart', async ({ page }, info) => {
      test.setTimeout(90_000);
      await page.goto('/?view=solo&seed=7');
      await startRound(page);
      // The last heart's face shows once the hurt face is over, 21 steps after the hit, between the blinks that follow
      // (6 steps on, 6 off), and the last heart itself blinks (15 steps on, 15 off). The dino is hit again as soon as its
      // protection ends, 90 steps after the hit, so the round is stopped, as when the page loses focus, on a step that
      // shows both.
      const shown = await page.evaluate(async () => {
        const frame = () => new Promise((r) => requestAnimationFrame(r));
        const d = () => window.__dwf!;
        while (d().hp !== 1) await frame();
        // Frames go one step at a time here, so this is the step of the hit or up to two after it: hence the room.
        const hit = d().step - 1;
        const dinoShows = (since: number) => since >= 21 && (since - 21) % 12 <= 3;
        const heartShows = (step: number) => Math.floor(step / 15) % 2 === 0;
        while (!(dinoShows(d().step - 1 - hit) && heartShows(d().step))) await frame();
        window.dispatchEvent(new Event('blur'));
        return { phase: d().phase, hp: d().hp, sinceHit: d().step - 1 - hit };
      });
      await shoot(page, info, `solo-low${tag}`);
      expect(shown).toMatchObject({ phase: 'running', hp: 1 }); // still running on the last heart
      expect(shown.sinceHit).toBeLessThan(90); // still blinking, so the picture is of a step chosen to show the dino
    });

    test('solo at night', async ({ page }, info) => {
      test.setTimeout(90_000);
      await page.goto('/?view=solo&seed=7&invincible=1&timeScale=8');
      await startRound(page);
      await until(page, 'window.__dwf.night > 0', 80_000);
      await page.waitForTimeout(1700); // the screen turns over in 1.5 s
      await shoot(page, info, `solo-night${tag}`);
    });

    test('solo game over', async ({ page }, info) => {
      test.setTimeout(90_000);
      await page.goto('/?view=solo&seed=7&timeScale=4');
      await startRound(page);
      await until(page, "window.__dwf.phase === 'dead'", 80_000);
      await page.waitForTimeout(1500); // the restart button has come up
      await shoot(page, info, `solo-over${tag}`);
    });

    test('credits', async ({ page }, info) => {
      await page.goto('/');
      await page.getByTestId('link-credits').click();
      await page.getByTestId('credits-screen').waitFor();
      await page.waitForTimeout(600);
      await shoot(page, info, `credits${tag}`);
    });

    test('multiplayer: YOUR NAME', async ({ page }, info) => {
      await page.goto('/');
      await page.getByTestId('btn-multiplayer').click();
      await page.getByTestId('name-input').pressSequentially('NICK');
      await page.waitForTimeout(300);
      await shoot(page, info, `mp-name${tag}`);
    });

    test('multiplayer: LOBBY NOT FOUND', async ({ page }, info) => {
      await named(page, 'NICK');
      await page.goto('/');
      await page.getByTestId('btn-multiplayer').click();
      await page.getByTestId('code-input').fill(makeCode((n) => Math.floor(Math.random() * n)));
      await page.getByTestId('btn-join').click();
      await page.getByTestId('mp-error').waitFor();
      await shoot(page, info, `mp-not-found${tag}`);
    });

    test('multiplayer: the lobby, for the host and for a friend', async ({ page, browser }, info) => {
      await named(page, 'NICK');
      await page.goto('/');
      const code = await createLobby(page);
      const friend = await openPlayer(browser, { name: 'RARA' });
      await joinLobby(friend, code);
      await expect(page.getByTestId('players-count')).toHaveText('PLAYERS 2/8');
      await page.waitForTimeout(300);
      await shoot(page, info, `mp-lobby-host${tag}`);
      await friend.context().close();
      // A lobby RARA makes, which NICK joins.
      const host = await openPlayer(browser, { name: 'RARA' });
      const other = await createLobby(host);
      await page.goto('/');
      await joinLobby(page, other);
      await page.waitForTimeout(300);
      await shoot(page, info, `mp-lobby-friend${tag}`);
      await host.context().close();
    });

    test('multiplayer: the countdown', async ({ page, browser }, info) => {
      const [friend] = await startRace(page, browser, [{ name: 'RARA', query: BOT }]);
      await until(page, 'window.__dwf.race && window.__dwf.race.count === 3');
      await page.waitForTimeout(400);
      await shoot(page, info, `mp-countdown${tag}`);
      await friend!.context().close();
    });

    test('multiplayer: a race of two', async ({ page, browser }, info) => {
      const [friend] = await startRace(page, browser, [{ name: 'RARA', query: BOT }], '?autopilot=1');
      await until(page, "window.__dwf.race && window.__dwf.race.phase === 'running' && window.__dwf.step > 240 && window.__dwf.trex.jumping", 40_000);
      await shoot(page, info, `mp-race${tag}`);
      await friend!.context().close();
    });

    test('multiplayer: GAME OVER while the others run on', async ({ page, browser }, info) => {
      test.setTimeout(120_000);
      const friends = await startRace(page, browser, [{ name: 'RARA', query: BOT }, { name: 'TOTO', query: BOT }]);
      await until(page, "window.__dwf.phase === 'dead'", 90_000);
      await page.waitForTimeout(1500); // GAME OVER is up
      await shoot(page, info, `mp-over${tag}`);
      for (const f of friends) await f.context().close();
    });

    test('multiplayer: the results', async ({ page, browser }, info) => {
      test.setTimeout(120_000);
      const [friend] = await startRace(page, browser, [{ name: 'RARA' }], BOT);
      await page.getByTestId('results-screen').waitFor({ timeout: 90_000 });
      await page.waitForTimeout(300);
      await shoot(page, info, `mp-results${tag}`);
      await friend!.context().close();
    });
  });
}

// A video can only be switched on for a whole file, so this one records its own browser context, with the project's
// device settings.
test('20 s of the autopilot, on video', async ({ browser }, info) => {
  test.skip(!['chromium-desktop', 'webkit-phone'].includes(info.project.name), 'one laptop and one phone');
  test.setTimeout(60_000);
  const { viewport } = info.project.use;
  const dir = info.outputPath('video');
  const context = await browser.newContext({ ...info.project.use, recordVideo: { dir, size: viewport ?? undefined } });
  const page = await context.newPage();
  await page.goto('/?view=solo&autopilot=1');
  await until(page, "window.__dwf.phase === 'running'");
  await page.waitForTimeout(20_000);
  const video = page.video()!;
  await context.close();
  mkdirSync(SHOTS, { recursive: true });
  copyFileSync(await video.path(), `${SHOTS}${info.project.name}-run.webm`);
});

test('20 s of a race of two, on video', async ({ browser }, info) => {
  test.skip(info.project.name !== 'chromium-desktop', 'one laptop');
  test.setTimeout(90_000);
  const { viewport } = info.project.use;
  const dir = info.outputPath('video');
  const context = await browser.newContext({ ...info.project.use, recordVideo: { dir, size: viewport ?? undefined } });
  const page = await context.newPage();
  const [friend] = await startRace(page, browser, [{ name: 'RARA', query: BOT }], BOT);
  await until(page, "window.__dwf.race && window.__dwf.race.phase === 'running'");
  await page.waitForTimeout(20_000);
  const video = page.video()!;
  await context.close();
  await friend!.context().close();
  mkdirSync(SHOTS, { recursive: true });
  copyFileSync(await video.path(), `${SHOTS}${info.project.name}-race.webm`);
});
