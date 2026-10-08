import { expect, test, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { generateWorld } from '../src/engine/world/generate';
import { createCareer, trialOffers } from '../src/engine/career/create';
import { advanceCareerWeek } from '../src/engine/career/season';
import { pendingCareerFixture } from '../src/engine/career/fixtures';
import { createSave, DEFAULT_SETTINGS } from '../src/persistence/schema';
import type { DecisionSample } from '../src/model/domain';
import { isBrowserNoise, skipTutorial } from './support';

/**
 * Phase 5: the manager's formation and the selection reasons on the Club page and in the
 * briefing; coaching advice that fills a draft only saving applies; a season goal that stays
 * once accepted.
 */
const saves = new Map<string, string>();
test.beforeAll(async ({ browserName }, workerInfo) => {
  const base = generateWorld('coaching-journey', { format: 'legacy' });
  const trial = trialOffers(base, 'country:0', 'coaching-journey')[0]!;
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
    'coaching-journey',
  );
  for (let week = 0; week < 4; week++)
    world = advanceCareerWeek(world, { inPlace: true, autoPlay: true }).world;
  for (let guard = 0; guard < 6 && !pendingCareerFixture(world); guard++)
    world = advanceCareerWeek(world, { inPlace: true, autoPlay: true }).world;
  // A clear pattern: passes that kept failing despite good chances.
  const failing: DecisionSample[] = Array.from({ length: 10 }, (_, index) => ({
    season: world.date.season,
    week: 1,
    family: 'passing',
    success: index < 2,
    probability: 0.75,
    attributes: ['passing', 'vision'],
  }));
  world.career!.coaching!.recent = failing;
  const player = world.players[world.career!.playerId]!;
  player.attributes.passing = 30;
  player.fatigue = 10;
  await mkdir('artifacts', { recursive: true });
  const path = `artifacts/coaching-${browserName}-${workerInfo.workerIndex}.json`;
  await writeFile(
    path,
    JSON.stringify(
      createSave(1, 'Coaching', {
        kind: 'world',
        world,
        gallery: { seed: 'coaching', generation: 0 },
        settings: DEFAULT_SETTINGS,
      }),
    ),
  );
  saves.set('career', path);
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
async function importCareer(page: Page) {
  await page.goto('/saves');
  await page
    .locator('.slot-card')
    .nth(0)
    .getByLabel('Import backup — Slot 1')
    .setInputFiles(saves.get('career')!);
  await expect(page.locator('.notice')).toHaveText('Collection imported.', { timeout: 30000 });
}

test('the Club page and the briefing explain selection with the formation', async ({ page }) => {
  test.setTimeout(120000);
  await importCareer(page);
  await page.goto('/career/club?save=1');
  const card = page.getByRole('region', { name: 'Selection' });
  await expect(card).toContainText(/The manager plays (4-3-3|4-4-2|4-2-3-1|3-5-2)\./, {
    timeout: 30000,
  });
  await expect(card).toContainText('Role promised');
  await expect(card).toContainText(/Chance of starting the next match\s*\d+%/);
  await page.goto('/match?save=1');
  await page.getByRole('button', { name: 'Go to the pre-match briefing' }).click();
  await expect(page.getByRole('heading', { name: 'How the manager picked you' })).toBeVisible({
    timeout: 30000,
  });
  await expect(page.getByText(/You were picked to start: a \d+% chance/)).toBeVisible();
  // Each side's eleven shows its formation and the slot each starter fills.
  await expect(page.locator('.match-lineup-title').first()).toContainText(
    /(4-3-3|4-4-2|4-2-3-1|3-5-2)/,
  );
  await expect(page.locator('.match-lineup').first().locator('li')).toHaveCount(11);
});

test('advice fills a draft that only saving applies, and a goal stays once taken', async ({
  page,
}) => {
  test.setTimeout(120000);
  await importCareer(page);
  await page.goto('/career/training?save=1');
  const advice = page.getByRole('region', { name: 'Coach’s advice' });
  await expect(advice).toContainText('From your last 10 key decisions.', { timeout: 30000 });
  await expect(advice).toContainText('Passes worked 2 of 10 times');
  const first = page.locator('#focus-0');
  const saved = await first.inputValue();
  await advice.getByRole('button', { name: 'Plan these sessions' }).click();
  await expect(first).toHaveValue('passing');
  await expect(page.getByText('The sessions are in your plan below.')).toBeVisible();
  // Not applied until saved: a reload keeps the saved plan.
  await page.reload();
  await expect(page.locator('#focus-0')).toHaveValue(saved, { timeout: 30000 });
  await page
    .getByRole('region', { name: 'Coach’s advice' })
    .getByRole('button', {
      name: 'Plan these sessions',
    })
    .click();
  await page.getByRole('button', { name: 'Save training plan' }).click();
  await expect(page.getByText('All changes saved').first()).toBeVisible({ timeout: 30000 });
  await page.reload();
  await expect(page.locator('#focus-0')).toHaveValue('passing', { timeout: 30000 });
  await expect(page.getByText('Your saved plan already follows this advice.')).toBeVisible();

  const goal = page.getByRole('region', { name: 'Season goal' });
  const offered = (await goal.locator('.font-display').first().textContent())!;
  await goal.getByRole('button', { name: 'Take it on' }).click();
  await expect(goal.getByRole('progressbar')).toBeVisible();
  await expect(goal).toContainText(offered);
  await expect(page.getByText('All changes saved').first()).toBeVisible({ timeout: 30000 });
  await page.reload();
  await expect(page.getByRole('region', { name: 'Season goal' })).toContainText(offered, {
    timeout: 30000,
  });
  await expect(page.getByRole('region', { name: 'Season goal' })).toContainText(
    'It stays as it is until the season ends.',
  );
});

test('the hub’s coaching tile opens Training with the advice ready to save', async ({ page }) => {
  test.setTimeout(120000);
  await importCareer(page);
  await page.goto('/career?save=1');
  const tile = page.getByRole('region', { name: 'Coach’s advice' });
  await expect(tile).toContainText('Suggests: Passing', { timeout: 30000 });
  await tile.getByRole('link', { name: 'See the advice' }).click();
  await expect(page).toHaveURL(/\/career\/training\?advice=1&save=1/);
  await expect(page.locator('#focus-0')).toHaveValue('passing', { timeout: 30000 });
  await expect(page.getByText('The sessions are in your plan below.')).toBeVisible();
});
