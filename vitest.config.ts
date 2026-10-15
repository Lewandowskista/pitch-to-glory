import { defineConfig } from 'vitest/config';
import { readFileSync } from 'node:fs';
const { version } = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };
export default defineConfig({
  // The same build-time constant as vite.config.ts.
  define: { __APP_VERSION__: JSON.stringify(version) },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.{ts,tsx}'],
    setupFiles: ['tests/setup.ts'],
    restoreMocks: true,
    // CI splits the suite across machines (ci.yml), so a test's neighbours vary; the default
    // 5 seconds was too tight for whole-world validation on a busy shard. Slow tests still set
    // their own longer limits.
    testTimeout: 30000,
  },
});
