import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

// Pages that exist only in dev, for checking the drawing by eye. Their screenshots go to shots/, which git ignores.
test.beforeEach(() => {
  test.skip(test.info().project.name !== 'chromium-desktop', 'checked once, in Chromium on the desktop');
});

// The page itself never scrolls, so the window is made as tall as the sheet for the screenshot.
async function shoot(page: Page, sheet: Locator, path: string): Promise<void> {
  const box = await sheet.boundingBox();
  await page.setViewportSize({ width: 1440, height: Math.ceil((box?.y ?? 0) + (box?.height ?? 900)) });
  await page.screenshot({ path });
}

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
