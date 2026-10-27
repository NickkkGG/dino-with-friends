import { cloudflare } from '@cloudflare/vite-plugin';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// One value for each build or each run of the dev server, the same in the page and in the lobby server it runs. A
// build reads this file more than once, a few ms apart, so the first read leaves its value for the later ones.
const BUILD_VERSION = (process.env.DWF_BUILD_VERSION ??= Date.now().toString(36));

export default defineConfig({
  plugins: [react(), cloudflare()],
  define: { __BUILD_VERSION__: JSON.stringify(BUILD_VERSION) },
  server: { host: true, port: 5173, strictPort: true },
});
