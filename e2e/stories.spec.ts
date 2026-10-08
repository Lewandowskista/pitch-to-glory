import { expect, test, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { generateWorld } from '../src/engine/world/generate';
import { createCareer, trialOffers } from '../src/engine/career/create';
import { pendingCareerFixture } from '../src/engine/career/fixtures';
import { autoPlayCareerFixture } from '../src/engine/career/matches';
import { acceptGoal } from '../src/engine/career/coaching';
import { acceptPromise, currentPromise, promiseWeek } from '../src/engine/career/stories/promise';
import { createSave, DEFAULT_SETTINGS } from '../src/persistence/schema';
import type { World } from '../src/model/domain';
import { isAbortedLoad, isBrowserNoise, skipTutorial } from './support';

/**
 * Phase 6: the manager's six-week challenge in the browser, from the offer through acceptance
 * to its conclusion in Club life, the inbox and the Chronicle.
 */
const saves = new Map<string, string>();
function career(): World {
  const base = generateWorld('stories-journey', { format: 'legacy' });
  const trial = trialOffers(base, 'country:0', 'stories-journey')[0]!;
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
    'stories-journey',
  );
  world = acceptGoal(world);
  // This week's match played: Continue is the next action.
  for (let pending = pendingCareerFixture(world); pending; pending = pendingCareerFixture(world))
    autoPlayCareerFixture(world, pending);
  world.career!.injury = null;
  world.players[world.career!.playerId]!.injuryId = null;
  world.media = world.media.filter((item) => !item.choices.length || item.answer !== null);
  promiseWeek(world);
  return world;
}
test.beforeAll(async ({ browserName }, workerInfo) => {
  const offered = career();
  // An accepted challenge one point from done: the next week's step concludes it.
  const nearly = acceptPromise(career());
  const promise = currentPromise(nearly)!;
  const player = nearly.players[nearly.career!.playerId]!;
  promise.kind = 'attribute';
  promise.attribute = 'finishing';
  promise.target = 1;
  promise.baseline = player.attributes.finishing - 1;
  await mkdir('artifacts', { recursive: true });
  for (const [name, world] of Object.entries({ offered, nearly })) {
    const path = `artifacts/stories-${name}-${browserName}-${workerInfo.workerIndex}.json`;
    await writeFile(
      path,
      JSON.stringify(
        createSave(1, 'Stories', {
          kind: 'world',
          world,
          gallery: { seed: 'stories', generation: 0 },
          settings: DEFAULT_SETTINGS,
        }),
      ),
    );
    saves.set(name, path);
  }
});
test.beforeEach(async ({ page }) => {
  await skipTutorial(page);
  const errors: string[] = [];
  page.on('pageerror', (error) => {
    if (!isAbortedLoad(error.message)) errors.push(error.message);
  });
  page.on('console', (entry) => {
    if (entry.type() === 'error' && !isBrowserNoise(entry)) errors.push(entry.text());
  });
  (page as Page & { errors: string[] }).errors = errors;
});
test.afterEach(async ({ page }) => {
  expect((page as Page & { errors: string[] }).errors).toEqual([]);
});
async function importSave(page: Page, name: string) {
  await page.goto('/saves');
  await page
    .locator('.slot-card')
    .nth(0)
    .getByLabel('Import backup — Slot 1')
    .setInputFiles(saves.get(name)!);
  await expect(page.locator('.notice')).toHaveText('Save imported.', { timeout: 30000 });
}
const card = (page: Page) => page.getByRole('region', { name: 'The manager’s challenge' });

test('the offer waits in Needs you and the inbox, and acceptance starts the challenge', async ({
  page,
}) => {
  test.setTimeout(120000);
  await importSave(page, 'offered');
  await page.goto('/career?save=1');
  const needs = page.getByRole('region', { name: 'Needs you' });
  await expect(needs.getByRole('link', { name: /challenge/ })).toBeVisible({ timeout: 30000 });
  await needs.getByRole('link', { name: /challenge/ }).click();
  await expect(page).toHaveURL(/\/career\/club\?save=1/);
  await expect(card(page)).toContainText('in six weeks');
  await expect(card(page)).toContainText(/Answer by the end of week \d+/);
  await card(page).getByRole('button', { name: 'Accept the challenge' }).click();
  await expect(card(page).getByRole('progressbar')).toBeVisible();
  await expect(card(page)).toContainText(/Running until the end of week \d+/);
  await expect(page.getByText('All changes saved').first()).toBeVisible({ timeout: 30000 });
  await page.reload();
  await expect(card(page).getByRole('progressbar')).toBeVisible({ timeout: 30000 });
  await page.goto('/career/inbox?save=1');
  await expect(page.getByRole('main')).toContainText('sets you a challenge', { timeout: 30000 });
});

test('the challenge concludes from real progress, with a message and a Chronicle entry', async ({
  page,
}) => {
  test.setTimeout(180000);
  await importSave(page, 'nearly');
  await page.goto('/career/club?save=1');
  await expect(card(page).getByRole('progressbar')).toBeVisible({ timeout: 30000 });
  await page.goto('/career?save=1');
  await page.getByRole('button', { name: 'Continue to next matchday' }).click();
  await expect(page.getByRole('link', { name: 'Play matchday' })).toBeVisible({
    timeout: 120000,
  });
  // The week is saved before the next page loads it.
  await expect(page.getByText('All changes saved').first()).toBeVisible({ timeout: 30000 });
  await page.goto('/career/club?save=1');
  await expect(card(page)).toContainText(/Met in week \d+/, { timeout: 30000 });
  await page.goto('/career/inbox?save=1');
  await expect(page.getByRole('main')).toContainText('Challenge met', { timeout: 30000 });
  await page.goto('/career/chronicle?save=1');
  await expect(page.getByRole('main')).toContainText('six-week challenge', { timeout: 30000 });
});
