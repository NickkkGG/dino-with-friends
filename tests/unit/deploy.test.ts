import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

// Cloudflare builds the repository with `npm run build`, then `wrangler deploy` puts up the Worker named here, at
// dino-with-friends.<account>.workers.dev: the lobby server for /api and /ws, and the built site for everything else.
const read = (path: string) => readFileSync(fileURLToPath(new URL(`../../${path}`, import.meta.url)), 'utf8');
const wrangler = () => JSON.parse(read('wrangler.jsonc'));

it('runs the lobby Worker first for /api and /ws, and serves the built site for the rest', () => {
  const c = wrangler();
  expect(c.name).toBe('dino-with-friends');
  expect(c.main).toBe('./worker/index.ts');
  expect(c.assets).toEqual({ not_found_handling: 'single-page-application', run_worker_first: ['/api/*', '/ws/*'] });
  expect(c.compatibility_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(c.send_metrics).toBe(false);
});

it('binds one Durable Object class, Lobby, stored in SQLite', () => {
  const c = wrangler();
  expect(c.durable_objects).toEqual({ bindings: [{ name: 'LOBBY', class_name: 'Lobby' }] });
  expect(c.migrations).toEqual([{ tag: 'v1', new_sqlite_classes: ['Lobby'] }]);
});

it('builds on Node 24 on Cloudflare too', () => {
  expect(read('.node-version').trim()).toBe('24');
});
