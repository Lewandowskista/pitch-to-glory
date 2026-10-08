import { expect, test, type Page } from '@playwright/test';
import { isAbortedLoad, isBrowserNoise, openCareerPage, skipTutorial } from './support';
import { mkdir } from 'node:fs/promises';
import { generateWorld } from '../src/engine/world/generate';
import { createCareer, trialOffers } from '../src/engine/career/create';
import { advanceCareerWeek } from '../src/engine/career/season';
import { createSave, DEFAULT_SETTINGS } from '../src/persistence/schema';
import type { SlotId } from '../src/model/domain';

test.beforeEach(async ({ page }) => {
  await skipTutorial(page);
  const errors: string[] = [];
  page.on('pageerror', (error) => {
    if (!isAbortedLoad(error.message)) errors.push(error.message);
  });
  page.on('console', (entry) => {
    if (entry.type() === 'error' && !isBrowserNoise(entry)) errors.push(entry.text());
  });
  await page.addInitScript(() => {
    window.addEventListener('unhandledrejection', (event) => {
      throw new Error(String(event.reason));
    });
  });
  (page as Page & { errors: string[] }).errors = errors;
});
test.afterEach(async ({ page }) => {
  expect((page as Page & { errors: string[] }).errors).toEqual([]);
});

test.use({ actionTimeout: 15000 });

const state = (page: Page) => page.getByTestId('match-state');

/** Play a prepared career fixture from kickoff to full time, using skip and number keys. */
async function playMatch(page: Page) {
  await page.getByRole('button', { name: 'Go to the pre-match briefing', exact: true }).click();
  await expect(state(page)).toHaveAttribute('data-status', 'preview');
  await page.getByRole('button', { name: 'Kick off', exact: true }).click();
  for (let turns = 0; turns < 120; turns++) {
    const status = await state(page).getAttribute('data-status');
    if (status === 'finished') return;
    if (status === 'decision') {
      // The first choice takes focus; number keys pick a choice.
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
      // The match can reach a decision or a prompt between reading the state and clicking,
      // which disables the button: try briefly, then read the state again.
      await page
        .getByRole('button', { name: 'Next key moment', exact: true })
        .click({ timeout: 3000 })
        .catch(() => {});
    }
  }
  throw new Error('Career match did not reach full time');
}

test('creates a career, plays matchdays, develops the player and restores the hub', async ({
  page,
  browserName,
}) => {
  test.setTimeout(420000);
  await page.goto('/');
  await page.getByRole('link', { name: 'Start a career', exact: true }).click();
  await expect(page).toHaveURL(/\/career\/new/);

  // Identity: Enter submits the step.
  await page.getByLabel('Player name', { exact: true }).fill('Robin Vale');
  await page.getByRole('radio', { name: /France/ }).check({ force: true });
  await page.getByLabel('Player name', { exact: true }).press('Enter');
  await expect(page).toHaveURL(/step=appearance/);
  await page.getByRole('button', { name: 'Eyebrows', exact: true }).click();
  await page.getByRole('radio', { name: 'Eyebrows 3', exact: true }).check({ force: true });
  await page.getByRole('button', { name: 'Randomise look', exact: true }).click();
  // Browser back and forward move between steps.
  await page.goBack();
  await expect(page).toHaveURL(/\/career\/new(\?step=identity)?$/);
  await expect(page.getByLabel('Player name', { exact: true })).toHaveValue('Robin Vale');
  await page.goForward();
  await expect(page).toHaveURL(/step=appearance/);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();

  // Position and archetype.
  await page.getByRole('radio', { name: /^ST/ }).check({ force: true });
  await page.getByRole('radio', { name: /^Finisher/ }).check({ force: true });
  await page.getByRole('button', { name: 'Continue', exact: true }).click();

  // World: build a new world in the worker.
  await page.getByLabel('World seed', { exact: true }).fill('career-browser');
  await page.getByRole('button', { name: 'Build world', exact: true }).click();
  await expect(page.getByText(/World ready: 959 clubs/)).toBeVisible({ timeout: 60000 });
  await page.getByRole('button', { name: 'Continue', exact: true }).click();

  // Trial offers.
  await expect(
    page.getByRole('heading', { name: 'Three clubs want a look at you.' }),
  ).toBeVisible();
  const offers = page.locator('input[name="trial"]');
  await expect(offers).toHaveCount(3);
  await offers.first().check({ force: true });
  await page.getByRole('button', { name: 'Continue', exact: true }).click();

  // Sign and save in slot 1, so every later step, including the save right after each
  // recorded match (mid-week), runs against a real saved slot.
  await expect(page.getByRole('heading', { name: 'Ready to sign?' })).toBeVisible();
  await page.getByRole('radio', { name: 'Save in slot 1', exact: true }).check({ force: true });
  await page.getByRole('button', { name: /^Sign for / }).click();
  await expect(page).toHaveURL(/\/career(\?save=1)?$/, { timeout: 60000 });
  await expect(page.getByRole('heading', { name: 'Career hub', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Robin Vale' })).toBeVisible();
  if (browserName === 'chromium') {
    await mkdir('artifacts', { recursive: true });
    await page.screenshot({ path: 'artifacts/career-hub.png', fullPage: true });
  }

  // Reach the first matchday, then play until a level-up grants points.
  const play = page.getByRole('link', { name: 'Play matchday', exact: true });
  if (!(await play.isVisible())) {
    await page.getByRole('button', { name: 'Continue to next matchday', exact: true }).click();
    await expect(play).toBeVisible({ timeout: 120000 });
  }
  await play.click();
  await expect(page).toHaveURL(/\/match/);
  let levelled = false;
  for (let match = 0; match < 6 && !levelled; match++) {
    await playMatch(page);
    // Full time records the result once and shows the XP it granted.
    await expect(page.getByTestId('career-xp')).toBeVisible({ timeout: 60000 });
    await expect(page.getByTestId('career-xp')).toContainText('XP earned');
    await expect(page.getByRole('button', { name: 'Play again' })).toHaveCount(0);
    levelled = await page.getByTestId('level-up').isVisible();
    if (levelled) break;
    // A second fixture the same week (a cup tie) comes first; otherwise the week moves on.
    const next = page.getByRole('button', { name: 'Your next fixture', exact: true });
    if (await next.isVisible()) await next.click();
    else await page.getByRole('button', { name: 'Continue to next matchday', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Go to the pre-match briefing', exact: true }),
    ).toBeVisible({ timeout: 120000 });
  }
  expect(levelled).toBe(true);
  await expect(page.getByTestId('level-up')).toContainText('Level up!');

  // Allocate an attribute point.
  await page.getByTestId('level-up').getByRole('link', { name: 'Allocate points' }).click();
  await expect(page).toHaveURL(/\/career\/profile/);
  const points = page.getByTestId('attribute-points');
  const before = Number(await points.textContent());
  expect(before).toBeGreaterThan(0);
  const raise = page.getByRole('button', { name: /^Finishing: raise|^Raise Finishing/ });
  await raise.click();
  await expect(points).toHaveText(String(before - 1));
  await expect(page.getByRole('status').filter({ hasText: 'Finishing raised to' })).toBeAttached();

  // Unlock an available skill with confirmation; arrow keys move through the tree.
  await openCareerPage(page, 'Skills');
  await expect(page).toHaveURL(/\/career\/skills/);
  const firstNode = page.locator('[data-skill]').first();
  await firstNode.focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('[data-skill]').nth(1)).toBeFocused();
  const available = page.locator('[data-skill][aria-label*="Available"]').first();
  // Skills cost two points or more: unlock one if the points already cover it.
  if ((await available.count()) > 0) {
    await available.click();
    await page.getByRole('button', { name: 'Unlock skill', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Unlock skill', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('status').filter({ hasText: 'unlocked' })).toBeAttached();
  }

  // Change a training session and save the plan.
  await openCareerPage(page, 'Training');
  await page.locator('#focus-0').selectOption('finishing');
  await page.getByRole('radio', { name: 'High' }).first().check({ force: true });
  await page.getByRole('button', { name: 'Save training', exact: true }).click();
  await expect(page.getByText('Training plan saved.', { exact: false })).toBeVisible();

  // Back on the hub, advance the world to the next matchday with live progress.
  await openCareerPage(page, 'Hub');
  await expect(
    page.locator('[data-tour="player-card"]').getByRole('link', { name: /attribute points?/ }),
  ).toContainText(String(before - 1));
  // The player may already have a second fixture this week.
  if (!(await play.isVisible()))
    await page.getByRole('button', { name: 'Continue to next matchday', exact: true }).click();
  await expect(play).toBeVisible({ timeout: 120000 });

  // The career autosaved to slot 1 throughout; the save card shows it, and a refresh of the
  // hub restores it.
  await expect(page.locator('.save-indicator')).toContainText('All changes saved', {
    timeout: 60000,
  });
  await page.getByRole('navigation').first().getByRole('link', { name: 'Saved games' }).click();
  await expect(page.locator('.slot-card').first()).toContainText('Robin Vale · Level');
  await page.getByRole('link', { name: /Continue as Robin Vale/ }).click();
  await expect(page).toHaveURL(/\/career\?save=1/);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Robin Vale' })).toBeVisible({ timeout: 60000 });
  await expect(page.getByRole('heading', { name: 'Career hub', exact: true })).toBeVisible();
  // The training change and the raised attribute survived the save.
  await openCareerPage(page, 'Training');
  await expect(page.locator('#focus-0')).toHaveValue('finishing');
  if (browserName === 'chromium') {
    // Visual record: dark theme at phone width for every career page (motion reduced so
    // captures are not taken mid page-transition).
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
    for (const [name, label] of [
      ['training', 'Training'],
      ['skills', 'Skills'],
      ['profile', 'Profile'],
      ['hub', 'Hub'],
    ] as const) {
      await openCareerPage(page, label);
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
      await page.screenshot({ path: `artifacts/career-${name}-mobile-dark.png`, fullPage: true });
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth + 1,
      );
      expect(overflow, `${name} overflows horizontally`).toBe(false);
    }
  }
});

/** A legacy-world career waiting at its first matchday, as an exported save file. */
function matchdaySave(seed: string, name: string, slot: SlotId): string {
  const base = generateWorld(seed, { format: 'legacy' });
  const trial = trialOffers(base, 'country:0', seed)[0]!;
  const world = createCareer(
    base,
    {
      name,
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
  while (!advanceCareerWeek(world, { inPlace: true }).pendingFixtureId);
  return JSON.stringify(
    createSave(slot, name, {
      kind: 'world',
      world,
      gallery: { seed, generation: 0 },
      settings: DEFAULT_SETTINGS,
    }),
  );
}

test('a finished match report never follows the player into another save', async ({
  page,
  browserName,
}) => {
  test.setTimeout(300000);
  await page.goto('/saves');
  for (const [index, name] of ['Robin Vale', 'Sam Okafor'].entries()) {
    const slot = (index + 1) as SlotId;
    await page
      .locator('.slot-card')
      .nth(index)
      .getByLabel(`Import backup — Slot ${slot}`)
      .setInputFiles({
        name: `career-${slot}.json`,
        mimeType: 'application/json',
        buffer: Buffer.from(matchdaySave(`report-${slot}`, name, slot)),
      });
    await expect(page.locator('.slot-card').nth(index).getByRole('heading')).toHaveText(name);
  }

  // Finish slot 1's match: its report is shown from memory.
  await page.goto('/match?save=1');
  await playMatch(page);
  await expect(page.getByTestId('career-xp')).toBeVisible({ timeout: 60000 });
  // The recorded report shows the finalized result.
  await expect(page.getByTestId('final-result')).toContainText('Final result');
  if (browserName === 'chromium') {
    await mkdir('artifacts', { recursive: true });
    await page.screenshot({ path: 'artifacts/career-report.png', fullPage: true });
  }

  // Load slot 2 in the same session; Matchday shows slot 2's own fixture, not that report.
  const shell = page.getByRole('navigation').first();
  await shell.getByRole('link', { name: 'Saved games' }).click();
  await page.locator('.slot-card').nth(1).getByRole('button', { name: 'Continue career' }).click();
  await expect(page.locator('.notice')).toHaveText('Save loaded.');
  await expect(page.locator('.slot-card').nth(1)).toContainText('Sam Okafor');
  await shell.getByRole('link', { name: 'Matchday' }).click();
  await expect(
    page.getByRole('button', { name: 'Go to the pre-match briefing', exact: true }),
  ).toBeVisible({ timeout: 30000 });
  await expect(page.getByTestId('career-xp')).toHaveCount(0);
});
