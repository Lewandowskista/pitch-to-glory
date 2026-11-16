import type { Page } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { generateWorld } from '../src/engine/world/generate';
import { createSave, DEFAULT_SETTINGS } from '../src/persistence/schema';
import { expect, matchState, skipTutorial, test } from './support';

/**
 * Release 1.0 steps 4.2, 4.7 and 4.8: a failing page takes only itself down, a failing clip
 * renderer falls back to SVG stills, what went wrong is kept on the device and can be exported, and a
 * save open in another tab can be retried. Failures are forced: through the journeys' hook for a
 * page, by refusing a chunk's download for code loads.
 */

/** The console errors these journeys cause on purpose: removed, so anything else still fails. */
function expectFailures(errors: string[], ...patterns: RegExp[]): void {
  for (let index = errors.length - 1; index >= 0; index--)
    if (patterns.some((pattern) => pattern.test(errors[index]!))) errors.splice(index, 1);
}
/**
 * React reports each failure its boundaries catch on the console; Firefox shows the logged error
 * only as an object from the app's entry script.
 */
const CAUGHT =
  /^(?:Error|JSHandle@object) \(http:\/\/127\.0\.0\.1:\d+\/assets\/index-[\w-]+\.js\)$/;
const FORCED = /Forced page failure/;
const REFUSED_LOAD =
  /Failed to load resource|status of 503|dynamically imported module|Importing a module script failed/;
/**
 * A chunk the server cannot serve right now. Not an abort, and not cacheable: WebKit remembers
 * an aborted or cacheable failure for the page, which a real outage does not leave behind.
 */
const UNAVAILABLE = {
  status: 503,
  contentType: 'text/plain',
  headers: { 'Cache-Control': 'no-store' },
  body: 'Unavailable',
};

let backupPath: string;
test.beforeAll(async ({ browserName }, workerInfo) => {
  const world = generateWorld('resilience-browser');
  await mkdir('artifacts', { recursive: true });
  backupPath = `artifacts/resilience-${browserName}-${workerInfo.workerIndex}.json`;
  await writeFile(
    backupPath,
    JSON.stringify(
      createSave(1, 'Resilience', {
        kind: 'world',
        world,
        gallery: { seed: 'resilience', generation: 0 },
        settings: DEFAULT_SETTINGS,
      }),
    ),
  );
});
test.beforeEach(async ({ page }) => {
  await skipTutorial(page);
});
// Refused downloads are made in the page; a service worker would answer from its cache.
test.use({ serviceWorkers: 'block' });

async function importSave(page: Page) {
  await page.goto('/saves');
  await page
    .locator('.slot-card')
    .nth(0)
    .getByLabel('Import backup — Slot 1')
    .setInputFiles(backupPath);
  await expect(page.locator('.notice')).toHaveText('Save imported.', { timeout: 30000 });
}

test('a failing page keeps the shell, records the failure, and Retry brings it back', async ({
  page,
  runtimeErrors,
}) => {
  await page.addInitScript(() => {
    (window as { __ptgForceFailure?: { route: boolean } }).__ptgForceFailure = { route: true };
  });
  await page.goto('/gallery');
  const failure = page.getByRole('alert').filter({ hasText: 'This page ran into a problem.' });
  await expect(failure).toBeVisible();
  // The shell is alive: navigation and the save indicator are still there.
  await expect(page.locator('.sidebar').getByRole('link', { name: 'Settings' })).toBeVisible();
  await expect(page.locator('.save-indicator')).toBeVisible();
  await page.evaluate(() => {
    (window as { __ptgForceFailure?: { route: boolean } }).__ptgForceFailure = { route: false };
  });
  await failure.getByRole('button', { name: 'Try again' }).click();
  await expect(failure).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  // The failure is in Settings, and exports as a diagnostics file.
  await page.locator('.sidebar').getByRole('link', { name: 'Settings', exact: true }).click();
  const card = page.getByRole('region', { name: 'Diagnostics' });
  await expect(card.getByTestId('diagnostics-count')).toHaveText(/^[1-9]\d* problems? recorded$/);
  await expect(card).toContainText('Page failure');
  await expect(card).toContainText('Error: Forced page failure');
  const download = page.waitForEvent('download');
  await card.getByRole('button', { name: 'Export diagnostics' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^pitch-to-glory-diagnostics-\d{4}-\d{2}-\d{2}\.json$/);
  const report = JSON.parse(await readFile((await file.path())!, 'utf8')) as {
    format: string;
    app: { version: string; schema: number; engine: string };
    device: { class: string; browser: string };
    save: unknown;
    entries: { kind: string; source: string; message: string; route: string }[];
  };
  expect(report.format).toBe('pitch-to-glory-diagnostics');
  expect(report.app.schema).toBe(23);
  expect(report.app.engine).toMatch(/^match-\d+$/);
  expect(['low', 'mid', 'high']).toContain(report.device.class);
  expect(report.save).toBeNull();
  expect(report.entries).toContainEqual(
    expect.objectContaining({
      kind: 'boundary',
      source: 'route',
      message: 'Error: Forced page failure',
      route: '/gallery',
    }),
  );
  await expect(card.getByText('Diagnostics file downloaded.')).toBeVisible();

  // Report a bug: a prefilled issue in a new tab. Nothing is sent to GitHub here.
  await page
    .context()
    .route('https://github.com/**', (route) =>
      route.fulfill({ status: 200, contentType: 'text/html', body: '<title>Issue</title>' }),
    );
  const opened = page.context().waitForEvent('page');
  await card.getByRole('button', { name: 'Report a bug' }).click();
  const issue = new URL((await opened).url());
  expect(`${issue.origin}${issue.pathname}`).toBe(
    'https://github.com/Lewandowskista/pitch-to-glory/issues/new',
  );
  expect(issue.searchParams.get('body')).toContain(`Version: ${report.app.version}`);

  await card.getByRole('button', { name: 'Clear' }).click();
  await expect(card.getByTestId('diagnostics-count')).toHaveText(
    'No problems recorded on this device.',
  );
  expectFailures(runtimeErrors, FORCED, CAUGHT);
});

test('a page whose code cannot download says so, and Reload fetches it again', async ({
  page,
  browserName,
  runtimeErrors,
}) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  let refused = 0;
  let available = false;
  await page.route(/\/assets\/Settings-[\w-]+\.js$/, (route) => {
    if (available) return route.continue();
    refused++;
    return route.fulfill(UNAVAILABLE);
  });
  await page.locator('.sidebar').getByRole('link', { name: 'Settings', exact: true }).click();
  const failure = page.getByRole('alert').filter({ hasText: 'This page could not load.' });
  await expect(failure).toBeVisible({ timeout: 15000 });
  // The automatic retry ran first (where the engine fetches again; Chromium and WebKit keep a
  // failed module for the page, which is why the boundary offers a reload).
  expect(refused).toBeGreaterThanOrEqual(1);
  await expect(page.locator('.sidebar')).toBeVisible();
  available = true;
  const reloaded = page.waitForEvent('load');
  await failure.getByRole('button', { name: 'Reload game' }).click();
  await reloaded;
  // Playwright's WebKit keeps a module it refused for the rest of that page's life, even across
  // a reload, which a real outage does not: there, a new tab shows the reload's result.
  const settings = browserName === 'webkit' ? await page.context().newPage() : page;
  if (settings !== page) await settings.goto('/settings');
  await expect(settings.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
  await expect(settings.getByRole('region', { name: 'Diagnostics' })).toContainText(
    'Download failure',
  );
  expectFailures(runtimeErrors, REFUSED_LOAD, CAUGHT);
});

test('the match carries on with SVG stills when the clip renderer cannot load', async ({
  page,
  runtimeErrors,
}) => {
  test.setTimeout(120000);
  // Refused before anything can fetch it: the hub warms the renderer up while it is idle.
  await page.route(/\/assets\/clipScene-[\w-]+\.js$/, (route) => route.fulfill(UNAVAILABLE));
  await importSave(page);
  await page
    .getByRole('navigation')
    .first()
    .getByRole('link', { name: 'Matchday', exact: true })
    .click();
  await page.getByRole('button', { name: 'Prepare match', exact: true }).click();
  await expect(matchState(page)).toHaveAttribute('data-status', 'preview');
  await page.getByRole('button', { name: 'Kick off', exact: true }).click();
  // The match still plays: its moments are drawn as stills, and its decisions answered.
  const state = matchState(page);
  await expect
    .poll(
      async () => {
        if ((await state.getAttribute('data-beat')) === 'card') return true;
        await page.keyboard.press('Space');
        return false;
      },
      { timeout: 60000, intervals: [300] },
    )
    .toBe(true);
  await expect(page.locator('.reel-still')).toBeVisible();
  await expect(page.locator('.reel-stage-canvas canvas')).toHaveCount(0);
  await expect(page.locator('.reel-card button[data-choice]').first()).toBeFocused();
  const moment = await state.getAttribute('data-moment');
  await page.waitForTimeout(320);
  await page.keyboard.press('1');
  await expect(state).not.toHaveAttribute('data-moment', moment!);
  expectFailures(runtimeErrors, REFUSED_LOAD, CAUGHT);
});

test('a match address whose save is open in another tab offers Retry', async ({
  page,
  context,
}) => {
  test.setTimeout(90000);
  await importSave(page);
  await page.goto('/match?save=1');
  await expect(page.getByRole('button', { name: 'Prepare match', exact: true })).toBeVisible({
    timeout: 30000,
  });
  const second = await context.newPage();
  await skipTutorial(second);
  await second.goto('/match?save=1');
  const notice = second.locator('.match-notice[role="alert"]');
  await expect(notice).toContainText('This save is open in another tab.', { timeout: 30000 });
  // The first tab lets go of the save; Retry in the second loads it.
  await page.close();
  await notice.getByRole('button', { name: 'Try again' }).click();
  await expect(second.getByRole('button', { name: 'Prepare match', exact: true })).toBeVisible({
    timeout: 30000,
  });
  await second.close();
});
