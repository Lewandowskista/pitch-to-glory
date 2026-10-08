import { expect, test, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { generateWorld } from '../src/engine/world/generate';
import { createCareer, trialOffers } from '../src/engine/career/create';
import { advanceCareerWeek } from '../src/engine/career/season';
import { createSave, DEFAULT_SETTINGS } from '../src/persistence/schema';
import {
  careerTabs,
  groupLinkName,
  isAbortedLoad,
  isBrowserNoise,
  openCareerPage,
  skipTutorial,
  tabName,
} from './support';

/**
 * Career navigation (Phase 3.1): five groups, page tabs that never move, a five-slot phone bar
 * with a URL-backed More sheet, and every earlier route still reachable.
 */
const GROUPS: [string, string[]][] = [
  ['Overview', ['Hub', 'Calendar', 'Inbox']],
  ['Player', ['Profile', 'Skills', 'Training', 'National team']],
  ['Club', ['Club life', 'Transfers', 'Agent']],
  ['Life', ['Media', 'Rival', 'Lifestyle', 'Wardrobe']],
  ['History', ['Trophies', 'Chronicle', 'Moments', 'Legacy']],
];
const ROUTES = [
  '/career',
  '/career/calendar',
  '/career/inbox',
  '/career/profile',
  '/career/skills',
  '/career/training',
  '/career/national',
  '/career/club',
  '/career/transfers',
  '/career/agent',
  '/career/media',
  '/career/rival',
  '/career/lifestyle',
  '/career/wardrobe',
  '/career/trophies',
  '/career/chronicle',
  '/career/moments',
  '/career/legacy',
];

const saves = new Map<number, string>();
test.beforeAll(async ({ browserName }, workerInfo) => {
  const base = generateWorld('navigation', { format: 'legacy' });
  const trial = trialOffers(base, 'country:0', 'navigation')[0]!;
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
    'navigation',
  );
  for (let week = 0; week < 4; week++) advanceCareerWeek(world, { inPlace: true, autoPlay: true });
  await mkdir('artifacts', { recursive: true });
  for (const fontScale of [1, 1.3]) {
    const path = `artifacts/navigation-${fontScale}-${browserName}-${workerInfo.workerIndex}.json`;
    await writeFile(
      path,
      JSON.stringify(
        createSave(1, 'Navigation', {
          kind: 'world',
          world,
          gallery: { seed: 'navigation', generation: 0 },
          settings: { ...DEFAULT_SETTINGS, fontScale },
        }),
      ),
    );
    saves.set(fontScale, path);
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

async function importCareer(page: Page, fontScale = 1) {
  await page.goto('/saves');
  await page
    .locator('.slot-card')
    .nth(0)
    .getByLabel('Import backup — Slot 1')
    .setInputFiles(saves.get(fontScale)!);
  await expect(page.locator('.notice')).toHaveText('Collection imported.', { timeout: 30000 });
}
const tabsTop = (page: Page) =>
  careerTabs(page).evaluate((nav) => nav.getBoundingClientRect().top + window.scrollY);

test('the page tabs never move between career pages, and every page is reachable', async ({
  page,
}) => {
  test.setTimeout(180000);
  await importCareer(page);
  await page.goto('/career?save=1');
  await expect(careerTabs(page, 'Overview')).toBeVisible();
  const top = await tabsTop(page);
  for (const [group, pages] of GROUPS) {
    // The sidebar opens each group at its first page.
    await page
      .getByRole('navigation', { name: 'Main navigation' })
      .first()
      .getByRole('link', { name: groupLinkName(group) })
      .click();
    const tabs = careerTabs(page, group);
    await expect(tabs.getByRole('link')).toHaveCount(pages.length);
    await expect(tabs.getByRole('link', { name: tabName(pages[0]!) })).toHaveAttribute(
      'aria-current',
      'page',
    );
    for (const name of pages) {
      await openCareerPage(page, name);
      await expect(tabs.getByRole('link', { name: tabName(name) })).toHaveAttribute(
        'aria-current',
        'page',
      );
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      expect(await tabsTop(page), name).toBe(top);
    }
  }
  // Browser history follows the tabs.
  await page.goBack();
  await expect(
    careerTabs(page, 'History').getByRole('link', { name: 'Legacy' }),
  ).not.toHaveAttribute('aria-current', 'page');
});

test('every earlier career route still opens directly, with its group and tab', async ({
  page,
}) => {
  test.setTimeout(180000);
  await importCareer(page);
  for (const route of ROUTES) {
    await page.goto(`${route}?save=1`);
    // The tabs show while the save restores; wait for the career itself before moving on.
    await expect(page.getByText('Restoring your career…')).toHaveCount(0, { timeout: 30000 });
    await expect(careerTabs(page).getByRole('link', { name: /./ }).first()).toBeVisible();
    await expect(careerTabs(page).locator('[aria-current="page"]')).toHaveCount(1);
    await expect(page).toHaveURL(new RegExp(`${route}\\?save=1`));
    // The save system finishes loading in the background; leaving mid-download makes
    // WebKit report the cancelled worker script as an error.
    await page.waitForLoadState('networkidle');
  }
});

for (const fontScale of [1, 1.3])
  test(`a phone has five destinations and a More sheet that Back closes · text ${fontScale * 100}%`, async ({
    page,
  }) => {
    test.setTimeout(180000);
    await page.setViewportSize({ width: 360, height: 740 });
    await importCareer(page, fontScale);
    await page.goto('/career/skills?save=1');
    const bar = page.locator('.bottom-nav');
    await expect(bar.locator('a, button')).toHaveCount(5);
    await expect(bar.getByRole('link', { name: groupLinkName('Player') })).toHaveAttribute(
      'aria-current',
      'page',
    );
    // Nothing scrolls sideways: not the page, the bar or the tabs.
    for (const selector of ['html', '.bottom-nav', '.career-tabs ul'])
      expect(
        await page
          .locator(selector)
          .first()
          .evaluate((element) => element.scrollWidth - element.clientWidth),
        selector,
      ).toBeLessThanOrEqual(1);
    // Every bar label fits its slot.
    for (const label of await bar.locator('a > span:last-child, button > span:last-child').all())
      expect(
        await label.evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
      ).toBe(true);

    // More lives in the URL: Back closes it.
    await bar.getByRole('button', { name: 'More' }).click();
    const sheet = page.getByRole('dialog', { name: 'More' });
    await expect(sheet).toBeVisible();
    await expect(page).toHaveURL(/more=1/);
    await page.goBack();
    await expect(sheet).toHaveCount(0);
    await expect(page).toHaveURL(/\/career\/skills\?save=1$/);
    // Escape closes it too.
    await bar.getByRole('button', { name: 'More' }).click();
    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);
    await expect(page).toHaveURL(/\/career\/skills/);
    // A destination replaces the sheet's entry: Back returns to where it was opened.
    await bar.getByRole('button', { name: 'More' }).click();
    await sheet.getByRole('link', { name: 'Trophies' }).click();
    await expect(page).toHaveURL(/\/career\/trophies/);
    await expect(bar.getByRole('button', { name: 'More' })).toHaveClass(/active/);
    await page.goBack();
    await expect(page).toHaveURL(/\/career\/skills/);
    await expect(sheet).toHaveCount(0);
    // The Club group from the bar, then a tab.
    await bar.getByRole('link', { name: groupLinkName('Club') }).click();
    await careerTabs(page, 'Club').getByRole('link', { name: 'Agent' }).click();
    await expect(page).toHaveURL(/\/career\/agent/);
  });

test('without a career a phone shows the main places and More holds the utilities', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const bar = page.locator('.bottom-nav');
  await expect(bar.locator('a, button')).toHaveCount(5);
  for (const name of ['Club', 'Career', 'Match', 'World'])
    await expect(bar.getByRole('link', { name, exact: true })).toBeVisible();
  await bar.getByRole('button', { name: 'More' }).click();
  const sheet = page.getByRole('dialog', { name: 'More' });
  for (const name of ['Edit mode', 'Asset gallery', 'Save collections', 'Settings'])
    await expect(sheet.getByRole('link', { name })).toBeVisible();
  await sheet.getByRole('link', { name: 'Settings' }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
});
