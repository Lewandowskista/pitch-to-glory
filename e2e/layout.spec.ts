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

test('training intensity choices stay readable on a tablet, at normal and large text', async ({
  page,
}) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await openCareerPage(page, 'Training');
  await expect(page.locator('#focus-0')).toBeVisible();
  for (const percent of [100, 130]) {
    await page.evaluate((scale) => {
      document.documentElement.style.fontSize = `${scale}%`;
    }, percent);
    const problems = await page.evaluate(() =>
      Array.from(document.querySelectorAll('fieldset')).flatMap((fieldset, session) => {
        const labels = Array.from(fieldset.querySelectorAll('label'));
        return labels.flatMap((label, index) => {
          const box = label.getBoundingClientRect();
          const issues: string[] = [];
          // The label's own text fits inside it, and it does not run into its neighbour.
          if (label.scrollWidth > label.clientWidth + 1)
            issues.push(`session ${session + 1} option ${index + 1} clipped`);
          const next = labels[index + 1]?.getBoundingClientRect();
          if (next && box.right > next.left + 1)
            issues.push(`session ${session + 1} options ${index + 1}/${index + 2} overlap`);
          if (box.width < 60) issues.push(`session ${session + 1} option ${index + 1} too narrow`);
          return issues;
        });
      }),
    );
    expect(problems, `${percent}% text`).toEqual([]);
  }
});

test('the phone hub shows the next action and the player’s condition in the first view', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  const hero = page.getByRole('region', { name: 'Next match' });
  await expect(hero).toBeVisible({ timeout: 30000 });
  const boxes = await hero.evaluate((section) => {
    const rect = (element: Element | null) => element!.getBoundingClientRect();
    return {
      action: rect(section.querySelector('.button.play')).bottom,
      condition: rect(section.querySelector('dl')).bottom,
      bar: rect(document.querySelector('.bottom-nav')).top,
    };
  });
  expect(boxes.condition).toBeLessThanOrEqual(boxes.action);
  expect(boxes.action).toBeLessThanOrEqual(boxes.bar);
  await expect(hero.getByText('Fatigue', { exact: true })).toBeVisible();
});

test('a phone opens a skill beside the tree, and Back returns to it', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openCareerPage(page, 'Skills');
  const node = page.locator('[data-skill]').nth(3);
  const id = await node.getAttribute('data-skill');
  await node.click();
  const sheet = page.getByRole('dialog');
  await expect(sheet).toBeVisible();
  await expect(page).toHaveURL(/detail=1/);
  // The detail is on screen at once, without a trip past every branch.
  const box = (await sheet.boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeLessThan(844);
  await page.goBack();
  await expect(sheet).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`skill=${id}`));
  await expect(page.locator(`[data-skill="${id}"]`)).toBeFocused();
  // Escape closes it too, keeping the selection.
  await page.locator(`[data-skill="${id}"]`).click();
  await expect(sheet).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
  await expect(page.locator(`[data-skill="${id}"]`)).toBeFocused();
  // A branch filter narrows the tree.
  await page.getByRole('button', { name: 'Defending', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Defending' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Finishing' })).toHaveCount(0);
});

test('profile attribute controls stay readable beside the tablet sidebar', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await openCareerPage(page, 'Profile');
  await expect(page.locator('button[data-attribute]').first()).toBeVisible();
  for (const percent of [100, 130]) {
    await page.evaluate((scale) => {
      document.documentElement.style.fontSize = `${scale}%`;
    }, percent);
    const narrowest = await page.evaluate(() =>
      Math.min(
        ...Array.from(document.querySelectorAll('button[data-attribute]')).map(
          (button) => button.closest('li')!.getBoundingClientRect().width,
        ),
      ),
    );
    // One list in this narrow panel: each row keeps room for its label, value and button.
    expect(narrowest, `${percent}% text`).toBeGreaterThan(300);
  }
});

test('empty history stays compact and the national team columns line up', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openCareerPage(page, 'Trophies');
  // No Golden Ball yet: one compact notice, not a full card waiting to be filled.
  const ball = page.getByRole('region', { name: 'Golden Ball' });
  await expect(ball).toBeVisible();
  expect((await ball.boundingBox())!.height).toBeLessThan(120);
  await openCareerPage(page, 'National team');
  const box = async (name: string) =>
    (await page.getByRole('region', { name, exact: true }).boundingBox())!;
  const tournaments = await box('Tournaments');
  const internationals = await box('Recent internationals');
  const callUp = (await page
    .locator('#national-heading')
    .locator('xpath=ancestor::section[1]')
    .boundingBox())!;
  // Each column keeps its edges from one section to the next.
  expect(Math.abs(tournaments.x - callUp.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(tournaments.width - callUp.width)).toBeLessThanOrEqual(1);
  expect(internationals.x).toBeGreaterThan(callUp.x + callUp.width);
});

test('settings use two topic columns on a wide screen and one on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/settings');
  const appearance = page.getByRole('heading', { name: 'Appearance' });
  const sound = page.getByRole('heading', { name: 'Sound', exact: true });
  await expect(sound).toBeVisible();
  expect((await sound.boundingBox())!.x).toBeGreaterThan((await appearance.boundingBox())!.x + 300);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    Math.abs((await sound.boundingBox())!.x - (await appearance.boundingBox())!.x),
  ).toBeLessThanOrEqual(1);
});
