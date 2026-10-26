import { expect, test } from '@playwright/test';

test('the page loads with the game title', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('DINO with FRIENDS');
  await expect(page.getByTestId('app')).toBeVisible();
});
