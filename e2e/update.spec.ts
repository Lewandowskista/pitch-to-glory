import type { Page } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { advanceCareerWeek } from '../src/engine/career/season';
import { pendingCareerFixture } from '../src/engine/career/fixtures';
import { autoPlayCareerFixture } from '../src/engine/career/matches';
import { createSave, DEFAULT_SETTINGS } from '../src/persistence/schema';
import { expect, nationalCareer, skipTutorial, test } from './support';

/**
 * Phase 4.2: a real deployment update. The old build (dist) runs a saved career; the new build
 * (dist-next, from `npm run test:update`) replaces it at the same address; the player accepts
 * the update, the career is checkpointed and continues, then keeps working offline.
 */
/**
 * Each worker serves its own port, so repeated runs never share a server (`UPDATE_PORT` moves
 * the range, for runs beside another checkout's).
 */
const portFor = (worker: number) => Number(process.env.UPDATE_PORT ?? 4176) + worker;
const save = 'artifacts/update-career.json';

function serve(outDir: string, port: number): Promise<ChildProcess> {
  const origin = `http://127.0.0.1:${port}`;
  const server = spawn(
    process.execPath,
    [
      'node_modules/vite/bin/vite.js',
      'preview',
      '--host',
      '127.0.0.1',
      '--port',
      String(port),
      '--strictPort',
      '--outDir',
      outDir,
    ],
    { stdio: 'ignore', windowsHide: true },
  );
  return (async () => {
    for (let attempt = 0; attempt < 200; attempt++) {
      try {
        if ((await fetch(origin)).ok) return server;
      } catch {
        // Still starting.
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    server.kill();
    throw new Error(`Could not serve ${outDir}`);
  })();
}
async function stop(server: ChildProcess) {
  if (server.exitCode !== null) return;
  await new Promise<void>((resolve) => {
    server.once('exit', () => resolve());
    server.kill();
  });
}
const week = (page: Page) =>
  page
    .getByRole('region', { name: 'Next match' })
    .locator('p', { hasText: /^Week \d+/ })
    .first()
    .textContent();

test.beforeAll(async () => {
  let world = nationalCareer('update-journey');
  for (let guard = 0; guard < 6 && world.date.week < 3; guard++)
    world = advanceCareerWeek(world, { inPlace: true, autoPlay: true }).world;
  // Play this week's match, as a player would: Continue is then the next action.
  for (let pending = pendingCareerFixture(world); pending; pending = pendingCareerFixture(world))
    autoPlayCareerFixture(world, pending);
  await mkdir('artifacts', { recursive: true });
  await writeFile(
    save,
    JSON.stringify(
      createSave(1, 'Update', {
        kind: 'world',
        world,
        gallery: { seed: 'update', generation: 0 },
        settings: DEFAULT_SETTINGS,
      }),
    ),
  );
});

test('an update reaches a saved career, keeps it and works offline', async ({
  page,
  context,
  browserName,
}, testInfo) => {
  // Only through `npm run test:update`, which builds a fresh second release first.
  test.skip(
    !process.env.UPDATE_JOURNEY || !existsSync('dist-next'),
    'Run npm run test:update to build the second release and run this journey',
  );
  test.skip(browserName !== 'chromium', 'One engine is enough for the release mechanics');
  test.setTimeout(240000);
  await skipTutorial(page);

  const port = portFor(testInfo.workerIndex);
  const origin = `http://127.0.0.1:${port}`;
  let server = await serve('dist', port);
  try {
    await page.goto(`${origin}/saves`);
    await page
      .locator('.slot-card')
      .nth(0)
      .getByLabel('Import backup — Slot 1')
      .setInputFiles(save);
    await expect(page.locator('.notice')).toHaveText('Save imported.', { timeout: 60000 });
    await page.goto(`${origin}/career?save=1`);
    await expect(page.getByRole('region', { name: 'Needs you' })).toBeVisible({ timeout: 30000 });
    // The old build's service worker controls the page.
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null, {
      timeout: 30000,
    });
    const oldCanonical = await page.locator('link[rel="canonical"]').getAttribute('href');

    // The career moves on and checkpoints under the old build.
    await page.getByRole('button', { name: 'Continue to next matchday' }).click();
    await expect(page.getByRole('link', { name: 'Play matchday' })).toBeVisible({
      timeout: 60000,
    });
    await expect(page.getByText('All changes saved').first()).toBeVisible({ timeout: 30000 });
    const before = await week(page);

    // The new release is deployed at the same address.
    await stop(server);
    server = await serve('dist-next', port);
    await page.evaluate(() =>
      navigator.serviceWorker.getRegistration().then((registration) => registration?.update()),
    );
    const prompt = page.getByRole('status').filter({ hasText: 'An update is ready.' });
    await expect(prompt).toBeVisible({ timeout: 60000 });
    await prompt.getByRole('button', { name: 'Save & update' }).click();

    // The page reloads into the new build with the career exactly where it was.
    await expect
      .poll(() => page.locator('link[rel="canonical"]').getAttribute('href'), { timeout: 60000 })
      .not.toBe(oldCanonical);
    await expect(page.getByRole('region', { name: 'Needs you' })).toBeVisible({ timeout: 30000 });
    expect(await week(page)).toBe(before);

    // Offline: the new build and the career load from the device, and the match is playable.
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole('region', { name: 'Needs you' })).toBeVisible({ timeout: 30000 });
    expect(await week(page)).toBe(before);
    await page.getByRole('link', { name: 'Play matchday' }).click();
    await expect(
      page.getByRole('button', { name: 'Go to the pre-match briefing', exact: true }),
    ).toBeVisible({ timeout: 30000 });
    await context.setOffline(false);
  } finally {
    await stop(server);
  }
  // Console and page errors fail the journey when it ends (e2e/support.ts).
});

/**
 * Release 1.0 step 4.1 (review S2): an update with two tabs open. While one tab holds a world
 * that is not in a save slot, the other's update is refused and says which tab and why; once
 * it is saved, the update goes ahead and both tabs reload onto the new version.
 */
test('an update waits for a busy tab, then reloads every tab', async ({
  page,
  context,
  runtimeErrors,
}, testInfo) => {
  test.skip(
    !process.env.UPDATE_JOURNEY || !existsSync('dist-next'),
    'Run npm run test:update to build the second release and run this journey',
  );
  test.setTimeout(240000);
  await skipTutorial(page);
  const other = await context.newPage();
  await skipTutorial(other);
  // The other tab's console counts too.
  other.on('pageerror', (error) => runtimeErrors.push(`other tab: ${error.message}`));

  const port = portFor(testInfo.workerIndex);
  const origin = `http://127.0.0.1:${port}`;
  let server = await serve('dist', port);
  try {
    await page.goto(`${origin}/`);
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null, {
      timeout: 30000,
    });
    // The other tab creates a world and keeps it outside a save slot.
    await other.goto(`${origin}/world`);
    await other.getByLabel('World seed', { exact: true }).fill('two-tab-update');
    await other.getByRole('button', { name: 'Create world', exact: true }).click();
    await expect(other.getByRole('button', { name: 'Advance week', exact: true })).toBeEnabled({
      timeout: 60000,
    });
    const canonical = (tab: Page) => tab.locator('link[rel="canonical"]').getAttribute('href');
    const oldCanonical = await canonical(page);

    // The new release is deployed at the same address.
    await stop(server);
    server = await serve('dist-next', port);
    await page.evaluate(() =>
      navigator.serviceWorker.getRegistration().then((registration) => registration?.update()),
    );
    const prompt = page.locator('.pwa-prompt');
    await expect(prompt).toContainText('An update is ready.', { timeout: 60000 });
    await prompt.getByRole('button', { name: 'Save & update' }).click();
    await expect(prompt).toContainText(
      'Another tab (World) has a world that is not saved in a slot — save it or close that tab first.',
      { timeout: 30000 },
    );
    // Refused: neither tab reloaded.
    expect(await canonical(page)).toBe(oldCanonical);
    expect(await canonical(other)).toBe(oldCanonical);

    // The world is saved; now both tabs are free and the update reloads both.
    // The page's own link (the other tab's update prompt may offer the same).
    await other.locator('main').getByRole('link', { name: 'Save this world', exact: true }).click();
    await other.getByLabel('Save name').fill('Two tabs');
    await other
      .locator('.slot-card')
      .first()
      .getByRole('button', { name: 'Save world', exact: true })
      .click();
    await other.getByRole('link', { name: 'Open world', exact: true }).click();
    await expect(other.locator('.save-indicator')).toHaveText('All changes saved', {
      timeout: 30000,
    });
    await prompt.getByRole('button', { name: 'Save & update' }).click();
    await expect.poll(() => canonical(page), { timeout: 60000 }).not.toBe(oldCanonical);
    await expect.poll(() => canonical(other), { timeout: 60000 }).not.toBe(oldCanonical);
    // The other tab comes back to its saved world.
    await expect(other.getByRole('button', { name: 'Advance week', exact: true })).toBeVisible({
      timeout: 30000,
    });
  } finally {
    await other.close();
    await stop(server);
  }
});
