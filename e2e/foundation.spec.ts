import { expect, test } from '@playwright/test';
import { isBrowserNoise, skipTutorial } from './support';
import { readFile } from 'node:fs/promises';

test.beforeEach(async ({ page }) => {
  await skipTutorial(page);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !isBrowserNoise(message))
      errors.push(`${message.text()} (${message.location().url || 'no location'})`);
  });
  await page.addInitScript(() => {
    window.addEventListener('unhandledrejection', (event) => {
      throw new Error(String(event.reason));
    });
  });
  (page as typeof page & { runtimeErrors: string[] }).runtimeErrors = errors;
});
test.afterEach(async ({ page }) => {
  expect((page as typeof page & { runtimeErrors: string[] }).runtimeErrors).toEqual([]);
});

test('title, URLs, route refresh and keyboard navigation', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'EVERY GREAT CAREER STARTS SOMEWHERE.',
  );
  await page.getByRole('link', { name: 'Explore the gallery' }).click();
  await expect(page).toHaveURL(/\/gallery$/);
  // Let the route finish loading first: Firefox reports a lazy chunk aborted by the reload.
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Asset gallery');
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Asset gallery');
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await page.keyboard.press('?');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
});

test('gallery reseeds and reproduces all three SVG asset categories', async ({ page }) => {
  await page.goto('/gallery');
  await expect(page.locator('.crest-card')).toHaveCount(15);
  const original = await page.locator('.crest-card img').first().getAttribute('src');
  await page.getByRole('button', { name: 'Reseed collection' }).click();
  await expect(page.locator('.crest-card img').first()).not.toHaveAttribute('src', original!);
  await page.getByLabel('Collection seed', { exact: true }).fill('pitch-to-glory');
  await page.getByRole('button', { name: 'Apply seed' }).click();
  await expect(page.locator('.crest-card img').first()).toHaveAttribute('src', original!);
  await page.getByRole('tab', { name: 'Match kits' }).click();
  await expect(page.locator('.kit-trio img')).toHaveCount(45);
  await page.getByRole('tab', { name: 'Player portraits' }).click();
  await expect(page.locator('.age-trio img')).toHaveCount(24);
  await expect(page.getByAltText('Alex Moreno, aged 42')).toBeVisible();
  expect(await page.getByAltText('Alex Moreno, aged 17').getAttribute('src')).not.toBe(
    await page.getByAltText('Alex Moreno, aged 42').getAttribute('src'),
  );
  await page.getByRole('tab', { name: 'Player portraits' }).press('Home');
  await expect(page.getByRole('tab', { name: 'Club crests' })).toBeFocused();
});

test('preferences persist and system preferences are respected', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await page.goto('/settings');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('radio', { name: 'Light', exact: true }).check();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByLabel('Text size', { exact: true }).focus();
  await page.keyboard.press('End');
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('output[for="font-scale"]')).toHaveText('125%');
  await page.getByRole('switch', { name: 'Reduced motion' }).check();
  await page.reload();
  await expect(page.getByRole('radio', { name: 'Light', exact: true })).toBeChecked();
  await expect(page.getByRole('switch', { name: 'Reduced motion' })).toBeChecked();
  await expect(page.locator('html')).toHaveCSS('font-size', '20px');
  // Restoring every preference asks first; the dialog's own button confirms.
  await page.getByRole('button', { name: 'Restore defaults' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Restore defaults' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('three slots save, autosave, export, import, migrate and delete', async ({ page }) => {
  await page.goto('/saves');
  await expect(page.locator('.slot-card')).toHaveCount(3);
  await page.getByLabel('Collection name').fill('Alderwick collection');
  await page
    .locator('.slot-card')
    .nth(0)
    .getByRole('button', { name: 'Save collection', exact: true })
    .click();
  await expect(page.locator('.notice')).toHaveText('Collection saved.');
  await page.getByRole('link', { name: 'Open gallery' }).click();
  await page.getByRole('button', { name: 'Reseed collection' }).click();
  const seed = await page.getByLabel('Collection seed', { exact: true }).inputValue();
  await page.getByRole('link', { name: 'Save this collection' }).click();
  await expect(page.locator('.slot-card').nth(0).locator('.slot-seed')).toHaveText(`Seed: ${seed}`);
  const downloadPromise = page.waitForEvent('download');
  await page.locator('.slot-card').nth(0).getByRole('button', { name: 'Export backup' }).click();
  const download = await downloadPromise;
  const json = await readFile((await download.path())!, 'utf8');
  expect(JSON.parse(json).payload.gallery.seed).toBe(seed);
  await page
    .locator('.slot-card')
    .nth(1)
    .getByLabel('Import backup — Slot 2')
    .setInputFiles({
      name: 'collection.json',
      mimeType: 'application/json',
      buffer: Buffer.from(json),
    });
  await expect(page.locator('.notice')).toHaveText('Collection imported.');
  await expect(page.locator('.slot-card').nth(1).getByRole('heading')).toHaveText(
    'Alderwick collection',
  );
  const v1 = {
    format: 'pitch-to-glory',
    schemaVersion: 1,
    slot: 1,
    name: 'Legacy collection',
    seed: 'v1-seed',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
  await page
    .locator('.slot-card')
    .nth(2)
    .getByLabel('Import backup — Slot 3')
    .setInputFiles({
      name: 'v1.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(v1)),
    });
  await expect(page.locator('.slot-card').nth(2).getByRole('heading')).toHaveText(
    'Legacy collection',
  );
  await page
    .locator('.slot-card')
    .nth(0)
    .getByRole('button', { name: 'Delete collection' })
    .click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page
    .locator('.slot-card')
    .nth(0)
    .getByRole('button', { name: 'Delete collection' })
    .click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete collection' }).click();
  await expect(page.locator('.slot-card').nth(0).getByRole('heading')).toHaveText('A fresh start.');
});

test('a second tab cannot load or mutate an owned slot', async ({ page, context }) => {
  await page.goto('/saves');
  await page
    .locator('.slot-card')
    .first()
    .getByRole('button', { name: 'Save collection', exact: true })
    .click();
  await expect(page.locator('.notice')).toHaveText('Collection saved.');
  const second = await context.newPage();
  await second.goto('/saves');
  await second
    .locator('.slot-card')
    .first()
    .getByRole('button', { name: 'Load collection' })
    .click();
  await expect(second.getByRole('alert')).toContainText('open in another tab');
  await second
    .locator('.slot-card')
    .first()
    .getByRole('button', { name: 'Delete collection' })
    .click();
  await second.getByRole('dialog').getByRole('button', { name: 'Delete collection' }).click();
  await expect(second.getByRole('alert')).toContainText('open in another tab');
  await second.keyboard.press('Escape');
  await page.close();
  // The closed tab's lock is released by the browser shortly after it closes (later in
  // Firefox): loading succeeds once it has gone, as it would for a player trying again.
  await expect(async () => {
    await second
      .locator('.slot-card')
      .first()
      .getByRole('button', { name: 'Load collection' })
      .click();
    await expect(second.locator('.notice')).toHaveText('Collection loaded.', { timeout: 2000 });
  }).toPass({ timeout: 20000 });
  await second.close();
});

test('invalid import preserves an existing collection', async ({ page }) => {
  await page.goto('/saves');
  await page
    .locator('.slot-card')
    .first()
    .getByRole('button', { name: 'Save collection', exact: true })
    .click();
  await expect(page.locator('.notice')).toHaveText('Collection saved.');
  await page
    .locator('.slot-card')
    .first()
    .getByLabel('Import backup — Slot 1')
    .setInputFiles({
      name: 'bad.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{invalid'),
    });
  await expect(page.getByRole('alert')).toContainText('incomplete or invalid');
  await expect(page.locator('.slot-card').first().getByRole('heading')).toHaveText(
    'My club collection',
  );
});

test('mobile shell, large text and dark gallery fit the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/settings');
  await page.getByRole('radio', { name: 'Dark', exact: true }).check();
  await page.getByLabel('Text size', { exact: true }).focus();
  await page.keyboard.press('End');
  // Five destinations on a phone; the gallery is one tap away in More.
  await expect(page.locator('.bottom-nav').locator('a, button')).toHaveCount(5);
  await page.locator('.bottom-nav').getByRole('button', { name: 'More' }).click();
  await page
    .getByRole('dialog', { name: 'More' })
    .getByRole('link', { name: 'Asset gallery' })
    .click();
  await expect(page.getByRole('dialog', { name: 'More' })).toHaveCount(0);
  await expect(page.locator('.bottom-nav')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.getByRole('tab', { name: 'Match kits' }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test('production PWA precaches unvisited routes for offline use', async ({
  page,
  context,
  browserName,
}) => {
  // Installing the service worker caches every route first; CI runners can take a while.
  test.setTimeout(90000);
  await page.goto('/');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true);
  // Let the first page finish its lazy chunks: going offline mid-download makes Firefox report
  // the aborted import as a page error.
  await page.waitForLoadState('networkidle');
  await context.setOffline(true);
  if (browserName === 'webkit') {
    // Windows WebKit's driver blocks navigation before dispatching the service worker.
    // Inspect actual installed route responses offline rather than skipping coverage.
    const cached = await page.evaluate(async () => {
      const urls: string[] = [];
      let shell = false;
      for (const name of await caches.keys()) {
        const cache = await caches.open(name);
        for (const request of await cache.keys()) {
          const pathname = new URL(request.url).pathname;
          const response = await cache.match(request);
          if (response?.ok && (await response.clone().text()).length > 0) urls.push(pathname);
          if (pathname === '/index.html')
            shell = Boolean(response && (await response.text()).includes('id="root"'));
        }
      }
      return { urls, shell };
    });
    expect(cached.shell).toBe(true);
    for (const route of ['Gallery', 'Settings', 'Saves', 'Menu'])
      expect(cached.urls.some((url) => url.includes(`/assets/${route}-`))).toBe(true);
    await context.setOffline(false);
    return;
  }
  await page.goto('/gallery');
  await expect(page.locator('.crest-card')).toHaveCount(15);
  await page.goto('/settings');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Settings');
  await context.setOffline(false);
});

test('a directly opened shortcut dialog closes without leaving the page', async ({ page }) => {
  await page.goto('/gallery?help=1');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page).toHaveURL(/\/gallery$/);
  await expect(page.getByRole('dialog')).not.toBeVisible();
});

test('confirmation protects a slot that changed after the dialog opened', async ({
  page,
  context,
}) => {
  await page.goto('/saves');
  await page
    .locator('.slot-card')
    .nth(0)
    .getByRole('button', { name: 'Save collection', exact: true })
    .click();
  await expect(page.locator('.notice')).toHaveText('Collection saved.');
  await page
    .locator('.slot-card')
    .nth(1)
    .getByRole('button', { name: 'Save collection', exact: true })
    .click();
  await expect(page.locator('.slot-card').nth(1).locator('.active-label')).toBeVisible();
  await page
    .locator('.slot-card')
    .nth(0)
    .getByRole('button', { name: 'Delete collection' })
    .click();
  await expect(page.getByRole('dialog')).toBeVisible();
  const other = await context.newPage();
  await other.goto('/saves');
  await other.locator('.slot-card').nth(0).getByRole('button', { name: 'Load collection' }).click();
  await expect(other.locator('.notice')).toHaveText('Collection loaded.');
  await other.getByLabel('Collection name').fill('Changed by other tab');
  await other
    .locator('.slot-card')
    .nth(0)
    .getByRole('button', { name: 'Replace collection' })
    .click();
  await other.getByRole('dialog').getByRole('button', { name: 'Replace collection' }).click();
  await expect(other.locator('.notice')).toHaveText('Collection saved.');
  await other
    .locator('.slot-card')
    .nth(2)
    .getByRole('button', { name: 'Save collection', exact: true })
    .click();
  await expect(other.locator('.slot-card').nth(2).locator('.active-label')).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete collection' }).click();
  await expect(page.getByRole('alert')).toContainText('has changed since it was opened');
  await page.keyboard.press('Escape');
  await expect(page.locator('.slot-card').nth(0).getByRole('heading')).toHaveText(
    'Changed by other tab',
  );
  await other.close();
});

test('conflicting autosave can export local changes and reload the saved version', async ({
  page,
}) => {
  await page.goto('/saves');
  await page
    .locator('.slot-card')
    .first()
    .getByRole('button', { name: 'Save collection', exact: true })
    .click();
  await expect(page.locator('.notice')).toHaveText('Collection saved.');
  // Reproduce a revision committed by another writer after the active snapshot was loaded.
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('pitch-to-glory');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction('saves', 'readwrite');
          const store = tx.objectStore('saves');
          const read = store.get(1);
          read.onsuccess = () => {
            const save = read.result;
            // Slot metadata record (IndexedDB layout v6): preferences live beside the revision.
            save.revision++;
            save.gallery.seed = 'other-writer';
            store.put(save);
          };
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => {
            db.close();
            reject(tx.error);
          };
        };
      }),
  );
  await page.getByRole('link', { name: 'Open gallery' }).click();
  const seedInput = page.getByLabel('Collection seed', { exact: true });
  // Under load WebKit can lose a fill made while the lazy gallery route is still settling;
  // retry until the applied seed sticks rather than exporting the default by accident.
  await expect(async () => {
    await seedInput.fill('local-unsaved');
    await page.getByRole('button', { name: 'Apply seed' }).click();
    await expect(seedInput).toHaveValue('local-unsaved', { timeout: 1000 });
  }).toPass();
  await expect(page.locator('.global-error')).toContainText('has changed since it was opened');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export unsaved copy' }).click();
  const download = await downloadPromise;
  const json = await readFile((await download.path())!, 'utf8');
  expect(JSON.parse(json).payload.gallery.seed).toBe('local-unsaved');
  await page.getByRole('button', { name: 'Reload saved collection', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Reload saved collection', exact: true })
    .click();
  await expect(page.getByLabel('Collection seed', { exact: true })).toHaveValue('other-writer');
  await expect(page.locator('.global-error')).not.toBeVisible();
});

test('a deleted active slot can be detached and saved again', async ({ page }) => {
  await page.goto('/saves');
  await page
    .locator('.slot-card')
    .first()
    .getByRole('button', { name: 'Save collection', exact: true })
    .click();
  await expect(page.locator('.notice')).toHaveText('Collection saved.');
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('pitch-to-glory');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction('saves', 'readwrite');
          tx.objectStore('saves').delete(1);
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
  );
  await page.getByRole('link', { name: 'Open gallery' }).click();
  await page.getByRole('button', { name: 'Reseed collection' }).click();
  await expect(page.locator('.global-error')).toContainText('has changed since it was opened');
  await page.getByRole('button', { name: 'Reload saved collection', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Reload saved collection', exact: true })
    .click();
  await expect(page.locator('.global-error')).not.toBeVisible();
  await page.getByRole('link', { name: 'Save this collection' }).click();
  await page
    .locator('.slot-card')
    .first()
    .getByRole('button', { name: 'Save collection', exact: true })
    .click();
  await expect(page.locator('.notice')).toHaveText('Collection saved.');
});
