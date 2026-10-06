import { expect, test, type Page } from '@playwright/test';
import { skipTutorial } from './support';
import { readFileSync } from 'node:fs';
import { generateWorld } from '../src/engine/world/generate';
import { createCareer, trialOffers } from '../src/engine/career/create';
import { advanceCareerWeek } from '../src/engine/career/season';
import { openPress, rivalOf } from '../src/engine/career/social';
import { createRng } from '../src/engine/rng';
import { createSave, DEFAULT_SETTINGS } from '../src/persistence/schema';
import type { World } from '../src/model/domain';

test.beforeEach(async ({ page }) => {
  await skipTutorial(page);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (entry) => {
    if (entry.type() === 'error') errors.push(entry.text());
  });
  (page as Page & { errors: string[] }).errors = errors;
});
test.afterEach(async ({ page }) => {
  expect((page as Page & { errors: string[] }).errors).toEqual([]);
});
test.use({ actionTimeout: 15000 });

const axeSource = readFileSync('node_modules/axe-core/axe.min.js', 'utf8');
async function accessibilityViolations(page: Page): Promise<string[]> {
  await page.addScriptTag({ content: axeSource });
  return page.evaluate(async () => {
    const axe = (
      window as unknown as {
        axe: {
          run: (
            context: unknown,
            options: unknown,
          ) => Promise<{
            violations: { id: string; impact: string; nodes: { target: string[] }[] }[];
          }>;
        };
      }
    ).axe;
    const result = await axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] },
    });
    return result.violations
      .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
      .map(
        (violation) =>
          `${violation.id}: ${violation.nodes.map((n) => n.target.join(' ')).join(', ')}`,
      );
  });
}

/** A career a few weeks in, built with the real engine, with a rival question waiting. */
function socialSave(): { json: string; rival: string } {
  const base = generateWorld('social-browser', { format: 'legacy' });
  const trial = trialOffers(base, 'country:0', 'social-browser')[0]!;
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
    'social-browser',
  );
  for (let week = 0; week < 6; week++)
    world = advanceCareerWeek(world, { inPlace: true, autoPlay: true }).world;
  // Answer anything the simulation opened, then ask about the rival.
  for (const item of world.media)
    if (item.choices.length && item.answer === null) item.answer = 'silence';
  const rival = rivalOf(world)!.name;
  openPress(world, createRng('social-browser-press'), 'rival', { rival });
  const save = createSave(1, 'Social career', {
    kind: 'world',
    world,
    gallery: { seed: 'social-browser', generation: 0 },
    settings: DEFAULT_SETTINGS,
  });
  return { json: JSON.stringify(save), rival };
}

test('answers the press, reads club life and compares with the rival', async ({
  page,
  browserName,
}) => {
  test.setTimeout(180000);
  const { json, rival } = socialSave();
  await page.goto('/saves');
  await page
    .locator('.slot-card')
    .nth(0)
    .getByLabel('Import backup — Slot 1')
    .setInputFiles({
      name: 'social.json',
      mimeType: 'application/json',
      buffer: Buffer.from(json),
    });
  await expect(page.locator('.slot-card').nth(0).getByRole('heading')).toHaveText('Social career');

  // The hub's press room leads to the waiting question.
  await page.goto('/career?save=1');
  const press = page.getByRole('region', { name: 'Press room' });
  await expect(
    press.getByText(`Everyone is comparing you with ${rival}. Who is better?`),
  ).toBeVisible();
  await press.getByRole('link', { name: 'Answer now' }).click();
  await expect(page).toHaveURL(/\/career\/media/);

  // Each answer shows its effects; the number key 2 picks the provocative one.
  const question = page.getByRole('article', { name: /Who is better\?/ });
  await expect(question.getByRole('list', { name: 'What it changes' }).first()).toBeVisible();
  await expect(question.getByText('Rivalry +8')).toBeVisible();
  await page.keyboard.press('2');
  await expect(page.getByText('You answered: Honestly? It is not even close.')).toBeVisible();
  await expect(page.getByText('No questions right now', { exact: false })).toBeVisible();

  // The feed filters by author through the URL; the rival has replied.
  await page.getByRole('button', { name: 'Rival', exact: true }).click();
  await expect(page).toHaveURL(/feed=rival/);
  await expect(page.getByText(/I prefer to let my football speak/)).toBeVisible();
  await page.getByRole('button', { name: 'Headlines', exact: true }).click();
  await expect(
    page.getByRole('region', { name: 'Feed' }).getByRole('listitem').first(),
  ).toBeVisible();

  // Club life: morale history, its breakdown, the groups and culture fit.
  const nav = page.getByRole('navigation', { name: 'Career sections' });
  await nav.getByRole('link', { name: 'Club life', exact: true }).click();
  await expect(page.getByRole('img', { name: /Morale and form, week by week/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: /This week’s target/ })).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Dressing room' }).getByText('Your group'),
  ).toBeVisible();
  await expect(page.getByRole('meter', { name: 'Culture fit' })).toBeVisible();
  await page.getByText('Morale and form by week').click();
  await expect(page.getByRole('region', { name: 'Morale and form by week' })).toBeVisible();

  // The rival page compares the two careers and tells the story so far.
  await nav.getByRole('link', { name: 'Rival', exact: true }).click();
  await expect(page.getByRole('img', { name: `Portrait of ${rival}` })).toBeVisible();
  await expect(page.getByRole('meter', { name: 'Rivalry intensity' })).toHaveAttribute(
    'aria-valuenow',
    '38',
  );
  await expect(page.getByRole('row', { name: /Goals this season/ })).toBeVisible();

  // The answer was autosaved and survives a refresh.
  await expect(page.getByText('All changes saved').first()).toBeVisible({ timeout: 30000 });
  await page.reload();
  await expect(page.getByRole('meter', { name: 'Rivalry intensity' })).toHaveAttribute(
    'aria-valuenow',
    '38',
    {
      timeout: 30000,
    },
  );

  if (browserName === 'chromium') {
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      for (const path of ['/career/club', '/career/media', '/career/rival', '/career']) {
        await page.goto(`${path}?save=1`);
        await expect(nav).toBeVisible();
        expect(await accessibilityViolations(page), `${scheme} ${path}`).toEqual([]);
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    for (const path of ['/career/club', '/career/media', '/career/rival', '/career']) {
      await page.goto(`${path}?save=1`);
      await expect(nav).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, path).toBeLessThanOrEqual(0);
    }
  }
});
