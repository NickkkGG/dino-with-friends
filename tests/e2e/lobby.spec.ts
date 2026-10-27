import { expect, test } from '@playwright/test';
import { makeCode } from '../../shared/lobby/code';
import { createLobby, named } from './players';

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

test('< LEAVE goes back to MULTIPLAYER', async ({ page }) => {
  await named(page, 'NICK');
  await page.goto('/');
  await createLobby(page);
  await page.getByTestId('btn-leave').click();
  await expect(page.getByTestId('multiplayer-screen')).toBeVisible();
  await expect(page.getByTestId('mp-error')).toHaveCount(0);
  expect(await page.evaluate(() => window.__dwf!.lobby)).toBeNull();
});
