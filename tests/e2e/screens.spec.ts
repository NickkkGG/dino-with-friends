import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

// The title, the credits and the sound button, in the dev build.

const isPhone = (project: string) => project.endsWith('-phone');

// Watches window.__dwf on every frame for `ms`: how many steps went by, and whether the dino was ever in the air.
function watchDemo(page: Page, ms: number) {
  return page.evaluate(async (ms) => {
    const first = window.__dwf!.step;
    let jumped = false;
    const end = performance.now() + ms;
    while (performance.now() < end) {
      if (window.__dwf!.trex?.jumping) jumped = true;
      await new Promise((r) => requestAnimationFrame(r));
    }
    return { steps: window.__dwf!.step - first, jumped, screen: window.__dwf!.screen, phase: window.__dwf!.phase };
  }, ms);
}

test('title: logo, a living demo, the HI and the buttons', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('dwf.hi', '1240'));
  await page.goto('/');
  await expect(page.getByTestId('title-screen')).toBeVisible();
  for (const text of ['DINO', 'with', 'FRIENDS', 'SOLO', 'MULTIPLAYER', 'CREDITS', 'HI 01240']) {
    await expect(page.getByText(text, { exact: true })).toBeVisible();
  }
  const demo = await watchDemo(page, 4000);
  expect(demo).toMatchObject({ screen: 'title', phase: 'running', jumped: true });
  expect(demo.steps).toBeGreaterThan(150);
  await expect(page.getByTestId('btn-mute')).toBeVisible();
});

test('the whole title fits the window, on a phone on its side too', async ({ page }, info) => {
  await page.addInitScript(() => localStorage.setItem('dwf.hi', '1240'));
  await page.goto('/');
  await expect(page.getByTestId('title-screen')).toBeVisible();
  const upright = page.viewportSize()!;
  const sizes = isPhone(info.project.name) ? [upright, { width: 844, height: 390 }] : [upright];
  for (const size of sizes) {
    await page.setViewportSize(size);
    // The title is no taller than the window, with room above the logo and under CREDITS. Polled, since the layout
    // follows a resize a frame or two later; a failure shows the numbers.
    const window = `${size.width}×${size.height}`;
    await expect
      .poll(() =>
        page.evaluate(() => {
          const title = document.querySelector('[data-testid="title-screen"]')!;
          const box = title.getBoundingClientRect().height;
          const roomAbove = title.firstElementChild!.getBoundingClientRect().top;
          const roomBelow = innerHeight - document.querySelector('[data-testid="link-credits"]')!.getBoundingClientRect().bottom;
          return { window: `${innerWidth}×${innerHeight}`, box, roomAbove, roomBelow, fits: box <= innerHeight && roomAbove >= 16 && roomBelow >= 16 };
        }), { message: window })
      .toMatchObject({ window, fits: true });
  }
});

test('no HI on the title before there is one', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('title-screen')).toBeVisible();
  await expect(page.getByText(/^HI /)).toHaveCount(0);
});

test('SOLO opens the solo screen and MENU comes back', async ({ page }, info) => {
  test.setTimeout(60_000);
  await page.goto('/?seed=7&timeScale=8');
  await page.getByTestId('btn-solo').click();
  await expect(page.getByTestId('solo-screen')).toBeVisible();
  await expect(page.getByTestId('btn-mute')).toBeVisible();
  expect(await page.evaluate(() => window.__dwf!.screen)).toBe('solo');
  if (isPhone(info.project.name)) {
    const { width, height } = page.viewportSize()!;
    await page.getByTestId('solo-screen').tap({ position: { x: width * 0.75, y: height * 0.9 } });
  } else {
    await page.keyboard.press('Space');
  }
  await expect.poll(() => page.evaluate(() => window.__dwf!.phase), { timeout: 45_000 }).toBe('dead');
  await page.getByTestId('btn-menu').click();
  await expect(page.getByTestId('title-screen')).toBeVisible();
  await expect(page.getByText(/^HI \d{5}$/)).toHaveCount(1); // the round just played is the HI now
});

test('MULTIPLAYER says COMING SOON for 1.5 s', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('btn-multiplayer').click();
  await expect(page.getByText('COMING SOON', { exact: true })).toBeVisible();
  await page.waitForTimeout(1000);
  await expect(page.getByText('COMING SOON', { exact: true })).toBeVisible();
  await expect(page.getByText('MULTIPLAYER', { exact: true })).toBeVisible({ timeout: 2000 });
  expect(await page.evaluate(() => window.__dwf!.screen)).toBe('title');
});

test('CREDITS shows the full Chromium license and BACK returns', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('link-credits').click();
  await expect(page.getByTestId('credits-screen')).toBeVisible();
  const license = page.getByTestId('license-text');
  await expect(license).toContainText('Copyright');
  await expect(license).toContainText('The Chromium Authors');
  await expect(license).toContainText('Redistribution and use in source and binary forms');
  await expect(license).toContainText('POSSIBILITY OF SUCH DAMAGE.');
  for (const text of ['CREDITS', 'MADE BY NICKKKGG', '< BACK']) await expect(page.getByText(text, { exact: true })).toBeVisible();
  await expect(page.getByTestId('idle-strip')).toBeVisible();
  expect(await page.evaluate(() => window.__dwf!.screen)).toBe('credits');
  await page.getByTestId('btn-back').click();
  await expect(page.getByTestId('title-screen')).toBeVisible();
});

test('mute is remembered after a reload', async ({ page }) => {
  await page.goto('/');
  const mute = page.getByTestId('btn-mute');
  await expect(mute).toHaveAttribute('aria-label', 'SOUND ON');
  await mute.click();
  await expect(mute).toHaveAttribute('aria-label', 'SOUND OFF');
  await page.reload();
  await expect(page.getByTestId('btn-mute')).toHaveAttribute('aria-label', 'SOUND OFF');
  expect(await page.evaluate(() => window.__dwf!.muted)).toBe(true);
});
