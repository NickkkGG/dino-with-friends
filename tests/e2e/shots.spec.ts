import { copyFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test } from '@playwright/test';
import type { Page, TestInfo } from '@playwright/test';

// Screenshots of every screen and a short video, for checking the game by eye. They go to shots/, which git ignores.

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
      await until(page, 'window.__dwf.hp === 1', 80_000);
      await page.waitForTimeout(1600); // past the hurt face and the blinking after the hit
      await shoot(page, info, `solo-low${tag}`);
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
