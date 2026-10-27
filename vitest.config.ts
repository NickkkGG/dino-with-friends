import { defineConfig } from 'vitest/config';

// Apart from vite.config.ts, so the unit tests run without the Cloudflare plugin and the local Worker runtime it starts.
export default defineConfig({
  define: { __BUILD_VERSION__: JSON.stringify('test') },
  test: { include: ['tests/unit/**/*.test.ts'], environment: 'node' },
});
