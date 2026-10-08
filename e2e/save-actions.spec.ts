import { expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
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
