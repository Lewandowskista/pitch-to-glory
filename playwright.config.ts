import { defineConfig, devices } from '@playwright/test';

/**
 * `PREVIEW_DIR`/`PREVIEW_PORT` serve another build, such as the custom-domain build of
 * `npm run test:release:custom`, without touching `dist` or the default port.
 */
const port = Number(process.env.PREVIEW_PORT ?? 4173);
const outDir = process.env.PREVIEW_DIR;
/**
 * `PERFORMANCE=1` runs only the performance project (e2e/performance.spec.ts): alone, in
 * Chromium, with nothing else competing for the machine. Ordinary runs never include it.
 */
const performance = Boolean(process.env.PERFORMANCE);
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  // One retry absorbs runner noise, but a test that only passes on retry still fails CI.
  retries: process.env.CI ? 1 : 0,
  failOnFlakyTests: Boolean(process.env.CI),
  workers: performance ? 1 : process.env.CI ? 2 : 3,
  reporter: 'list',
  use: { baseURL: `http://127.0.0.1:${port}`, trace: 'retain-on-failure' },
  projects: performance
    ? [
        {
          name: 'performance',
          testMatch: /performance\.spec\.ts/,
          retries: 0,
          use: { ...devices['Desktop Chrome'] },
        },
      ]
    : [
        {
          name: 'chromium',
          testIgnore: /performance\.spec\.ts/,
          use: { ...devices['Desktop Chrome'] },
        },
        {
          name: 'firefox',
          testIgnore: /performance\.spec\.ts/,
          use: { ...devices['Desktop Firefox'] },
        },
        {
          name: 'webkit',
          testIgnore: /performance\.spec\.ts/,
          use: { ...devices['Desktop Safari'] },
        },
      ],
  webServer: {
    command: `npm run preview -- --port ${port} --strictPort${outDir ? ` --outDir ${outDir}` : ''}`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: !process.env.CI,
  },
});
