import { networkInterfaces } from 'node:os';
import { expect, test } from '@playwright/test';
import { makeCode } from '../../shared/lobby/code';
import { createLobby, joinLobby, named, openPlayer } from './players';

// YOUR NAME, MULTIPLAYER and the way into a lobby, in the dev build with the lobby server running locally.

const someCode = () => makeCode((n) => Math.floor(Math.random() * n));

test('asks for a name the first time, then remembers it', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('btn-multiplayer').click();
  await expect(page.getByTestId('name-screen')).toBeVisible();
  await expect(page.getByTestId('btn-ok')).toBeDisabled();
  await page.getByTestId('name-input').pressSequentially('nick 2!');
  await expect(page.getByTestId('name-box')).toContainText('NICK2');
  await page.getByTestId('btn-ok').click();
  await expect(page.getByTestId('multiplayer-screen')).toBeVisible();
  await expect(page.getByText('PLAYING AS NICK2', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.__dwf!.screen)).toBe('multiplayer');

  await page.reload();
  await page.getByTestId('btn-multiplayer').click();
  await expect(page.getByTestId('multiplayer-screen')).toBeVisible();
  await page.getByTestId('btn-rename').click();
  await expect(page.getByTestId('name-screen')).toBeVisible();
  await expect(page.getByTestId('name-box')).toContainText('NICK2');
  await page.getByTestId('btn-back').click();
  await expect(page.getByTestId('multiplayer-screen')).toBeVisible();
  await page.getByTestId('btn-back').click();
  await expect(page.getByTestId('title-screen')).toBeVisible();
});

test('the code boxes take only the 31 symbols, and JOIN waits for all six', async ({ page }) => {
  await named(page, 'NICK');
  await page.goto('/');
  await page.getByTestId('btn-multiplayer').click();
  const input = page.getByTestId('code-input');
  await input.pressSequentially('k7r');
  for (const [i, ch] of ['K', '7', 'R'].entries()) await expect(page.getByTestId(`code-box-${i}`)).toHaveText(ch);
  await expect(page.getByTestId('btn-join')).toBeDisabled();
  await input.pressSequentially('o1m2q!');
  for (const [i, ch] of [...'K7RM2Q'].entries()) await expect(page.getByTestId(`code-box-${i}`)).toHaveText(ch);
  await expect(page.getByTestId('btn-join')).toBeEnabled();
});

test('CREATE LOBBY opens the lobby with a new code', async ({ page }) => {
  await named(page, 'NICK');
  await page.goto('/');
  const code = await createLobby(page);
  await expect(page.getByTestId('lobby-screen')).toContainText('NICK');
  expect(await page.evaluate(() => window.__dwf!.screen)).toBe('lobby');
  expect(await page.evaluate(() => window.__dwf!.lobby)).toEqual({
    status: 'joined', code, you: 'p1', phase: 'lobby', round: 0, players: 1, host: true,
  });
});

test('a double click on CREATE LOBBY makes one lobby', async ({ page }) => {
  await named(page, 'NICK');
  await page.goto('/');
  let posts = 0;
  page.on('request', (r) => {
    if (r.method() === 'POST' && new URL(r.url()).pathname === '/api/lobby') posts++;
  });
  await page.getByTestId('btn-multiplayer').click();
  await page.getByTestId('btn-create').dblclick();
  await expect(page.getByTestId('lobby-screen')).toBeVisible();
  expect(posts).toBe(1);
});

test('JOIN with a code nobody made says LOBBY NOT FOUND', async ({ page }) => {
  await named(page, 'NICK');
  await page.goto('/');
  await page.getByTestId('btn-multiplayer').click();
  await page.getByTestId('code-input').fill(someCode());
  await page.getByTestId('code-input').press('Enter');
  await expect(page.getByTestId('mp-error')).toContainText('LOBBY NOT FOUND');
  await expect(page.getByTestId('multiplayer-screen')).toBeVisible();
  await expect(page.getByTestId('btn-retry')).toHaveCount(0);
  await expect(page.getByTestId('btn-join')).toBeEnabled();
});

test("CAN'T CONNECT when the server cannot be reached, and TRY AGAIN works once it can", async ({ page }) => {
  await named(page, 'NICK');
  await page.goto('/');
  await page.route('**/api/lobby', (route) => route.abort());
  await page.getByTestId('btn-multiplayer').click();
  await page.getByTestId('btn-create').click();
  await expect(page.getByTestId('mp-error')).toContainText("CAN'T CONNECT");
  await page.unroute('**/api/lobby');
  await page.getByTestId('btn-retry').click();
  await expect(page.getByTestId('lobby-screen')).toBeVisible();
});

test('a dropped connection keeps its seat in the lobby', async ({ page, browser }) => {
  await named(page, 'NICK');
  // The page's lobby sockets pass through here, so the first one can be cut as a dropped Wi-Fi would cut it.
  const cuts: (() => Promise<void>)[] = [];
  await page.routeWebSocket(/\/ws\/[A-Z2-9]{6}$/, (ws) => {
    const server = ws.connectToServer();
    cuts.push(async () => {
      await server.close();
      await ws.close();
    });
  });
  await page.goto('/');
  const code = await createLobby(page);
  const friend = await openPlayer(browser, { name: 'RARA' });
  await joinLobby(friend, code);
  await expect(page.getByTestId('players-count')).toHaveText('PLAYERS 2/8');
  await cuts[0]!();
  await expect(page.getByTestId('mp-error')).toContainText('CONNECTION LOST');
  // Long enough for the lobby to hear of the close: NICK's seat stays, waiting for him.
  await friend.waitForTimeout(1000);
  await expect(friend.getByTestId('players-count')).toHaveText('PLAYERS 2/8');
  await friend.context().close();
});

test('< LEAVE goes back to MULTIPLAYER', async ({ page }) => {
  await named(page, 'NICK');
  await page.goto('/');
  await createLobby(page);
  await page.getByTestId('btn-leave').click();
  await expect(page.getByTestId('multiplayer-screen')).toBeVisible();
  await expect(page.getByTestId('mp-error')).toHaveCount(0);
  expect(await page.evaluate(() => window.__dwf!.lobby)).toBeNull();
});

test('two players in a lobby: the host can start, the friend waits', async ({ page, browser }) => {
  await named(page, 'NICK');
  await page.goto('/');
  const code = await createLobby(page);
  await expect(page.getByTestId('players-count')).toHaveText('PLAYERS 1/8');
  await expect(page.getByTestId('btn-start')).toHaveText('NEED 2 PLAYERS');
  await expect(page.getByTestId('btn-start')).toBeDisabled();
  await expect(page.getByTestId('host-note')).toHaveText('ONLY THE HOST CAN START');

  const friend = await openPlayer(browser, { name: 'RARA' });
  await joinLobby(friend, code);
  for (const p of [page, friend]) {
    await expect(p.getByTestId('players-count')).toHaveText('PLAYERS 2/8');
    await expect(p.locator('[data-testid="player-row"][data-player-id="p1"]')).toHaveAttribute('data-host', 'true');
    await expect(p.locator('[data-testid="player-row"][data-player-id="p2"]')).toHaveAttribute('data-host', 'false');
  }
  await expect(page.getByTestId('btn-start')).toHaveText('START');
  await expect(page.getByTestId('btn-start')).toBeEnabled();
  await expect(friend.getByTestId('waiting-host')).toHaveText('WAITING FOR HOST...');
  await expect(friend.getByTestId('btn-start')).toHaveCount(0);
  await friend.context().close();
});

test('the host leaves and the friend becomes host', async ({ page, browser }) => {
  await named(page, 'NICK');
  await page.goto('/');
  const code = await createLobby(page);
  const friend = await openPlayer(browser, { name: 'RARA' });
  await joinLobby(friend, code);
  await expect(friend.getByTestId('waiting-host')).toBeVisible();
  await page.getByTestId('btn-leave').click();
  await expect(friend.getByTestId('players-count')).toHaveText('PLAYERS 1/8');
  await expect(friend.getByTestId('btn-start')).toHaveText('NEED 2 PLAYERS');
  await expect(friend.locator('[data-testid="player-row"][data-player-id="p2"]')).toHaveAttribute('data-host', 'true');
  await friend.context().close();
});

test('TAP TO COPY copies the code', async ({ page, context }, info) => {
  const chromium = info.project.name.startsWith('chromium');
  if (chromium) await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await named(page, 'NICK');
  await page.goto('/');
  const code = await createLobby(page);
  await expect(page.getByTestId('copy-hint')).toHaveText('TAP TO COPY');
  await page.getByTestId('lobby-code').click();
  await expect(page.getByTestId('copy-hint')).toHaveText('COPIED!');
  if (chromium) expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(code);
  await expect(page.getByTestId('copy-hint')).toHaveText('TAP TO COPY', { timeout: 3000 });
});

test('TAP TO COPY copies the code on the Wi-Fi address too', async ({ browser }) => {
  const ip = Object.values(networkInterfaces())
    .flat()
    .find((a) => a !== undefined && a.family === 'IPv4' && !a.internal)?.address;
  test.skip(ip === undefined, 'this machine has no address on a local network');
  const page = await browser.newPage();
  await named(page, 'NICK');
  await page.goto(`http://${ip}:5173/`);
  expect(await page.evaluate(() => window.isSecureContext)).toBe(false);
  await createLobby(page);
  await page.getByTestId('lobby-code').click();
  await expect(page.getByTestId('copy-hint')).toHaveText('COPIED!');
  await page.close();
});
