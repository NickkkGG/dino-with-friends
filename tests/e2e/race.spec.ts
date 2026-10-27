import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { BOT, openPlayer, rowOf, startRace, until } from './players';

// A round of the race, in the dev build with the lobby server running locally. NICK plays on the project's own screen,
// makes the lobby and starts the round; the others join it in windows of their own.

/** Every number the countdown on `p` shows from now until the round runs, in order. */
function countsSeen(p: Page): Promise<number[]> {
  return p.evaluate(
    () =>
      new Promise<number[]>((resolve) => {
        const seen: number[] = [];
        const look = () => {
          const race = window.__dwf?.race;
          const count = race?.count ?? null;
          if (count !== null && seen.at(-1) !== count) seen.push(count);
          if (race?.phase === 'running') resolve(seen);
          else requestAnimationFrame(look);
        };
        look();
      }),
  );
}

/** How far the round on `p` is off the shared clock, in 60 Hz steps: the least of ten looks, one a frame. */
function offClock(p: Page): Promise<number> {
  return p.evaluate(
    () =>
      new Promise<number>((resolve) => {
        let least = Infinity;
        let looks = 0;
        const look = () => {
          const d = window.__dwf!;
          least = Math.min(least, Math.abs(d.step - (d.race!.serverNow - d.race!.startAt) / (1000 / 60)));
          looks += 1;
          if (looks === 10) resolve(least);
          else requestAnimationFrame(look);
        };
        look();
      }),
  );
}

test('the host starts: everyone counts down together and runs on the same clock', async ({ page, browser }) => {
  const [friend] = await startRace(page, browser, [{ name: 'RARA' }]);
  const both = [page, friend!];
  const counts = both.map(countsSeen);
  for (const p of both) {
    await expect(p.getByTestId('race-screen')).toBeVisible();
    await expect(p.getByTestId('get-ready')).toBeVisible();
    await expect(p.getByTestId('race-board')).toContainText('ROUND 1');
    const rows = p.getByTestId('board-row');
    await expect(rows).toHaveCount(2);
    for (const row of await rows.all()) await expect(row).toContainText('00000');
  }
  expect(await page.evaluate(() => window.__dwf!.screen)).toBe('race');
  await expect(rowOf(page, 'p1')).toHaveAttribute('data-me', 'true');
  await expect(rowOf(page, 'p2')).toHaveAttribute('data-me', 'false');
  await expect(rowOf(friend!, 'p2')).toHaveAttribute('data-me', 'true');
  for (const c of counts) expect(await c).toEqual([3, 2, 1]);
  for (const p of both) {
    await until(p, 'window.__dwf?.race?.phase === "running" && window.__dwf.step > 30');
    expect(await offClock(p)).toBeLessThanOrEqual(2);
    await expect(p.getByTestId('get-ready')).toHaveCount(0);
  }
  await friend!.context().close();
});

test('a dino that is out stays on GAME OVER while the tower keeps going', async ({ page, browser }) => {
  test.setTimeout(120_000);
  // Two who cannot lose keep the round going once NICK is out; one alone, and ahead of NICK, would end it there.
  const friends = await startRace(page, browser, [{ name: 'RARA', query: BOT }, { name: 'TOTO', query: BOT }]);
  await until(page, 'window.__dwf?.phase === "dead"', 90_000);
  await expect(rowOf(page, 'p1')).toHaveAttribute('data-alive', 'false');
  const board = page.getByTestId('race-board');
  const before = await board.textContent();
  await expect.poll(() => board.textContent(), { timeout: 5_000 }).not.toBe(before);
  expect(await page.evaluate(() => [window.__dwf!.screen, window.__dwf!.phase, window.__dwf!.race?.phase])).toEqual([
    'race', 'dead', 'dead',
  ]);
  await expect(page.getByTestId('race-canvas')).toBeVisible();
  for (const f of friends) await f.context().close();
});

test('the race screen keeps the tower and the track apart', async ({ page, browser }) => {
  const [friend] = await startRace(page, browser, [{ name: 'RARA' }]);
  await expect(page.getByTestId('race-canvas')).toBeVisible();
  const box = async (id: string) => (await page.getByTestId(id).boundingBox())!;
  const board = await box('race-board');
  const parts = [await box('race-canvas')];
  if (await page.getByTestId('race-hud-canvas').isVisible()) parts.push(await box('race-hud-canvas'));
  const vp = page.viewportSize()!;
  for (const b of [board, ...parts]) {
    expect(b.x).toBeGreaterThanOrEqual(0);
    expect(b.y).toBeGreaterThanOrEqual(0);
    expect(b.x + b.width).toBeLessThanOrEqual(vp.width + 0.5);
    expect(b.y + b.height).toBeLessThanOrEqual(vp.height + 0.5);
  }
  for (const b of parts) {
    const apart = board.y + board.height <= b.y || b.y + b.height <= board.y
      || board.x + board.width <= b.x || b.x + b.width <= board.x;
    expect(apart).toBe(true);
  }
  await friend!.context().close();
});

test('a full race: results, the winner, and back to the lobby for round 2', async ({ page, browser }) => {
  test.setTimeout(120_000);
  const [friend] = await startRace(page, browser, [{ name: 'RARA', query: BOT }]);
  await expect(page.getByTestId('results-screen')).toBeVisible({ timeout: 90_000 });
  await expect(page.getByTestId('auto-back')).toHaveText('AUTOMATIC IN 5');
  for (const p of [page, friend!]) {
    await expect(p.getByTestId('results-screen')).toBeVisible();
    await expect(p.getByTestId('results-title')).toHaveText('ROUND 1 RESULTS');
    await expect(p.getByTestId('winner')).toHaveText('RARA WINS!');
    await expect(p.getByTestId('result-row')).toHaveCount(2);
    await expect(p.getByTestId('result-row').first()).toHaveAttribute('data-player-id', 'p2');
  }
  expect(await page.evaluate(() => window.__dwf!.screen)).toBe('results');
  await expect(friend!.locator('[data-testid="result-row"][data-player-id="p2"]')).toHaveAttribute('data-me', 'true');
  await expect(page.locator('[data-testid="result-row"][data-player-id="p1"]')).toHaveAttribute('data-me', 'true');
  await expect(page.getByTestId('auto-back')).toHaveText('AUTOMATIC IN 4');
  for (const p of [page, friend!]) {
    await expect(p.getByTestId('lobby-screen')).toBeVisible({ timeout: 8_000 });
    await expect(p.getByTestId('players-count')).toHaveText('PLAYERS 2/8');
  }
  await expect(page.getByTestId('btn-start')).toBeEnabled();
  await page.getByTestId('btn-start').click();
  await expect(page.getByTestId('race-board')).toContainText('ROUND 2');
  await expect(friend!.getByTestId('race-board')).toContainText('ROUND 2');
  await friend!.context().close();
});

test('BACK TO LOBBY goes back at once', async ({ page, browser }) => {
  test.setTimeout(120_000);
  const [friend] = await startRace(page, browser, [{ name: 'RARA', query: BOT }]);
  await expect(page.getByTestId('results-screen')).toBeVisible({ timeout: 90_000 });
  const shown = Date.now();
  await page.getByTestId('btn-back-to-lobby').click();
  await expect(page.getByTestId('lobby-screen')).toBeVisible();
  expect(Date.now() - shown).toBeLessThan(4_000);
  // The results are still on for the others, so START waits for the lobby to be back for everyone.
  await expect(friend!.getByTestId('results-screen')).toBeVisible();
  await expect(page.getByTestId('btn-start')).toBeDisabled();
  await expect(page.getByTestId('btn-start')).toBeEnabled({ timeout: 8_000 });
  await friend!.context().close();
});

test('a friend who comes in during the race watches the tower, then plays the next round', async ({ page, browser }) => {
  test.setTimeout(150_000);
  const [rara] = await startRace(page, browser, [{ name: 'RARA' }], BOT);
  await until(page, 'window.__dwf?.race?.phase === "running"');
  const code = (await page.evaluate(() => window.__dwf!.lobby!.code)) ?? '';
  const dika = await openPlayer(browser, { name: 'DIKA' });
  await dika.getByTestId('btn-multiplayer').click();
  await dika.getByTestId('code-input').fill(code);
  await dika.getByTestId('btn-join').click();
  await expect(dika.getByTestId('next-round')).toHaveText('YOU PLAY NEXT ROUND');
  await expect(dika.getByTestId('board-row')).toHaveCount(2);
  await expect(dika.getByTestId('race-canvas')).toHaveCount(0);
  // RARA, who plays nothing, is out: DIKA sees the results of the round they watched, then everyone is in the lobby.
  await expect(dika.getByTestId('results-screen')).toBeVisible({ timeout: 90_000 });
  await expect(dika.getByTestId('winner')).toHaveText('NICK WINS!');
  for (const p of [page, dika]) await expect(p.getByTestId('lobby-screen')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('players-count')).toHaveText('PLAYERS 3/8');
  await expect(page.getByTestId('btn-start')).toBeEnabled();
  await page.getByTestId('btn-start').click();
  await expect(page.getByTestId('board-row')).toHaveCount(3);
  await expect(rowOf(page, 'p3')).toContainText('DIKA');
  await expect(dika.getByTestId('race-canvas')).toBeVisible();
  for (const p of [rara!, dika]) await p.context().close();
});
