import { expect, test, type Page } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { generateWorld } from '../src/engine/world/generate';
import { createCareer, trialOffers } from '../src/engine/career/create';
import { advanceCareerWeek } from '../src/engine/career/season';
import { pendingCareerFixture } from '../src/engine/career/fixtures';
import { createSave, DEFAULT_SETTINGS } from '../src/persistence/schema';
import { isAbortedLoad, isBrowserNoise, skipTutorial } from './support';

/**
 * Phase 4.2: a real deployment update. The old build (dist) runs a saved career; the new build
 * (dist-next, from `npm run test:update`) replaces it at the same address; the player accepts
 * the update, the career is checkpointed and continues, then keeps working offline.
 */
/** Each worker serves its own port, so repeated runs never share a server. */
const portFor = (worker: number) => 4176 + worker;
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
  const base = generateWorld('update-journey', { format: 'legacy' });
  const trial = trialOffers(base, 'country:0', 'update-journey')[0]!;
  let world = createCareer(
    base,
    {
      name: 'Robin Vale',
      avatar: {
        face: 1,
        skin: 2,
        hair: 3,
        hairColor: 4,
        facialHair: 0,
        eyebrows: 1,
        eyes: 2,
        accessory: 3,
      },
      nationalityId: 'country:0',
      position: 'ST',
      foot: 'left',
      age: 17,
      archetype: 'finisher',
    },
    trial.id,
    'update-journey',
  );
  for (let guard = 0; guard < 6 && (world.date.week < 3 || pendingCareerFixture(world)); guard++)
    world = advanceCareerWeek(world, { inPlace: true, autoPlay: true }).world;
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
  const errors: string[] = [];
  page.on('pageerror', (error) => {
    if (!isAbortedLoad(error.message)) errors.push(error.message);
  });
  page.on('console', (entry) => {
    if (entry.type() === 'error' && !isBrowserNoise(entry)) errors.push(entry.text());
  });

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
    await expect(page.locator('.notice')).toHaveText('Collection imported.', { timeout: 60000 });
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
  expect(errors).toEqual([]);
});
