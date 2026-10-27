import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { SCENE_CASES } from '../../src/app/dev/scene-cases';

// Pages that exist only in dev, for checking the drawing by eye. Their screenshots go to shots/, which git ignores.

const only = (...projects: string[]) => () => {
  test.skip(!projects.includes(test.info().project.name), `checked in ${projects.join(' and ')}`);
};

// The page itself never scrolls, so the window is made as tall as the sheet for the screenshot.
async function shoot(page: Page, sheet: Locator, path: string): Promise<void> {
  const box = await sheet.boundingBox();
  await page.setViewportSize({ width: 1440, height: Math.ceil((box?.y ?? 0) + (box?.height ?? 900)) });
  await page.screenshot({ path });
}

test.describe('sheets', () => {
  test.beforeEach(only('chromium-desktop'));

  test('sprite review page', async ({ page }) => {
    await page.goto('/?view=sprites');
    const sheet = page.getByTestId('sprite-sheet');
    await expect(sheet).toBeVisible();
    await expect(sheet).toHaveAttribute('data-ready', 'true');
    await shoot(page, sheet, 'shots/sprites.png');
  });

  test('glyph review page', async ({ page }) => {
    await page.goto('/?view=glyphs');
    const sheet = page.getByTestId('glyph-sheet');
    await expect(sheet).toBeVisible();
    await expect(sheet).toHaveAttribute('data-ready', 'true');
    // pixel text keeps its words in the page, for screen readers and for finding it by text
    await expect(page.getByText('PRESS SPACE TO START', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'MULTIPLAYER' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'START' })).toBeDisabled();
    await shoot(page, sheet, 'shots/glyphs.png');
  });
});

test.describe('scenes', () => {
  test.beforeEach(only('chromium-desktop', 'webkit-phone'));

  for (const name of SCENE_CASES) {
    test(`scene review page: ${name}`, async ({ page }) => {
      await page.goto(`/?view=scene&case=${name}`);
      await expect(page.getByTestId('scene-view')).toHaveAttribute('data-ready', 'true', { timeout: 20_000 });
      await page.screenshot({ path: `shots/${test.info().project.name}-scene-${name}.png` });
    });
  }
});

// The heads of the leaderboard and the player list, cut from the 1x sprite when the game loads: 11 × 8 each.
const ALIVE = ['..########.', '.##.#######', '.##########', '.##########', '.##########', '.#####.....', '.########..', '#####......'];
const BLINK = ['..########.', '.##########', '.##########', '.##########', '.##########', '.#####.....', '.########..', '#####......'];
const DEAD = ['..########.', '.##..######', '.##.#######', '.##########', '.##########', '.##########', '.########..', '#####......'];

test('the leaderboard heads are cut from the sprite', async ({ page }) => {
  await page.goto('/?view=sprites');
  for (const [id, rows] of [['head-alive', ALIVE], ['head-blink', BLINK], ['head-dead', DEAD]] as const) {
    await expect(page.getByTestId(id)).toHaveAttribute('data-rows', rows.join('|'));
  }
});
