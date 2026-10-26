import { expect, test } from '@playwright/test';

// Pages that exist only in dev, for checking the drawing by eye. Their screenshots go to shots/, which git ignores.
test.beforeEach(() => {
  test.skip(test.info().project.name !== 'chromium-desktop', 'checked once, in Chromium on the desktop');
});

test('sprite review page', async ({ page }) => {
  await page.goto('/?view=sprites');
  const sheet = page.getByTestId('sprite-sheet');
  await expect(sheet).toBeVisible();
  await expect(sheet).toHaveAttribute('data-ready', 'true');
  // The page itself never scrolls, so the window is made as tall as the sheet for the screenshot.
  const box = await sheet.boundingBox();
  await page.setViewportSize({ width: 1440, height: Math.ceil((box?.y ?? 0) + (box?.height ?? 900)) });
  await page.screenshot({ path: 'shots/sprites.png' });
});
