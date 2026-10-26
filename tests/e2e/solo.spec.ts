import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

// The solo screen in the dev build, read through window.__dwf.

const isPhone = (project: string) => project.endsWith('-phone');

const phase = (page: Page) => page.evaluate(() => window.__dwf?.phase ?? null);

// The first jump: Space on a laptop, a tap low on the right on a phone.
async function startRound(page: Page, phone: boolean) {
  if (phone) {
    const { width, height } = page.viewportSize()!;
    await page.getByTestId('solo-screen').tap({ position: { x: width * 0.75, y: height * 0.9 } });
  } else {
    await page.keyboard.press('Space');
  }
}

// The phases the page goes through, frame by frame, for `ms` milliseconds.
function watchPhases(page: Page, ms: number): Promise<(string | null)[]> {
  return page.evaluate(async (ms) => {
    const seen: (string | null)[] = [];
    const end = performance.now() + ms;
    while (performance.now() < end) {
      const p = window.__dwf?.phase ?? null;
      if (seen.at(-1) !== p) seen.push(p);
      await new Promise((r) => requestAnimationFrame(r));
    }
    return seen;
  }, ms);
}

// Waits in the page for the crash, and at once lets go of a jump key (or lifts a tap): too soon to restart.
function restartTooSoon(page: Page, phone: boolean): Promise<string | null> {
  return page.evaluate(async (phone) => {
    while (window.__dwf?.phase !== 'dead') await new Promise((r) => requestAnimationFrame(r));
    const surface = document.querySelector('[data-testid="solo-screen"]')!;
    if (phone) {
      const at = { pointerId: 9, pointerType: 'touch', clientX: innerWidth * 0.75, clientY: innerHeight * 0.9, bubbles: true };
      surface.dispatchEvent(new PointerEvent('pointerdown', at));
      surface.dispatchEvent(new PointerEvent('pointerup', at));
    } else {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ' }));
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', key: ' ' }));
    }
    for (let i = 0; i < 10; i++) await new Promise((r) => requestAnimationFrame(r));
    return window.__dwf?.phase ?? null;
  }, phone);
}

test('waits, starts on the first jump, plays the intro and runs', async ({ page }, info) => {
  const phone = isPhone(info.project.name);
  await page.goto('/?view=solo&seed=7');
  await expect(page.getByTestId('solo-screen')).toBeVisible();
  await expect(page.getByTestId('start-text')).toContainText(phone ? 'TAP TO START' : 'PRESS SPACE TO START');
  await expect.poll(() => phase(page)).toBe('waiting');
  const phases = watchPhases(page, 3000);
  await page.waitForTimeout(300); // nothing starts by itself
  await startRound(page, phone);
  expect(await phases).toEqual(['waiting', 'intro', 'running']);
  await expect(page.getByTestId('start-text')).toBeHidden();
  const before = await page.evaluate(() => window.__dwf!.step);
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.__dwf!.step)).toBeGreaterThan(before + 15);
  expect(await page.evaluate(() => window.__dwf!.screen)).toBe('solo');
  if (phone) await expect(page.getByTestId('touch-hints')).toBeVisible();
});

test('three hits end the run, then restart after 1.2 s and MENU', async ({ page }, info) => {
  test.setTimeout(90_000);
  const phone = isPhone(info.project.name);
  await page.goto('/?view=solo&seed=7&timeScale=4');
  await expect.poll(() => phase(page)).toBe('waiting');
  const tooSoon = restartTooSoon(page, phone);
  await startRound(page, phone);
  expect(await tooSoon).toBe('dead');
  const dead = await page.evaluate(() => ({ hp: window.__dwf!.hp, hi: window.__dwf!.hi, score: window.__dwf!.score }));
  expect(dead.hp).toBe(0);
  expect(dead.hi).toBeGreaterThan(0);
  expect(dead.hi).toBe(dead.score);
  await expect(page.getByTestId('btn-menu')).toBeVisible();

  await page.waitForTimeout(1300);
  const phases = watchPhases(page, 400);
  await startRound(page, phone);
  expect(await phases).toEqual(['dead', 'running']); // a new round runs at once, with no intro
  await expect(page.getByTestId('btn-menu')).toBeHidden();

  await expect.poll(() => phase(page), { timeout: 60_000 }).toBe('dead');
  await page.getByTestId('btn-menu').click();
  await expect(page.getByTestId('title-screen')).toBeVisible();
  expect(await page.evaluate(() => window.__dwf!.screen)).toBe('title');
});
