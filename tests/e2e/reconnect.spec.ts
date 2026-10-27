import { expect, test } from '@playwright/test';
import { BOT, createLobby, cutter, joinLobby, named, openPlayer, rowOf, startRace, until } from './players';

// A connection that drops, as Wi-Fi does: the page tries again by itself, keeps its seat, and says so on screen.

test('a lobby connection that drops comes back by itself, in the same seat', async ({ page, browser }) => {
  await named(page, 'NICK');
  const net = await cutter(page);
  await page.goto('/');
  const code = await createLobby(page);
  const friend = await openPlayer(browser, { name: 'RARA' });
  await joinLobby(friend, code);
  const nick = friend.locator('[data-testid="player-row"][data-player-id="p1"]');
  net.block(true);
  await net.cut();
  await expect(page.getByTestId('reconnecting')).toHaveText('RECONNECTING...');
  await expect(nick).toHaveAttribute('data-connected', 'false');
  await expect(friend.getByTestId('players-count')).toHaveText('PLAYERS 2/8');
  net.block(false);
  await expect(page.getByTestId('reconnecting')).toHaveCount(0, { timeout: 5000 });
  await expect(nick).toHaveAttribute('data-connected', 'true');
  expect(await page.evaluate(() => window.__dwf!.lobby)).toMatchObject({ status: 'joined', code, you: 'p1', host: true });
  await friend.context().close();
});

test('a short drop mid-race: RECONNECTING..., then the race goes on', async ({ page, browser }) => {
  const net = await cutter(page);
  const [rara] = await startRace(page, browser, [{ name: 'RARA', query: BOT }], BOT);
  await until(page, 'window.__dwf?.race?.phase === "running" && window.__dwf.step > 120');
  net.block(true);
  await net.cut();
  await expect(page.getByTestId('reconnecting')).toHaveText('RECONNECTING...');
  const before = await page.evaluate(() => window.__dwf!.step);
  await page.waitForTimeout(2000);
  expect(await page.evaluate(() => window.__dwf!.step)).toBeGreaterThan(before + 60); // the run never stopped
  net.block(false);
  await expect(page.getByTestId('reconnecting')).toHaveCount(0, { timeout: 5000 });
  await expect(rowOf(rara!, 'p1')).toHaveAttribute('data-alive', 'true');
  await expect(rowOf(rara!, 'p1')).toHaveAttribute('data-away', 'false');
  await rara!.context().close();
});

test('away more than 10 s mid-race: CONNECTION LOST, out of the round, and TRY AGAIN is back in the same seat', async ({ page, browser }) => {
  test.setTimeout(90_000);
  const net = await cutter(page);
  // two who cannot lose, so the round goes on once NICK is out
  const friends = await startRace(page, browser, [{ name: 'RARA', query: BOT }, { name: 'TOTO', query: BOT }], BOT);
  await until(page, 'window.__dwf?.race?.phase === "running" && window.__dwf.step > 120');
  net.block(true);
  await net.cut();
  await expect(page.getByTestId('mp-error')).toContainText('CONNECTION LOST', { timeout: 15_000 });
  await expect(rowOf(friends[0]!, 'p1')).toHaveAttribute('data-alive', 'false', { timeout: 15_000 });
  net.block(false);
  await page.getByTestId('btn-retry').click();
  await expect(page.getByTestId('race-canvas')).toHaveAttribute('data-mode', 'watch');
  expect(await page.evaluate(() => window.__dwf!.lobby!.you)).toBe('p1');
  await expect(page.getByTestId('next-round')).toHaveCount(0); // a runner of this round, now out
  for (const f of friends) await f.context().close();
});

test('a page from another build is asked to refresh', async ({ page }) => {
  await named(page, 'NICK');
  await page.goto('/?version=old');
  await page.getByTestId('btn-multiplayer').click();
  await page.getByTestId('btn-create').click();
  await expect(page.getByTestId('mp-error')).toContainText('NEW VERSION AVAILABLE');
  await expect(page.getByTestId('btn-retry')).toHaveCount(0);
  await page.getByTestId('btn-refresh').click();
  await expect(page.getByTestId('title-screen')).toBeVisible();
});
