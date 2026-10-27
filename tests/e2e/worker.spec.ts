import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { isLobbyCode, makeCode } from '../../shared/lobby/code';

// The lobby server through the dev server, where the Cloudflare plugin runs the Worker and its Durable Object locally.

interface Talk {
  messages: unknown[];
  closeCode: number | null;
  now: number;
}

// Opens a WebSocket to a lobby from the page, sends `send` once it is open, and gathers what comes back until a
// message of type `until` arrives or the socket closes.
function talk(page: Page, code: string, send: object[], until: string): Promise<Talk> {
  return page.evaluate(
    ({ code, send, until }) =>
      new Promise<Talk>((resolve, reject) => {
        const ws = new WebSocket(`ws://${location.host}/ws/${code}`);
        const messages: unknown[] = [];
        const done = (closeCode: number | null) => resolve({ messages, closeCode, now: Date.now() });
        ws.onopen = () => {
          for (const m of send) ws.send(JSON.stringify(m));
        };
        ws.onmessage = (e) => {
          const m = JSON.parse(String(e.data)) as { type: string };
          messages.push(m);
          if (m.type === until) {
            ws.close();
            done(null);
          }
        };
        ws.onclose = (e) => done(e.code);
        setTimeout(() => reject(new Error(`no ${until} within 10 s: ${JSON.stringify(messages)}`)), 10_000);
      }),
    { code, send, until },
  );
}

test('POST /api/lobby makes a lobby code', async ({ request }) => {
  const res = await request.post('/api/lobby');
  expect(res.status()).toBe(200);
  const { code } = (await res.json()) as { code: string };
  expect(isLobbyCode(code)).toBe(true);
});

test('GET /api/lobby is not allowed', async ({ request }) => {
  expect((await request.get('/api/lobby')).status()).toBe(405);
});

test('a lobby address wants a WebSocket and a real code', async ({ request }) => {
  expect((await request.get('/ws/K7RM2Q')).status()).toBe(426);
  expect((await request.get('/ws/NOPE')).status()).toBe(404);
});

test('a lobby welcomes a player over a WebSocket and answers a ping', async ({ page, request }) => {
  const { code } = (await (await request.post('/api/lobby')).json()) as { code: string };
  await page.goto('/');
  const v = await page.evaluate(() => window.__dwf!.version);
  const got = await talk(page, code, [{ type: 'hello', v, name: 'nick', token: null }, { type: 'ping', c: 1 }], 'pong');
  expect(got.messages[0]).toEqual({ type: 'welcome', you: 'p1', token: expect.stringMatching(/^[0-9a-f-]{36}$/), code });
  expect(got.messages[1]).toEqual({
    type: 'lobby', phase: 'lobby', round: 0,
    players: [{ id: 'p1', name: 'NICK', host: true, connected: true, playing: false }],
  });
  const pong = got.messages[2] as { type: string; c: number; s: number };
  expect(pong).toMatchObject({ type: 'pong', c: 1 });
  expect(Math.abs(pong.s - got.now)).toBeLessThan(5000);
});

test('a hello from another build is told VERSION_MISMATCH and closed', async ({ page, request }) => {
  const { code } = (await (await request.post('/api/lobby')).json()) as { code: string };
  await page.goto('/');
  const got = await talk(page, code, [{ type: 'hello', v: 'old', name: 'nick', token: null }], 'never');
  expect(got.messages).toEqual([{ type: 'error', code: 'VERSION_MISMATCH' }]);
  expect(got.closeCode).toBe(1000);
});

test('a token brings the same seat back on a new socket', async ({ page, request }) => {
  const { code } = (await (await request.post('/api/lobby')).json()) as { code: string };
  await page.goto('/');
  const v = await page.evaluate(() => window.__dwf!.version);
  const first = await talk(page, code, [{ type: 'hello', v, name: 'nick', token: null }], 'welcome'); // closes after it
  const { token } = first.messages[0] as { token: string };
  const again = await talk(page, code, [{ type: 'hello', v, name: 'nick', token }], 'lobby');
  expect(again.messages[0]).toEqual({ type: 'welcome', you: 'p1', token, code });
  expect(again.messages[1]).toMatchObject({ players: [{ id: 'p1', connected: true }] });
});

test('a code nobody made says LOBBY_NOT_FOUND and closes', async ({ page }) => {
  const code = makeCode((n) => Math.floor(Math.random() * n));
  await page.goto('/');
  const got = await talk(page, code, [{ type: 'hello', name: 'nick' }], 'never');
  expect(got.messages).toEqual([{ type: 'error', code: 'LOBBY_NOT_FOUND' }]);
  expect(got.closeCode).toBe(4004);
});

test('any other address gets the game', async ({ page }) => {
  await page.goto('/some/deep/link');
  await expect(page.getByTestId('title-screen')).toBeVisible();
});
