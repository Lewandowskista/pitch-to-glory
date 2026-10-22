import { expect, test, type Page } from '@playwright/test';
import { isAbortedLoad, isBrowserNoise, skipTutorial } from './support';
import { generateWorld } from '../src/engine/world/generate';
import { createCareer, trialOffers } from '../src/engine/career/create';
import { advanceCareerWeek } from '../src/engine/career/season';
import { startNextSeason } from '../src/engine/world/simulate';
import { createSave, DEFAULT_SETTINGS } from '../src/persistence/schema';
import type { World } from '../src/model/domain';

/**
 * Review phase 3, step 3.2: between seasons the career player plays their nation's tournament
 * matches in the match screen, or has them simulated, before the next season starts.
 */
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
test.use({ actionTimeout: 15000 });

/** Two engine-played seasons: the second ends before a tournament year, the player named in it. */
let cached: string | undefined;
function tournamentSave(): string {
  if (cached) return cached;
  const base = generateWorld('tournament-browser', { format: 'legacy' });
  const trial = trialOffers(base, 'country:0', 'tournament-browser')[0]!;
  let world: World = createCareer(
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
    'tournament-browser',
  );
  for (let season = 0; season < 2; season++) {
    if (season) world = startNextSeason(world, { inPlace: true });
    while (world.phase === 'active')
      world = advanceCareerWeek(world, { inPlace: true, autoPlay: true }).world;
  }
  const live = world.international!.live!;
  live.inSquad = true;
  live.starts = true;
  cached = JSON.stringify(
    createSave(1, 'Tournament career', {
      kind: 'world',
      world,
      gallery: { seed: 'tournament-browser', generation: 0 },
      settings: DEFAULT_SETTINGS,
    }),
  );
  return cached;
}

const state = (page: Page) => page.getByTestId('match-state');
/** Play the prepared match from kickoff to full time, using skip and number keys. */
async function playMatch(page: Page) {
  await page.getByRole('button', { name: 'Kick off', exact: true }).click();
  for (let turns = 0; turns < 160; turns++) {
    const status = await state(page).getAttribute('data-status');
    if (status === 'finished') return;
    if (status === 'decision') {
      await expect(page.locator('.match-choices button').first()).toBeFocused();
      await page.keyboard.press('1');
      await expect(state(page)).not.toHaveAttribute('data-status', 'decision');
    } else if (status === 'halftime')
      await page.getByRole('button', { name: /Motivate the team/ }).click();
    else if (await page.getByRole('button', { name: /Accept the change/ }).isVisible())
      await page.getByRole('button', { name: /Accept the change/ }).click();
    else if (await page.getByRole('button', { name: /Keep the team composed/ }).isVisible())
      await page.getByRole('button', { name: /Keep the team composed/ }).click();
    else {
      const pause = page.getByRole('button', { name: 'Pause', exact: true });
      if (await pause.isVisible()) await pause.click();
      await page
        .getByRole('button', { name: 'Next key moment', exact: true })
        .click({ timeout: 3000 })
        .catch(() => {});
    }
  }
  throw new Error('Tournament match did not reach full time');
}

test('plays a tournament match for the nation, then the rest before the next season', async ({
  page,
}) => {
  test.setTimeout(300000);
  await page.goto('/saves');
  await page
    .locator('.slot-card')
    .nth(0)
    .getByLabel('Import backup — Slot 1')
    .setInputFiles({
      name: 'tournament.json',
      mimeType: 'application/json',
      buffer: Buffer.from(tournamentSave()),
    });
  await expect(page.locator('.slot-card').nth(0).getByRole('heading')).toHaveText(
    'Tournament career',
  );

  // The hub puts the nation's match first; the next season waits for the tournament.
  await page.goto('/career?save=1');
  const card = page.getByTestId('tournament-card');
  await expect(card).toBeVisible();
  await expect(page.getByText('Group matchday 1', { exact: true })).toBeVisible();
  await expect(card.getByRole('table')).toContainText('Group');
  await expect(page.getByRole('button', { name: 'Start next season' })).toHaveCount(0);
  await page.getByRole('link', { name: 'Play the match', exact: true }).click();
  await expect(page).toHaveURL(/\/match/);

  // The match screen names the tournament and both nations, and survives a refresh.
  const fixture = page.getByTestId('tournament-fixture');
  await expect(fixture).toBeVisible();
  await expect(fixture).toContainText('Group matchday 1');
  await fixture.getByRole('button', { name: 'Go to the pre-match briefing' }).click();
  await expect(state(page)).toHaveAttribute('data-status', 'preview');
  await expect(page.locator('.save-indicator')).toContainText('All changes saved', {
    timeout: 60000,
  });
  await page.reload();
  await expect(state(page)).toHaveAttribute('data-status', 'preview', { timeout: 30000 });
  await expect(page.locator('.eyebrow').first()).toContainText(/Nations (Championship|Cup) 2028/);

  // Full time records the result once, with the XP it granted.
  await playMatch(page);
  await expect(page.getByTestId('career-xp')).toBeVisible({ timeout: 60000 });
  await expect(page.getByTestId('career-xp')).toContainText('XP earned');

  // Continue plays the rest of the round and brings the next match.
  await page.getByRole('button', { name: 'Continue the tournament', exact: true }).click();
  await expect(page.getByTestId('tournament-fixture')).toContainText('Group matchday 2', {
    timeout: 60000,
  });

  // The rest is simulated from the hub, until the next season can start.
  await page.goto('/career?save=1');
  const next = page.getByRole('button', { name: 'Start next season', exact: true });
  for (let step = 0; step < 12 && !(await next.isVisible()); step++) {
    const simulate = page.getByRole('button', { name: 'Simulate this match', exact: true });
    const proceed = page.getByRole('button', { name: 'Continue the tournament', exact: true });
    await expect(simulate.or(proceed).or(next)).toBeVisible({ timeout: 60000 });
    if (await next.isVisible()) break;
    await ((await simulate.isVisible()) ? simulate : proceed).click();
    // The job's progress panel goes once the round is played.
    await expect(page.getByRole('region', { name: 'Simulating weeks…' })).toHaveCount(0, {
      timeout: 60000,
    });
  }
  await expect(next).toBeVisible();
  await expect(card).toHaveCount(0);
  await next.click();
  await expect(page.getByText('A new season begins.')).toBeVisible({ timeout: 120000 });
});
