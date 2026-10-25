import { defineConfig } from 'vitest/config';
import { readFileSync } from 'node:fs';
const { version } = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };
/**
 * The heavy statistical, soak and multi-season world tests: run on pushes to main (before every
 * deploy), nightly and before a release, while pull requests run the fast project (ci.yml).
 * A file joins by its name: `*.slow.test.ts`, or listed here.
 */
const SLOW = ['tests/**/*.slow.test.{ts,tsx}', 'tests/golden-saves.test.ts'];
const shared = {
  environment: 'node' as const,
  setupFiles: ['tests/setup.ts'],
  // The shared national test worlds (tests/support/world.ts), built once per source revision.
  globalSetup: ['tests/support/setup-worlds.ts'],
  restoreMocks: true,
  // CI splits the suite across machines (ci.yml), so a test's neighbours vary; the default
  // 5 seconds was too tight for whole-world validation on a busy shard. Slow tests still set
  // their own longer limits.
  testTimeout: 30000,
};
export default defineConfig({
  // The same build-time constant as vite.config.ts.
  define: { __APP_VERSION__: JSON.stringify(version) },
  test: {
    projects: [
      {
        extends: true,
        test: {
          ...shared,
          name: 'fast',
          include: ['tests/**/*.test.{ts,tsx}'],
          exclude: SLOW,
        },
      },
      {
        extends: true,
        test: { ...shared, name: 'slow', include: SLOW },
      },
    ],
  },
});
