import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import viteConfig from '../../vite.config';

// Cloudflare builds the site from the repository with `npm run build`, then `wrangler deploy` serves the files the build
// left in dist/ under the Worker named here, at dino-with-friends.<account>.workers.dev.
const wrangler = () => JSON.parse(readFileSync(fileURLToPath(new URL('../../wrangler.jsonc', import.meta.url)), 'utf8'));

it('serves the build output as the dino-with-friends Worker', () => {
  const config = wrangler();
  expect(config.name).toBe('dino-with-friends');
  expect(config.assets).toEqual({ directory: `./${viteConfig.build?.outDir ?? 'dist'}` });
  expect(config.compatibility_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
});

it('has no Worker code yet, so every request is answered with a file from the build', () => {
  expect(wrangler().main).toBeUndefined();
});
