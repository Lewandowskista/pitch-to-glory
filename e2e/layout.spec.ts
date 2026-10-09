import { expect, test, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { generateWorld } from '../src/engine/world/generate';
import { createCareer, trialOffers } from '../src/engine/career/create';
import { advanceCareerWeek } from '../src/engine/career/season';
import { createSave, DEFAULT_SETTINGS } from '../src/persistence/schema';
import { isAbortedLoad, isBrowserNoise, openCareerPage, skipTutorial } from './support';

/**
 * Layout geometry that a page-width check misses: responsive visibility, labels that must not
 * overlap, and related content kept together (docs/UI-LAYOUT-PLAN-2026-10-09.md).
 */
let backup: string;
test.beforeAll(async ({ browserName }, workerInfo) => {
  const seed = 'layout';
  const base = generateWorld(seed);
  let world = createCareer(
    base,
    {
      name: 'Robin Vale',
      nationalityId: 'country:0',
      position: 'ST',
      foot: 'left',
      age: 17,
      archetype: 'finisher',
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
    },
    trialOffers(base, 'country:0', seed)[0]!.id,
    seed,
  );
  // A couple of played weeks: the inbox has messages to open.
  for (let week = 0; week < 2; week++)
    world = advanceCareerWeek(world, { inPlace: true, autoPlay: true }).world;
  backup = `artifacts/layout-${browserName}-${workerInfo.workerIndex}.json`;
  await mkdir('artifacts', { recursive: true });
  await writeFile(
    backup,
    JSON.stringify(
      createSave(1, 'Layout', {
        kind: 'world',
        world,
        gallery: { seed, generation: 0 },
        settings: DEFAULT_SETTINGS,
      }),
    ),
  );
});
test.beforeEach(async ({ page }) => {
  test.setTimeout(120000);
  await skipTutorial(page);
  const errors: string[] = [];
  page.on('pageerror', (error) => {
    if (!isAbortedLoad(error.message)) errors.push(error.message);
  });
  page.on('console', (entry) => {
    if (entry.type() === 'error' && !isBrowserNoise(entry)) errors.push(entry.text());
  });
  (page as Page & { errors: string[] }).errors = errors;
  await page.goto('/saves');
  await page
    .locator('.slot-card')
    .first()
    .getByLabel('Import backup — Slot 1')
    .setInputFiles(backup);
  await expect(page.locator('.notice')).toHaveText('Save imported.', { timeout: 30000 });
  await page.goto('/career?save=1');
  await expect(page.getByRole('heading', { name: 'Career hub', exact: true })).toBeVisible({
    timeout: 30000,
  });
});
test.afterEach(async ({ page }) => {
  expect((page as Page & { errors: string[] }).errors).toEqual([]);
});

const openFirstMessage = async (page: Page) => {
  await openCareerPage(page, 'Inbox');
  await page
    .getByRole('list', { name: 'Messages', exact: true })
    .getByRole('button')
    .first()
    .click();
};

test('the inbox reader shows its Back control only where the list is hidden', async ({ page }) => {
  // Desktop: list and reader side by side, so there is nothing to go back to.
  await openFirstMessage(page);
  const back = page.getByRole('button', { name: 'Back to the inbox', exact: true });
  await expect(page.getByRole('heading', { level: 2 }).nth(1)).toBeVisible();
  await expect(back).toBeHidden();
  // Phone: the reader replaces the list, and Back returns to it.
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(back).toBeVisible();
  await back.click();
  await expect(page.getByRole('list', { name: 'Messages', exact: true })).toBeVisible();
});
