import { expect, test, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { generateWorld } from '../src/engine/world/generate';
import { createCareer, trialOffers } from '../src/engine/career/create';
import { advanceCareerWeek } from '../src/engine/career/season';
import { pendingCareerFixture } from '../src/engine/career/fixtures';
import { createSave, DEFAULT_SETTINGS } from '../src/persistence/schema';
import type { World } from '../src/model/domain';
import { careerTabs, isBrowserNoise, skipTutorial } from './support';

/**
 * Phase 3.2: the hub puts the next action first and lists what needs the player in order;
 * the calendar, the Continue preview and the digest restore after a refresh.
 */
const saves = new Map<string, string>();
function between(seed: string): World {
  const base = generateWorld(seed, { format: 'legacy' });
  const trial = trialOffers(base, 'country:0', seed)[0]!;
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
    seed,
  );
  for (let week = 0; week < 6; week++)
    world = advanceCareerWeek(world, { inPlace: true, autoPlay: true }).world;
  for (let guard = 0; guard < 6 && pendingCareerFixture(world); guard++)
    world = advanceCareerWeek(world, { inPlace: true, autoPlay: true }).world;
  return world;
}
test.beforeAll(async ({ browserName }, workerInfo) => {
  await mkdir('artifacts', { recursive: true });
  const ready = between('agenda');
  ready.career!.skillPoints = 2;
  const injured = between('agenda');
  injured.career!.injury = {
    id: 'injury:agenda',
    playerId: injured.career!.playerId,
    kind: 'hamstring-strain',
    started: { ...injured.date },
    weeksRemaining: 3,
    severity: 3,
    reinjuryRisk: 0,
    recovery: null,
    careerThreatening: false,
    cause: 'match',
  };
  injured.players[injured.career!.playerId]!.injuryId = 'injury:agenda';
  injured.career!.skillPoints = 2;
  for (const [name, world] of Object.entries({ ready, injured })) {
    const path = `artifacts/agenda-${name}-${browserName}-${workerInfo.workerIndex}.json`;
    await writeFile(
      path,
      JSON.stringify(
        createSave(1, 'Agenda', {
          kind: 'world',
          world,
          gallery: { seed: 'agenda', generation: 0 },
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
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (entry) => {
    if (entry.type() === 'error' && !isBrowserNoise(entry)) errors.push(entry.text());
  });
  (page as Page & { errors: string[] }).errors = errors;
});
test.afterEach(async ({ page }) => {
  expect((page as Page & { errors: string[] }).errors).toEqual([]);
});

async function importCareer(page: Page, name: string) {
  await page.goto('/saves');
  await page
    .locator('.slot-card')
    .nth(0)
    .getByLabel('Import backup — Slot 1')
    .setInputFiles(saves.get(name)!);
  await expect(page.locator('.notice')).toHaveText('Collection imported.', { timeout: 30000 });
}
const priorities = (page: Page) => page.getByRole('region', { name: 'Needs you' });

test('the main action is on screen on a phone, and Continue says what it will do', async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 390, height: 844 });
  await importCareer(page, 'ready');
  await page.goto('/career?save=1');
  const action = page.getByRole('button', { name: 'Continue to next matchday' });
  await expect(action).toBeVisible({ timeout: 30000 });
  const box = (await action.boundingBox())!;
  const bar = (await page.locator('.bottom-nav').boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height, 'above the tab bar').toBeLessThanOrEqual(bar.y);
  await expect(page.getByText(/^Continue plays out week/)).toContainText('if you are picked');
  // Unspent points wait in the list, in words a player understands.
  await expect(priorities(page).getByRole('link', { name: /Spend 2 skill points/ })).toBeVisible();
});

test('a recovery choice comes first and the hero leads to it', async ({ page }) => {
  test.setTimeout(120000);
  await importCareer(page, 'injured');
  await page.goto('/career?save=1');
  const first = priorities(page).getByRole('listitem').first();
  await expect(first).toContainText('Choose how to recover', { timeout: 30000 });
  // Unspent points come after it: attributes, then skills.
  await expect(priorities(page).getByRole('listitem').nth(1)).toContainText(/Spend \d+ attribute/);
  await expect(priorities(page).getByRole('listitem').nth(2)).toContainText('Spend 2 skill points');
  await expect(page.getByRole('button', { name: /Simulate the season/ })).toHaveCount(0);
  await page.getByRole('link', { name: 'Choose how to recover' }).first().click();
  await expect(page).toHaveURL(/\/career\?save=1#recovery$/);
  await expect(page.getByRole('button', { name: /Full rehab/ })).toBeFocused();
  await page.getByRole('button', { name: /Full rehab/ }).click();
  await expect(priorities(page)).not.toContainText('Choose how to recover');
  await expect(page.getByText(/You are expected back in week/)).toBeVisible();
});

test('the calendar keeps its view and links after a refresh', async ({ page }) => {
  test.setTimeout(120000);
  await importCareer(page, 'ready');
  await page.goto('/career?save=1');
  await priorities(page).getByRole('link', { name: 'Open the calendar' }).click();
  await expect(page).toHaveURL(/\/career\/calendar\?save=1$/);
  await expect(
    careerTabs(page, 'Overview').getByRole('link', { name: 'Calendar' }),
  ).toHaveAttribute('aria-current', 'page');
  const weeks = page.getByRole('tabpanel');
  await expect(weeks.locator('[aria-current="date"]')).toHaveCount(1);
  await expect(weeks.locator('[aria-current="date"]')).toContainText('This week');
  const ahead = await weeks.locator('ol > li').count();
  await page.getByRole('tab', { name: 'Whole season' }).click();
  await expect(page).toHaveURL(/weeks=all/);
  await page.reload();
  await expect(page.getByRole('tab', { name: 'Whole season' })).toHaveAttribute(
    'aria-selected',
    'true',
    { timeout: 30000 },
  );
  expect(await weeks.locator('ol > li').count()).toBeGreaterThan(ahead);
  // Played weeks show their results.
  await expect(weeks.getByText(/^(Won|Drew|Lost) \d+–\d+/).first()).toBeVisible();
  // Arrow keys move between the views.
  await page.getByRole('tab', { name: 'Whole season' }).focus();
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('tab', { name: 'From this week' })).toBeFocused();
  await expect(page).not.toHaveURL(/weeks=all/);
  // A link out keeps the save, so the destination restores after a refresh too.
  await weeks.getByRole('link', { name: 'Change the plan' }).click();
  await expect(page).toHaveURL(/\/career\/training\?save=1$/);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Training', level: 1 })).toBeVisible({
    timeout: 30000,
  });
});

test('after Continue the digest reports the weeks played and survives a refresh', async ({
  page,
}) => {
  test.setTimeout(180000);
  await importCareer(page, 'ready');
  await page.goto('/career?save=1');
  const preview = await page.getByText(/^Continue plays out week/).textContent();
  const target = Number(preview!.match(/stops in week (\d+)/)![1]);
  await page.getByRole('button', { name: 'Continue to next matchday' }).click();
  const digest = page.getByRole('region', { name: 'While the world played on' });
  await expect(digest).toBeVisible({ timeout: 60000 });
  await expect(page).toHaveURL(/since=\d+\.\d+/);
  // It stopped where the preview said, or later when the player was not picked.
  const covered = (await digest.textContent())!.match(/Weeks? (\d+)(?:–(\d+))?/)!;
  expect(Number(covered[2] ?? covered[1]) + 1).toBeGreaterThanOrEqual(target);
  await expect(page.getByText('All changes saved').first()).toBeVisible({ timeout: 30000 });
  await page.reload();
  await expect(digest).toBeVisible({ timeout: 30000 });
  await digest.getByRole('button', { name: /Dismiss/ }).click();
  await expect(digest).toHaveCount(0);
  await expect(page).not.toHaveURL(/since=/);
});
