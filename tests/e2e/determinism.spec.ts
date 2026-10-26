import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

// The same seed gives the same course and the same boxes in Node, Chromium and WebKit.

interface DigestFixture {
  course: Record<string, string>;
  boxes: Record<string, string>;
}

const fixture: DigestFixture = JSON.parse(
  readFileSync(fileURLToPath(new URL('../fixtures/sim-digests.json', import.meta.url)), 'utf8'),
);

test('course and box digests match the Node fixture', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('title-screen')).toBeVisible();
  for (const [seed, hex] of Object.entries(fixture.course)) {
    expect(await page.evaluate(([s]) => window.__dwf!.courseDigest(Number(s), 300), [seed]), `course ${seed}`).toBe(hex);
  }
  for (const [key, hex] of Object.entries(fixture.boxes)) {
    const [seed, playerId] = key.split(':') as [string, string];
    const got = await page.evaluate(([s, p]) => window.__dwf!.boxDigest(Number(s), p!, 20), [seed, playerId]);
    expect(got, `boxes ${key}`).toBe(hex);
  }
});
