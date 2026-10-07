/**
 * Release journey for a custom domain: build with SITE_URL into `dist-custom` (never `dist`,
 * which other checks and the deploy use) and run `e2e/release.spec.ts` against it on its own
 * preview port. Extra arguments go to Playwright; Chromium is the default browser.
 */
import { spawnSync } from 'node:child_process';

const env = {
  ...process.env,
  SITE_URL: process.env.CUSTOM_SITE_URL ?? 'https://play.pitch-to-glory.test',
  PREVIEW_DIR: 'dist-custom',
  PREVIEW_PORT: '4174',
};
function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    env,
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
const extra = process.argv.slice(2);
run('npx', ['vite', 'build', '--outDir', 'dist-custom', '--emptyOutDir']);
run('npx', [
  'playwright',
  'test',
  'e2e/release.spec.ts',
  ...(extra.length ? extra : ['--project=chromium']),
]);
