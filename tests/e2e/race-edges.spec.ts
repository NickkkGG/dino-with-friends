import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { makeCode } from '../../shared/lobby/code';
import { BOT, createLobby, joinLobby, named, openPlayer, startRace, until } from './players';

// The edges of a race with friends: a full lobby, players who leave in the middle of a round, and every multiplayer
// screen on a laptop, an upright phone and a phone on its side.

const someCode = () => makeCode((n) => Math.floor(Math.random() * n));

/** The test ids of the elements on show that reach outside the window. */
function outside(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>('[data-testid]')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.left < -0.5 || r.top < -0.5 || r.right > innerWidth + 0.5 || r.bottom > innerHeight + 0.5) {
        out.push(el.dataset.testid ?? '');
      }
    }
    return out;
  });
}

/** Whether the race's tower shares no pixel with the track or the HUD strip over it. */
async function towerApart(page: Page): Promise<boolean> {
  const board = (await page.getByTestId('race-board').boundingBox())!;
  for (const id of ['race-canvas', 'race-hud-canvas']) {
    const b = await page.getByTestId(id).boundingBox();
    if (!b) continue; // not on show
    const apart = board.y + board.height <= b.y || b.y + b.height <= board.y
      || board.x + board.width <= b.x || b.x + b.width <= board.x;
    if (!apart) return false;
  }
  return true;
}

test('LOBBY IS FULL for the ninth player', async ({ page, browser }) => {
  await named(page, 'NICK');
  await page.goto('/');
  const code = await createLobby(page);
  // Seven more players, as sockets the page keeps open.
  await page.evaluate((c) => {
    const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
    const kept: WebSocket[] = [];
    for (let i = 0; i < 7; i++) {
      const ws = new WebSocket(`${scheme}://${location.host}/ws/${c}`);
      ws.onopen = () => ws.send(JSON.stringify({ type: 'hello', name: `BOT${i}` }));
      kept.push(ws);
    }
    (window as unknown as { kept: WebSocket[] }).kept = kept;
  }, code);
  await expect(page.getByTestId('players-count')).toHaveText('PLAYERS 8/8');
  const friend = await openPlayer(browser, { name: 'RARA' });
  await friend.getByTestId('btn-multiplayer').click();
  await friend.getByTestId('code-input').fill(code);
  await friend.getByTestId('btn-join').click();
  await expect(friend.getByTestId('mp-error')).toContainText('LOBBY IS FULL');
  await expect(page.getByTestId('players-count')).toHaveText('PLAYERS 8/8');
  await friend.context().close();
});

test('a friend who closes the page mid-race is out, and the race still ends', async ({ page, browser }) => {
  test.setTimeout(90_000);
  const [rara] = await startRace(page, browser, [{ name: 'RARA' }], BOT);
  await until(page, 'window.__dwf?.race?.phase === "running" && window.__dwf.step > 120');
  await rara!.context().close();
  await expect(page.getByTestId('results-screen')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('winner')).toHaveText('NICK WINS!');
  await expect(page.getByTestId('result-row')).toHaveCount(2);
  await expect(page.getByTestId('result-row').nth(1)).toHaveAttribute('data-player-id', 'p2');
});

test('the host leaving mid-race hands the lobby on', async ({ page, browser }) => {
  test.setTimeout(90_000);
  const rara = await openPlayer(browser, { name: 'RARA', query: BOT });
  const code = await createLobby(rara);
  await named(page, 'NICK');
  await page.goto('/');
  await joinLobby(page, code);
  await expect(rara.getByTestId('players-count')).toHaveText('PLAYERS 2/8');
  await rara.getByTestId('btn-start').click();
  await until(page, 'window.__dwf?.race?.phase === "running" && window.__dwf.step > 120');
  // The race has no LEAVE: a host who goes closes the page.
  await expect(rara.getByTestId('btn-leave')).toHaveCount(0);
  await rara.context().close();
  await expect(page.getByTestId('results-screen')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('lobby-screen')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('[data-testid="player-row"][data-player-id="p2"]')).toHaveAttribute('data-host', 'true');
  await expect(page.getByTestId('btn-start')).toHaveText('NEED 2 PLAYERS');
});

for (const size of [{ width: 1440, height: 900 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
  test(`every multiplayer screen fits ${size.width} × ${size.height}`, async ({ page, browser }, info) => {
    test.skip(!['chromium-desktop', 'chromium-phone'].includes(info.project.name), 'one laptop and one phone');
    test.setTimeout(120_000);
    await page.setViewportSize(size);
    await page.goto('/');
    await page.getByTestId('btn-multiplayer').click();
    await expect(page.getByTestId('name-screen')).toBeVisible();
    expect(await outside(page)).toEqual([]);
    await page.getByTestId('name-input').pressSequentially('NICK');
    await page.getByTestId('btn-ok').click();
    await expect(page.getByTestId('multiplayer-screen')).toBeVisible();
    expect(await outside(page)).toEqual([]);
    await page.getByTestId('code-input').fill(someCode());
    await page.getByTestId('btn-join').click();
    await expect(page.getByTestId('mp-error')).toContainText('LOBBY NOT FOUND');
    expect(await outside(page)).toEqual([]);
    await page.getByTestId('btn-create').click();
    const code = page.getByTestId('lobby-code');
    await expect(code).toHaveText(/^[A-Z2-9]{6}$/);
    const friend = await openPlayer(browser, { name: 'RARA', query: BOT });
    await joinLobby(friend, (await code.textContent()) ?? '');
    await expect(page.getByTestId('players-count')).toHaveText('PLAYERS 2/8');
    expect(await outside(page)).toEqual([]);
    await page.getByTestId('btn-start').click();
    await until(page, 'window.__dwf?.race?.count === 3');
    expect(await outside(page)).toEqual([]);
    expect(await towerApart(page)).toBe(true);
    await until(page, 'window.__dwf?.race?.phase === "running" && window.__dwf.step > 60');
    expect(await outside(page)).toEqual([]);
    expect(await towerApart(page)).toBe(true);
    await expect(page.getByTestId('results-screen')).toBeVisible({ timeout: 90_000 });
    expect(await outside(page)).toEqual([]);
    await friend.context().close();
  });
}
