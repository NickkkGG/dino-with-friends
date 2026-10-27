import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { BOT, rowOf, startRace, stopFrames } from './players';

// Watching the race: NICK, who plays nothing, is soon out and watches the friends, bots that cannot lose, who keep the
// round going.

/** performance.now() on `p` when its own dino is out, waited for frame by frame. */
const outAt = (p: Page) => p.evaluate(() => new Promise<number>((resolve) => {
  const look = () => (window.__dwf?.phase === 'dead' ? resolve(performance.now()) : requestAnimationFrame(look));
  look();
}));

const NAMES: Record<string, string> = { p2: 'RARA', p3: 'TOTO', p4: 'DIKA' };

/** The head of player `id` peeking in on `p`'s screen. */
const peekOf = (p: Page, id: string) => p.locator(`[data-testid="peek-slot"][data-player-id="${id}"]`);

/** The runner `p` watches now. */
const targetOf = (p: Page) => p.evaluate(() => window.__dwf!.watch!.target);

test('a runner who is out watches the leader 2 s after GAME OVER, and peeks in on their screen', async ({ page, browser }, info) => {
  test.setTimeout(150_000);
  const friends = await startRace(page, browser, [{ name: 'RARA', query: BOT }, { name: 'TOTO', query: BOT }]);
  const died = await outAt(page);
  await expect(page.getByTestId('watch-label')).toHaveText(/^WATCHING (RARA|TOTO)$/, { timeout: 5000 });
  expect((await page.evaluate(() => performance.now())) - died).toBeGreaterThan(1800);
  const target = await targetOf(page);
  const watched = friends[target === 'p2' ? 0 : 1]!;
  await expect(page.getByTestId('race-canvas')).toHaveAttribute('data-mode', 'watch');
  await expect(rowOf(page, target)).toHaveAttribute('data-framed', 'true');
  await expect(page.getByTestId('switch-hint')).toHaveText(info.project.name.endsWith('-phone') ? 'TAP A NAME TO SWITCH' : '← → TO SWITCH');
  const [mine, theirs] = await Promise.all([page.evaluate(() => window.__dwf!.score), watched.evaluate(() => window.__dwf!.score)]);
  expect(theirs - mine).toBeGreaterThanOrEqual(-2);
  expect(theirs - mine).toBeLessThan(30);
  await expect(peekOf(watched, 'p1')).toBeVisible();
  await expect(peekOf(page, 'p1')).toHaveAttribute('data-me', 'true');
  const board = page.getByTestId('race-board');
  const before = await board.textContent();
  await expect.poll(() => board.textContent(), { timeout: 5000 }).not.toBe(before);
  for (const f of friends) await f.context().close();
});

test('← → and a tap on a name switch the runner watched, and the head moves with it', async ({ page, browser }) => {
  test.setTimeout(150_000);
  const friends = await startRace(page, browser, [{ name: 'RARA', query: BOT }, { name: 'TOTO', query: BOT }]);
  await expect(page.getByTestId('watch-label')).toBeVisible({ timeout: 100_000 });
  const first = await targetOf(page);
  const other = first === 'p2' ? 'p3' : 'p2';
  const screenOf = (id: string) => friends[id === 'p2' ? 0 : 1]!;
  await expect(peekOf(screenOf(first), 'p1')).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => targetOf(page)).toBe(other);
  await expect(page.getByTestId('watch-label')).toHaveText(`WATCHING ${NAMES[other]}`);
  await expect(peekOf(screenOf(first), 'p1')).toHaveCount(0);
  await expect(peekOf(screenOf(other), 'p1')).toBeVisible();
  await rowOf(page, first).click();
  await expect.poll(() => targetOf(page)).toBe(first);
  await expect(page.getByTestId('watch-label')).toHaveText(`WATCHING ${NAMES[first]}`);
  await expect(rowOf(page, first)).toHaveAttribute('data-framed', 'true');
  for (const f of friends) await f.context().close();
});

test('when the runner watched is out, the view moves to the leader 2 s later', async ({ page, browser }) => {
  test.setTimeout(150_000);
  // NICK and three bots: once the one NICK watches is out, two still run, so the round goes on.
  const friends = await startRace(page, browser, [{ name: 'RARA', query: BOT }, { name: 'TOTO', query: BOT }, { name: 'DIKA', query: BOT }]);
  await expect(page.getByTestId('watch-label')).toBeVisible({ timeout: 100_000 });
  const x = await targetOf(page);
  await stopFrames(friends[Number(x.slice(1)) - 2]!);
  await expect(rowOf(page, x)).toHaveAttribute('data-alive', 'false', { timeout: 20_000 });
  const seen = Date.now();
  await expect.poll(() => targetOf(page), { timeout: 5000 }).not.toBe(x);
  expect(Date.now() - seen).toBeGreaterThan(1500);
  const y = await targetOf(page);
  await expect(page.getByTestId('watch-label')).toHaveText(`WATCHING ${NAMES[y]}`);
  for (const f of friends) await f.context().close();
});
