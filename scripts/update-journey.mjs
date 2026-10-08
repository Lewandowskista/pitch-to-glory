/**
 * Two-build update journey (Phase 4.2): build a second release into `dist-next` (a different
 * public address, so its pages and service worker differ from `dist`), then run
 * e2e/update.spec.ts, which serves `dist` and replaces it with `dist-next` mid-career.
 * Needs a current `dist` (npm run build). Extra arguments go to Playwright.
 */
import { spawnSync } from 'node:child_process';

function run(command, args, env = {}) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    env: { ...process.env, ...env },
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
run('npx', ['vite', 'build', '--outDir', 'dist-next', '--emptyOutDir'], {
  SITE_URL: 'https://next.pitch-to-glory.test',
});
const extra = process.argv.slice(2);
run(
  'npx',
  ['playwright', 'test', 'e2e/update.spec.ts', ...(extra.length ? extra : ['--project=chromium'])],
  { UPDATE_JOURNEY: '1' },
);
