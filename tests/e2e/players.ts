import { expect } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';

// Helpers for the tests where several players share a lobby, each in a browser window of their own.

/** A player in a new 1280 × 800 window with their name saved, on the title screen. */
export async function openPlayer(browser: Browser, o: { name: string; query?: string }): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  await named(page, o.name);
  await page.goto(`/${o.query ?? ''}`);
  await expect(page.getByTestId('title-screen')).toBeVisible();
  return page;
}

/** Saves a name before the page loads, as if YOUR NAME had been filled in on an earlier visit. */
export async function named(page: Page, name: string): Promise<void> {
  await page.addInitScript((n) => localStorage.setItem('dwf.name', n), name);
}

/** From the title to a new lobby, made by this player; gives its code. */
export async function createLobby(page: Page): Promise<string> {
  await page.getByTestId('btn-multiplayer').click();
  await page.getByTestId('btn-create').click();
  const code = page.getByTestId('lobby-code');
  await expect(code).toHaveText(/^[A-Z2-9]{6}$/);
  return (await code.textContent()) ?? '';
}

/** From the title into the lobby with this code. */
export async function joinLobby(page: Page, code: string): Promise<void> {
  await page.getByTestId('btn-multiplayer').click();
  await page.getByTestId('code-input').fill(code);
  await page.getByTestId('btn-join').click();
  await expect(page.getByTestId('lobby-screen')).toBeVisible();
}

/** Waits for `condition`, a JavaScript expression run in the page, to hold. */
export function until(page: Page, condition: string, timeout = 10_000): Promise<unknown> {
  return page.waitForFunction(condition, undefined, { timeout });
}

/** The query that makes a player a bot that cannot lose: it jumps by itself, and nothing costs it a heart. */
export const BOT = '?autopilot=1&invincible=1';

export interface Friend {
  name: string;
  query?: string;
}

/**
 * NICK makes a lobby on `page` (with `query` on its address), the friends join it in windows of their own, and NICK
 * starts the round. Gives the friends' pages.
 */
export async function startRace(page: Page, browser: Browser, friends: Friend[], query = ''): Promise<Page[]> {
  await named(page, 'NICK');
  await page.goto(`/${query}`);
  const code = await createLobby(page);
  const pages: Page[] = [];
  for (const f of friends) {
    const p = await openPlayer(browser, f);
    await joinLobby(p, code);
    pages.push(p);
  }
  await expect(page.getByTestId('players-count')).toHaveText(`PLAYERS ${friends.length + 1}/8`);
  await page.getByTestId('btn-start').click();
  return pages;
}

/** The line of player `id` on the race's tower. */
export const rowOf = (page: Page, id: string) => page.locator(`[data-testid="board-row"][data-player-id="${id}"]`);
