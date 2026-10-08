import { expect, test, type Page } from '@playwright/test';
import { isAbortedLoad, isBrowserNoise } from './support';
import { generateWorld } from '../src/engine/world/generate';
import { createCareer, trialOffers } from '../src/engine/career/create';
import { createSave, DEFAULT_SETTINGS } from '../src/persistence/schema';

// No skipTutorial here: these journeys are about the tutorial.
test.beforeEach(async ({ page }) => {
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

let cached: string | undefined;
function freshCareer(): string {
  if (cached) return cached;
  const base = generateWorld('onboarding-browser', { format: 'legacy' });
  const trial = trialOffers(base, 'country:0', 'onboarding-browser')[0]!;
  const world = createCareer(
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
    'onboarding-browser',
  );
  cached = JSON.stringify(
    createSave(1, 'First week', {
      kind: 'world',
      world,
      gallery: { seed: 'onboarding', generation: 0 },
      settings: DEFAULT_SETTINGS,
    }),
  );
  return cached;
}
async function importCareer(page: Page) {
  await page.goto('/saves');
  await page
    .locator('.slot-card')
    .nth(0)
    .getByLabel('Import backup — Slot 1')
    .setInputFiles({
      name: 'career.json',
      mimeType: 'application/json',
      buffer: Buffer.from(freshCareer()),
    });
  await expect(page.locator('.slot-card').nth(0).getByRole('heading')).toHaveText('First week');
}
const tutorialSeen = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('ptg-preferences') ?? '{}').tutorial);

test('guides the first week and the first match, and replays from Settings', async ({ page }) => {
  test.setTimeout(240000);
  await importCareer(page);
  await page.goto('/career?save=1');
  const tour = page.getByRole('dialog', { name: 'Your first fixture' });
  await expect(tour).toBeVisible();
  await expect(tour).toContainText('Step 1 of 7');
  await expect(page.getByRole('heading', { name: 'Your first fixture' })).toBeFocused();
  await expect(page.locator('[data-tour="next-match"]')).toHaveAttribute('data-tour-active', '');
  await page.getByTestId('tutorial').getByRole('button', { name: 'Next' }).click();
  await expect(page.getByTestId('tutorial')).toContainText('What needs you');
  await expect(page.locator('[data-tour="priorities"]')).toHaveAttribute('data-tour-active', '');
  await page.getByTestId('tutorial').getByRole('button', { name: 'Back' }).click();
  await expect(page.getByTestId('tutorial')).toContainText('Your first fixture');
  // Escape skips the tour without leaving the page.
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('tutorial')).toHaveCount(0);
  await expect(page).toHaveURL(/\/career\?/);
  expect(await tutorialSeen(page)).toEqual({ week: true, match: false });
  await expect(page.locator('[data-tour-active]')).toHaveCount(0);

  // Settings brings it back; the week tour then runs to the end.
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Show the tutorial again' }).click();
  await expect(page.getByText('The tutorial will show again.')).toBeVisible();
  await page.goto('/career?save=1');
  for (const title of [
    'What needs you',
    'Your footballer',
    'Training',
    'Everything else',
    'Messages',
    'Ready for your debut?',
  ]) {
    await page.getByTestId('tutorial').getByRole('button', { name: 'Next' }).click();
    await expect(page.getByTestId('tutorial')).toContainText(title);
  }
  await page.getByTestId('tutorial').getByRole('button', { name: 'Got it' }).click();
  await expect(page.getByTestId('tutorial')).toHaveCount(0);

  // The first match: tactics, kick-off (an action), controls, a key moment chosen with a key.
  await page.locator('[data-tour="continue"]').click();
  await page.getByRole('button', { name: /pre-match briefing/ }).click();
  await expect(page.getByTestId('tutorial')).toContainText('Before kick-off');
  await page.getByTestId('tutorial').getByRole('button', { name: 'Next' }).click();
  await expect(page.getByTestId('tutorial')).toContainText('Do this to continue.');
  await page.locator('[data-tour="kickoff"]').click();
  await expect(page.getByTestId('tutorial')).toContainText('Controlling the match');
  await page.getByTestId('tutorial').getByRole('button', { name: 'Next' }).click();
  await expect(page.getByTestId('tutorial')).toContainText('Follow the game');
  await page
    .locator('[data-tour="controls"]')
    .getByRole('button', { name: /Next key moment/i })
    .click();
  await expect(page.getByTestId('tutorial')).toContainText('A key moment');
  await page.locator('[data-tour="decision"] button[data-choice]').first().focus();
  await page.keyboard.press('1');
  await expect(page.getByTestId('tutorial')).toContainText('Every result is explained');
  await page.getByTestId('tutorial').getByRole('button', { name: 'Got it' }).click();
  await expect(page.getByTestId('tutorial')).toHaveCount(0);
  expect(await tutorialSeen(page)).toEqual({ week: true, match: true });
});

test('sound settings mute, set volumes and preview procedural sounds', async ({ page }) => {
  await page.goto('/settings');
  const master = page.getByLabel('Master volume');
  await expect(master).toHaveValue('80');
  await master.focus();
  await page.keyboard.press('ArrowLeft');
  await expect(master).toHaveValue('75');
  await expect(page.getByText('75%')).toBeVisible();
  await page.getByRole('button', { name: 'Whistle' }).click();
  // Howler and the synthesiser load after the first interaction, as their own chunk.
  await expect
    .poll(() => page.evaluate(() => Boolean((window as unknown as { Howler?: unknown }).Howler)))
    .toBe(true);
  await page.getByRole('switch', { name: 'Mute all sound' }).check();
  await expect(page.getByLabel('Crowd')).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Goal roar' })).toBeDisabled();
  await page.reload();
  await expect(page.getByRole('switch', { name: 'Mute all sound' })).toBeChecked();
  const stored = await page.evaluate(
    () => JSON.parse(localStorage.getItem('ptg-preferences') ?? '{}').audio,
  );
  expect(stored).toEqual({ muted: true, master: 0.75, effects: 0.8, crowd: 0.6 });
});
