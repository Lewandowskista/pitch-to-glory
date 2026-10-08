/**
 * Performance checks on real play states (Phase 4.2): runs e2e/performance.spec.ts alone,
 * in Chromium, against the production preview. Create the saves first with
 * `npm run perf:fixtures`. Extra arguments go to Playwright.
 */
import { spawnSync } from 'node:child_process';

const result = spawnSync('npx', ['playwright', 'test', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: { ...process.env, PERFORMANCE: '1' },
  shell: process.platform === 'win32',
});
process.exit(result.status ?? 1);
