import type { Page } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { generateWorld } from '../src/engine/world/generate';
import { createCareer, trialOffers } from '../src/engine/career/create';
import { createSave, DEFAULT_SETTINGS } from '../src/persistence/schema';
import { expect, readBackup, skipTutorial, test } from './support';

const backups: string[] = [];
test.beforeAll(async ({ browserName }, workerInfo) => {
  const world = generateWorld('save-actions');
  const career = createCareer(
    world,
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
    trialOffers(world, 'country:0', 'save-actions')[0]!.id,
    'save-actions',
  );
  const foundation = {
    gallery: { seed: 'save-actions', generation: 0 },
    settings: DEFAULT_SETTINGS,
  };
  const fixtures = [
    createSave(1, 'Robin career', { ...foundation, kind: 'world', world: career }),
    createSave(2, 'Football world', { ...foundation, kind: 'world', world }),
    createSave(3, 'Artwork gallery', { ...foundation, kind: 'foundation' }),
  ];
  await mkdir('artifacts', { recursive: true });
  for (const [index, save] of fixtures.entries()) {
    const path = `artifacts/save-actions-${index}-${browserName}-${workerInfo.workerIndex}.json`;
    await writeFile(path, JSON.stringify(save));
    backups.push(path);
  }
});

test('mixed save slots describe their contents and replace them with the current session', async ({
  page,
}) => {
  test.setTimeout(180000);
  await skipTutorial(page);
  await page.goto('/saves');
  const cards = page.locator('.slot-card');
  for (const [index, name] of ['Robin career', 'Football world', 'Artwork gallery'].entries()) {
    await cards
      .nth(index)
      .getByLabel(`Import backup — Slot ${index + 1}`)
      .setInputFiles(backups[index]!);
    await expect(cards.nth(index).getByRole('heading')).toHaveText(name, { timeout: 30000 });
  }
  await expect(
    cards.nth(0).getByRole('button', { name: 'Continue career', exact: true }),
  ).toBeVisible();
  await expect(cards.nth(1).getByRole('button', { name: 'Load world', exact: true })).toBeVisible();
  await expect(
    cards.nth(2).getByRole('button', { name: 'Load gallery', exact: true }),
  ).toBeVisible();
  await expect(cards.getByRole('button', { name: 'Delete save', exact: true })).toHaveCount(3);

  // The gallery is currently loaded: even a career target must say what will replace it.
  await expect(
    cards.getByRole('button', { name: 'Replace with gallery', exact: true }),
  ).toHaveCount(3);
  await cards.nth(0).getByRole('button', { name: 'Continue career', exact: true }).click();
  await expect(page.locator('.save-current-copy')).toContainText('Your career as Robin Vale');
  await expect(cards.getByRole('button', { name: 'Replace with career', exact: true })).toHaveCount(
    3,
  );
  await cards.nth(2).getByRole('button', { name: 'Replace with career', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('your current career');
  await expect(
    dialog.getByRole('button', { name: 'Replace with career', exact: true }),
  ).toBeVisible();
  await page.goBack();
  await expect(dialog).not.toBeVisible();
  await expect(cards.nth(2).getByRole('heading')).toHaveText('Artwork gallery');

  await cards.nth(1).getByRole('button', { name: 'Load world', exact: true }).click();
  await expect(page.locator('.save-current-copy')).toContainText('Your football world');
  await expect(cards.getByRole('button', { name: 'Replace with world', exact: true })).toHaveCount(
    3,
  );
  await cards.nth(2).getByRole('button', { name: 'Load gallery', exact: true }).click();
  await expect(page.locator('.save-current-copy')).toContainText('Your gallery');
  await expect(
    cards.getByRole('button', { name: 'Replace with gallery', exact: true }),
  ).toHaveCount(3);
});

/** Change one stored record in place, as damage or a validator regression would. */
async function damage(page: Page, store: 'saves' | 'worlds', slot: number) {
  await page.evaluate(
    ({ store, slot }) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('pitch-to-glory');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction(store, 'readwrite');
          const records = tx.objectStore(store);
          const read = records.get(slot);
          read.onsuccess = () => {
            const record = read.result;
            // An unknown slot kind makes the slot unreadable; a broken world fails only the
            // full checks, so its card still reads as ready. A world stored as bytes (1.0) is
            // put back as an object, the form earlier releases stored and 1.0 still reads.
            if (store === 'saves') record.kind = 'bogus';
            else {
              if (record.bytes) {
                record.world = JSON.parse(new TextDecoder().decode(record.bytes));
                delete record.bytes;
              }
              record.world.phase = 'broken';
            }
            records.put(record);
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
    { store, slot },
  );
}
function stored(page: Page, store: 'saves' | 'worlds', slot: number) {
  return page.evaluate(
    ({ store, slot }) =>
      new Promise<string>((resolve, reject) => {
        const request = indexedDB.open('pitch-to-glory');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const read = db.transaction(store).objectStore(store).get(slot);
          read.onsuccess = () => {
            db.close();
            resolve(JSON.stringify(read.result));
          };
          read.onerror = () => {
            db.close();
            reject(read.error);
          };
        };
      }),
    { store, slot },
  );
}
const recoveryName = (slot: number) =>
  new RegExp(`^pitch-to-glory-slot-${slot}-recovery-\\d{4}-\\d{2}-\\d{2}\\.json\\.gz$`);

test('a slot that will not load can still be exported as a recovery copy', async ({ page }) => {
  test.setTimeout(180000);
  await skipTutorial(page);
  await page.goto('/saves');
  const cards = page.locator('.slot-card');
  for (const index of [1, 2]) {
    await cards
      .nth(index)
      .getByLabel(`Import backup — Slot ${index + 1}`)
      .setInputFiles(backups[index]!);
    await expect(cards.nth(index).getByRole('button', { name: 'Delete save' })).toBeVisible({
      timeout: 30000,
    });
  }
  await damage(page, 'worlds', 2);
  await damage(page, 'saves', 3);
  const before = [await stored(page, 'worlds', 2), await stored(page, 'saves', 3)];
  await page.reload();

  // A world that fails its checks: loading says so and offers the recovery copy.
  await cards.nth(1).getByRole('button', { name: 'Load world', exact: true }).click();
  const alert = page.getByRole('alert').filter({ hasText: 'Slot 2 could not be opened' });
  await expect(alert).toBeVisible();
  let download = page.waitForEvent('download');
  await alert.getByRole('button', { name: 'Export a recovery copy' }).click();
  let file = await download;
  expect(file.suggestedFilename()).toMatch(recoveryName(2));
  expect(JSON.parse(await readBackup((await file.path())!))).toMatchObject({
    format: 'pitch-to-glory',
    name: 'Football world',
    payload: { kind: 'world', world: { phase: 'broken' } },
  });
  await expect(page.locator('.notice')).toContainText('Recovery copy downloaded.');

  // An unreadable slot: no backup export, but a recovery copy from its card.
  await expect(cards.nth(2).getByRole('heading')).toHaveText('Artwork gallery');
  await expect(cards.nth(2)).toContainText('could not be read');
  await expect(cards.nth(2).getByRole('button', { name: 'Export backup' })).toHaveCount(0);
  download = page.waitForEvent('download');
  await cards.nth(2).getByRole('button', { name: 'Export a recovery copy — Slot 3' }).click();
  file = await download;
  expect(file.suggestedFilename()).toMatch(recoveryName(3));
  expect(JSON.parse(await readBackup((await file.path())!))).toMatchObject({
    name: 'Artwork gallery',
    payload: { kind: 'bogus' },
  });

  // Deleting it points to the recovery copy first, and offers it in place.
  await cards.nth(2).getByRole('button', { name: 'Delete save' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Export a recovery copy first');
  download = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Export a recovery copy' }).click();
  expect((await download).suggestedFilename()).toMatch(recoveryName(3));
  await dialog.getByRole('button', { name: 'Keep save' }).click();
  await expect(dialog).not.toBeVisible();

  // Exporting never repaired or rewrote what is stored.
  expect([await stored(page, 'worlds', 2), await stored(page, 'saves', 3)]).toEqual(before);
});

test('a slot that will not load is restored from its automatic backup', async ({ page }) => {
  test.setTimeout(180000);
  await skipTutorial(page);
  await page.goto('/saves');
  const cards = page.locator('.slot-card');
  await cards.nth(1).getByLabel('Import backup — Slot 2').setInputFiles(backups[1]!);
  await expect(cards.nth(1).getByRole('heading')).toHaveText('Football world', { timeout: 30000 });
  // The import's whole write is backed up on this device, after the save.
  await expect(cards.nth(1).locator('.slot-backup')).toContainText('Backed up on this device', {
    timeout: 30000,
  });
  await expect(cards.nth(1).locator('.slot-restore')).toHaveCount(0);

  await damage(page, 'worlds', 2);
  await page.reload();
  await cards.nth(1).getByRole('button', { name: 'Load world', exact: true }).click();
  const alert = page.getByRole('alert').filter({ hasText: 'Slot 2 could not be opened' });
  await expect(alert).toContainText('Restore it from an automatic backup');
  const restore = cards.nth(1).getByRole('region', {
    name: 'Restore from an automatic backup — Slot 2',
  });
  await expect(restore).toContainText('Start of season');
  await restore
    .getByRole('button', { name: /^Restore the backup of .* — Slot 2$/ })
    .first()
    .click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('will be replaced with its automatic backup');
  // The confirmation offers the recovery copy of what is stored now, as delete does.
  await expect(dialog.getByRole('button', { name: 'Export a recovery copy' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Restore backup', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator('.notice')).toHaveText('Backup restored and loaded.', {
    timeout: 30000,
  });
  await expect(page.locator('.save-current-copy')).toContainText('Your football world');
  await expect(cards.nth(1).locator('.active-label')).toBeVisible();
  await expect(cards.nth(1).locator('.slot-restore')).toHaveCount(0);

  // The restored slot loads again after a reload, as any save does.
  await page.reload();
  await cards.nth(1).getByRole('button', { name: 'Load world', exact: true }).click();
  await expect(page.locator('.notice')).toHaveText('Save loaded.', { timeout: 30000 });
});

/**
 * Makes the persistence worker's IndexedDB refuse writes as a full disk does; the page switches
 * it to full. (A low storage estimate alone never refuses a save: WebKit's overstates usage.)
 */
const FULL_STORAGE_STUB = [
  'let full = false;',
  "new BroadcastChannel('e2e-storage').onmessage = (event) => { full = event.data === 'full'; };",
  'const put = IDBObjectStore.prototype.put;',
  'IDBObjectStore.prototype.put = function (...args) {',
  "  if (full) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');",
  '  return put.apply(this, args);',
  '};',
].join('\n');

test.describe('when storage is full', () => {
  // The app's service worker must not answer for the worker script this test rewrites.
  test.use({ serviceWorkers: 'block' });
  test('a save says so and offers an export', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'Only Chromium routes a dedicated worker’s script');
    test.setTimeout(180000);
    await page.route(/persistence\.worker-[\w-]+\.js$/, async (route) => {
      const response = await route.fetch();
      await route.fulfill({ response, body: `${FULL_STORAGE_STUB}\n${await response.text()}` });
    });
    await skipTutorial(page);
    await page.goto('/saves');
    const cards = page.locator('.slot-card');
    await cards.nth(0).getByLabel('Import backup — Slot 1').setInputFiles(backups[0]!);
    await expect(cards.nth(0).getByRole('heading')).toHaveText('Robin career', {
      timeout: 30000,
    });
    await cards.nth(0).getByRole('button', { name: 'Continue career', exact: true }).click();
    await expect(page.locator('.save-current-copy')).toContainText('Your career as Robin Vale');
    await expect(page.getByText(/^Saves and backups use \d[\d,]* MB/)).toBeVisible();

    await page.evaluate(() => new BroadcastChannel('e2e-storage').postMessage('full'));
    await cards.nth(1).getByRole('button', { name: 'Save career', exact: true }).click();
    const alert = page.getByRole('alert').filter({ hasText: 'Storage is full' });
    await expect(alert).toContainText('export a backup and free space', { timeout: 30000 });
    await expect(cards.nth(1).getByRole('heading')).toHaveText('A fresh start.');
    const download = page.waitForEvent('download');
    await alert.getByRole('button', { name: 'Export unsaved copy' }).click();
    expect((await download).suggestedFilename()).toMatch(
      /^pitch-to-glory-unsaved-\d{4}-\d{2}-\d{2}\.json\.gz$/,
    );
  });
});

test.describe('in a browser without compression streams', () => {
  // The app's service worker must not answer for the worker script this test rewrites.
  test.use({ serviceWorkers: 'block' });
  test('backups are plain JSON, and import back', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'Only Chromium routes a dedicated worker’s script');
    test.setTimeout(120000);
    // Every supported browser has CompressionStream: take it away from the persistence worker.
    await page.route(/persistence\.worker-[\w-]+\.js$/, async (route) => {
      const response = await route.fetch();
      await route.fulfill({
        response,
        body: `self.CompressionStream = undefined;\n${await response.text()}`,
      });
    });
    await skipTutorial(page);
    await page.goto('/saves');
    const cards = page.locator('.slot-card');
    await cards.nth(0).getByLabel('Import backup — Slot 1').setInputFiles(backups[2]!);
    await expect(cards.nth(0).getByRole('heading')).toHaveText('Artwork gallery', {
      timeout: 30000,
    });
    const download = page.waitForEvent('download');
    await cards.nth(0).getByRole('button', { name: 'Export backup' }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/^pitch-to-glory-slot-1-\d{4}-\d{2}-\d{2}\.json$/);
    const path = (await file.path())!;
    expect(JSON.parse(await readFile(path, 'utf8'))).toMatchObject({ name: 'Artwork gallery' });
    await cards.nth(1).getByLabel('Import backup — Slot 2').setInputFiles(path);
    await expect(page.locator('.notice')).toHaveText('Save imported.', { timeout: 30000 });
    await expect(cards.nth(1).getByRole('heading')).toHaveText('Artwork gallery');
  });
});
