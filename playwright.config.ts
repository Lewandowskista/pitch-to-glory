import { defineConfig, devices } from '@playwright/test';

/**
 * `PREVIEW_DIR`/`PREVIEW_PORT` serve another build, such as the custom-domain build of
 * `npm run test:release:custom`, without touching `dist` or the default port.
 */
const port = Number(process.env.PREVIEW_PORT ?? 4173);
const outDir = process.env.PREVIEW_DIR;
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  // One retry absorbs runner noise, but a test that only passes on retry still fails CI.
  retries: process.env.CI ? 1 : 0,
  failOnFlakyTests: Boolean(process.env.CI),
  workers: process.env.CI ? 2 : 3,
  reporter: 'list',
  use: { baseURL: `http://127.0.0.1:${port}`, trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    command: `npm run preview -- --port ${port} --strictPort${outDir ? ` --outDir ${outDir}` : ''}`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: !process.env.CI,
  },
});
