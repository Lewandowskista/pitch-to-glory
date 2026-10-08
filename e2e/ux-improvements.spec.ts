import { expect, test, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { generateWorld } from '../src/engine/world/generate';
import { createCareer, trialOffers } from '../src/engine/career/create';
import { pendingCareerFixture } from '../src/engine/career/fixtures';
import {
  autoPlayCommand,
  careerMatchSetup,
  commitCareerMatch,
  defaultTactics,
} from '../src/engine/career/matches';
import { applyMatchCommand, createMatchSession } from '../src/engine/match';
import { createSave, DEFAULT_SETTINGS } from '../src/persistence/schema';
import { isAbortedLoad, isBrowserNoise, openCareerPage, skipTutorial } from './support';

let backup: string;
test.beforeAll(async ({ browserName }, workerInfo) => {
  const seed = 'training-ux';
  const base = generateWorld(seed, { format: 'legacy' });
  const world = createCareer(
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
  // Finish this week's selected fixtures so the real hub offers Continue, not Play.
  // This is a valid post-match career state, without editing fixtures or selection rules.
  for (let fixture = pendingCareerFixture(world); fixture; fixture = pendingCareerFixture(world)) {
    let match = createMatchSession(careerMatchSetup(world, fixture), defaultTactics(world));
    while (match.state.match.status !== 'finished')
      match = applyMatchCommand(match, autoPlayCommand(match));
    commitCareerMatch(world, match);
  }
  backup = `artifacts/ux-training-${browserName}-${workerInfo.workerIndex}.json`;
  await mkdir('artifacts', { recursive: true });
  await writeFile(
    backup,
    JSON.stringify(
      createSave(1, 'Training UX', {
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
  await page.goto('/career/training?save=1');
  await expect(page.locator('#focus-0')).toBeVisible({ timeout: 30000 });
});
test.afterEach(async ({ page }) => {
  expect((page as Page & { errors: string[] }).errors).toEqual([]);
});
const firstSession = (page: Page) => page.getByRole('region', { name: 'Session 1', exact: true });
const high = (page: Page) => firstSession(page).locator('input[value="high"]');
const normal = (page: Page) => firstSession(page).locator('input[value="normal"]');
async function edit(page: Page) {
  await firstSession(page).getByText('High', { exact: true }).click();
}
async function askToContinue(page: Page) {
  await openCareerPage(page, 'Hub');
  await page.getByRole('button', { name: 'Continue to next matchday', exact: true }).click();
  await expect(
    page.getByRole('dialog', { name: 'Save your training before continuing?' }),
  ).toBeVisible();
}

test('training survives tabs, pending status is distinct, and saving survives reload', async ({
  page,
}) => {
  await edit(page);
  await openCareerPage(page, 'Profile');
  await expect(
    page.getByRole('link', { name: 'Training changes pending', exact: true }),
  ).toBeVisible();
  await openCareerPage(page, 'Training');
  await expect(high(page)).toBeChecked();
  await page.getByRole('button', { name: 'Save training', exact: true }).click();
  await expect(
    page.getByRole('link', { name: 'Training changes pending', exact: true }),
  ).toHaveCount(0);
  await page.reload();
  await expect(high(page)).toBeChecked({ timeout: 30000 });
  await edit(page);
  await firstSession(page).getByText('Normal', { exact: true }).click();
  await page.getByRole('button', { name: 'Discard changes', exact: true }).click();
  await expect(high(page)).toBeChecked();
});

test('Back cancels the time-advance gate and Keep editing returns to the draft', async ({
  page,
}) => {
  await edit(page);
  await askToContinue(page);
  await page.goBack();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(
    page.getByRole('link', { name: 'Training changes pending', exact: true }),
  ).toBeVisible();
  await askToContinue(page);
  await page.getByRole('button', { name: 'Keep editing', exact: true }).click();
  await expect(page).toHaveURL(/\/career\/training\?save=1$/);
  await expect(high(page)).toBeChecked();
});

test('continuing with the saved plan explicitly discards the draft', async ({ page }) => {
  await edit(page);
  await askToContinue(page);
  await page.getByRole('button', { name: 'Continue with saved training', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Play matchday', exact: true })).toBeVisible({
    timeout: 60000,
  });
  await openCareerPage(page, 'Training');
  await expect(normal(page)).toBeChecked();
  await expect(
    page.getByRole('link', { name: 'Training changes pending', exact: true }),
  ).toHaveCount(0);
});

test('season confirmation hands off to the training gate without advancing', async ({ page }) => {
  await edit(page);
  await openCareerPage(page, 'Hub');
  await page.getByRole('button', { name: 'Simulate the season', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Auto-play my matches', exact: true })
    .click();
  await expect(
    page.getByRole('dialog', { name: 'Save your training before continuing?' }),
  ).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(
    page.getByRole('link', { name: 'Training changes pending', exact: true }),
  ).toBeVisible();
  await openCareerPage(page, 'Training');
  await expect(high(page)).toBeChecked();
});

test('Save and continue applies the new training before advancing', async ({ page }) => {
  await edit(page);
  await askToContinue(page);
  await page.getByRole('button', { name: 'Save and continue', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Play matchday', exact: true })).toBeVisible({
    timeout: 60000,
  });
  await openCareerPage(page, 'Training');
  await expect(high(page)).toBeChecked();
  await page.reload();
  await expect(high(page)).toBeChecked({ timeout: 30000 });
});

test('loading a save can be cancelled without a false success notice or lost draft', async ({
  page,
}) => {
  await edit(page);
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .first()
    .getByRole('link', { name: 'Saved games', exact: true })
    .click();
  await page.getByRole('button', { name: 'Continue career', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Leave training changes behind?' })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.notice')).not.toHaveText('Save loaded.');
  await expect(
    page.getByRole('link', { name: 'Training changes pending', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Continue career', exact: true }).click();
  await page.getByRole('button', { name: 'Discard changes and continue', exact: true }).click();
  await expect(page.locator('.notice')).toHaveText('Save loaded.');
  await openCareerPage(page, 'Training');
  await expect(normal(page)).toBeChecked();
});

test('a nested deletion gate returns to the original confirmation on Back', async ({ page }) => {
  await edit(page);
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .first()
    .getByRole('link', { name: 'Saved games', exact: true })
    .click();
  await page.getByRole('button', { name: 'Delete save', exact: true }).click();
  const deletion = page.getByRole('dialog', { name: 'Delete this save?' });
  await deletion.getByRole('button', { name: 'Delete save', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Leave training changes behind?' })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('dialog', { name: 'Leave training changes behind?' })).toHaveCount(0);
  await expect(deletion).toBeVisible();
  await deletion.getByRole('button', { name: 'Keep save', exact: true }).click();
  await expect(page.locator('.slot-card').first().getByRole('heading')).toHaveText('Training UX');
  await expect(
    page.getByRole('link', { name: 'Training changes pending', exact: true }),
  ).toBeVisible();
});

test('tablet navigation fits large text and large unread badges', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await openCareerPage(page, 'Hub');
  for (const percent of [100, 130]) {
    await page.evaluate((scale) => {
      document.documentElement.style.fontSize = `${scale}%`;
      document.querySelectorAll('.sidebar .nav-badge').forEach((b) => {
        b.textContent = '99+';
      });
    }, percent);
    const sizes = await page
      .locator('.sidebar nav')
      .evaluate((n) => ({ width: n.clientWidth, scroll: n.scrollWidth }));
    expect(sizes.scroll).toBeLessThanOrEqual(sizes.width + 1);
    const pageSizes = await page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      scroll: document.documentElement.scrollWidth,
    }));
    expect(pageSizes.scroll).toBeLessThanOrEqual(pageSizes.width + 1);
  }
});

test('phone training actions clear the bottom bar and focused controls', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await edit(page);
  for (const percent of [100, 130]) {
    await page.evaluate((scale) => {
      document.documentElement.style.fontSize = `${scale}%`;
    }, percent);
    await page.locator('#focus-2').focus();
    await expect(page.getByRole('button', { name: 'Save training', exact: true })).toBeVisible();
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const actions = document
            .querySelector('[data-testid="training-actions"]')!
            .getBoundingClientRect();
          return (
            document.querySelector('#focus-2')!.getBoundingClientRect().bottom <= actions.top &&
            actions.bottom <= document.querySelector('.bottom-nav')!.getBoundingClientRect().top
          );
        }),
      )
      .toBe(true);
    const boxes = await page.evaluate(() => {
      const rect = (selector: string) => document.querySelector(selector)!.getBoundingClientRect();
      const actions = rect('[data-testid="training-actions"]');
      return {
        actionsBottom: actions.bottom,
        actionsTop: actions.top,
        navTop: rect('.bottom-nav').top,
        fieldBottom: rect('#focus-2').bottom,
      };
    });
    expect(boxes.actionsBottom).toBeLessThanOrEqual(boxes.navTop);
    expect(boxes.fieldBottom).toBeLessThanOrEqual(boxes.actionsTop);
  }
});
