import { expect, test, type Page } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { generateWorld } from '../src/engine/world/generate';
import { createCareer, trialOffers } from '../src/engine/career/create';
import { createSave, DEFAULT_SETTINGS } from '../src/persistence/schema';
import { skipTutorial } from './support';

const backups: string[] = [];
test.beforeAll(async ({ browserName }, workerInfo) => {
  const world = generateWorld('save-actions', { format: 'legacy' });
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
            // full checks, so its card still reads as ready.
            if (store === 'saves') record.kind = 'bogus';
            else record.world.phase = 'broken';
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
  new RegExp(`^pitch-to-glory-slot-${slot}-recovery-\\d{4}-\\d{2}-\\d{2}\\.json$`);

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
  expect(JSON.parse(await readFile((await file.path())!, 'utf8'))).toMatchObject({
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
  expect(JSON.parse(await readFile((await file.path())!, 'utf8'))).toMatchObject({
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
