import type { Page } from '@playwright/test';
import { backupFile, expect, nationalCareer, skipTutorial, test } from './support';
import { readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { advanceCareerWeek } from '../src/engine/career/season';
import { levelStart, xpToNext } from '../src/engine/career/progression';
import { createSave, DEFAULT_SETTINGS } from '../src/persistence/schema';

/**
 * The match report (release 1.0, step 5.1): one stable layout from full time to the recorded
 * result, the score, rating and XP on the first screen, a sticky next action, no sideways
 * scroll on phones, every key moment in the recap, and the level-up as a keyboard-operable
 * moment.
 */
test.beforeEach(async ({ page }) => {
  await skipTutorial(page);
});
test.use({ actionTimeout: 15000 });

/** A career at its first matchday; `nearLevel` leaves it one XP short of the next level. */
function matchdaySave(seed: string, nearLevel: boolean) {
  const world = nationalCareer(seed);
  while (!advanceCareerWeek(world, { inPlace: true }).pendingFixtureId);
  const career = world.career!;
  if (nearLevel) career.xp = levelStart(career) + xpToNext(career.level) - 1;
  return backupFile(
    seed,
    JSON.stringify(
      createSave(1, 'Report career', {
        kind: 'world',
        world,
        gallery: { seed, generation: 0 },
        settings: DEFAULT_SETTINGS,
      }),
    ),
  );
}

const state = (page: Page) => page.getByTestId('match-state');

const axeSource = readFileSync('node_modules/axe-core/axe.min.js', 'utf8');
/** Serious and critical WCAG 2.1 AA violations on the page (as e2e/accessibility.spec.ts). */
async function violations(page: Page): Promise<string[]> {
  await page.evaluate(axeSource);
  return page.evaluate(async () => {
    const axe = (
      window as unknown as {
        axe: {
          run: (
            context: unknown,
            options: unknown,
          ) => Promise<{ violations: { id: string; impact: string; nodes: { html: string }[] }[] }>;
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
          `${violation.id}: ${violation.nodes.map((n) => n.html.slice(0, 100)).join(', ')}`,
      );
  });
}

async function importAndBrief(page: Page, seed: string, nearLevel = false) {
  await page.goto('/saves');
  await page
    .locator('.slot-card')
    .first()
    .getByLabel('Import backup — Slot 1')
    .setInputFiles(matchdaySave(seed, nearLevel));
  await expect(page.locator('.notice')).toHaveText('Save imported.', { timeout: 60000 });
  await page.goto('/match?save=1');
  await page.getByRole('button', { name: 'Go to the pre-match briefing', exact: true }).click();
  await expect(state(page)).toHaveAttribute('data-status', 'preview');
}

/** Play to full time with skip and number keys; returns the key moments answered. */
async function playToFullTime(page: Page): Promise<number> {
  await page.getByRole('button', { name: 'Kick off', exact: true }).click();
  let decisions = 0;
  for (let turns = 0; turns < 150; turns++) {
    const status = await state(page).getAttribute('data-status');
    if (status === 'finished') return decisions;
    if (status === 'decision') {
      await expect(page.locator('.match-choices button').first()).toBeFocused();
      await page.keyboard.press('1');
      await expect(state(page)).not.toHaveAttribute('data-status', 'decision');
      decisions++;
    } else if (status === 'halftime')
      await page.getByRole('button', { name: /Motivate the team|Lift the side/ }).click();
    else if (await page.getByRole('button', { name: /Accept the change/ }).isVisible())
      await page.getByRole('button', { name: /Accept the change/ }).click();
    else if (await page.getByRole('button', { name: /Keep the team composed/ }).isVisible())
      await page.getByRole('button', { name: /Keep the team composed/ }).click();
    // A knock (match-22): play on.
    else if (await page.getByRole('button', { name: /^Play on/ }).isVisible())
      await page.getByRole('button', { name: /^Play on/ }).click();
    else {
      const pause = page.getByRole('button', { name: 'Pause', exact: true });
      if (await pause.isVisible()) await pause.click();
      await page
        .getByRole('button', { name: 'Next key moment', exact: true })
        .click({ timeout: 3000 })
        .catch(() => {});
    }
  }
  throw new Error('The match did not reach full time');
}

/** Where the report's landmarks sit on the page (document coordinates). */
function landmarks(page: Page) {
  return page.evaluate(() =>
    Object.fromEntries(
      [
        '[data-testid="final-result"]',
        '.match-rewards .is-rating',
        '.match-rewards .is-xp',
        '.match-report-level',
        '.match-report-status',
        '[data-testid="moments-recap"]',
        '.match-report-maps',
      ].map((selector) => {
        const box = document.querySelector(selector)?.getBoundingClientRect();
        return [
          selector,
          box
            ? [
                Math.round(box.left + window.scrollX),
                Math.round(box.top + window.scrollY),
                Math.round(box.width),
                Math.round(box.height),
              ]
            : null,
        ];
      }),
    ),
  );
}

/** Score, rating, XP and the sticky next action are all in the window, unscrolled. */
async function firstScreen(page: Page) {
  await page.evaluate(() => window.scrollTo(0, 0));
  const inView = await page.evaluate(() => {
    const visible = (selector: string) => {
      const box = document.querySelector(selector)!.getBoundingClientRect();
      return box.top >= 0 && box.bottom <= window.innerHeight && box.width > 0;
    };
    return {
      score: visible('[data-testid="final-result"]'),
      rating: visible('.match-rewards .is-rating'),
      xp: visible('.match-rewards .is-xp'),
      action: visible('.match-whats-next'),
    };
  });
  expect(inView).toEqual({ score: true, rating: true, xp: true, action: true });
  // The sticky bar covers nothing it must not: the XP sits above it.
  const [xp, bar] = await Promise.all([
    page.locator('.match-rewards .is-xp').boundingBox(),
    page.locator('.match-whats-next').boundingBox(),
  ]);
  expect(xp!.y + xp!.height).toBeLessThanOrEqual(bar!.y);
}

async function noSidewaysScroll(page: Page, width: number) {
  await page.setViewportSize({ width, height: 844 });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth))
    .toBeLessThanOrEqual(0);
}

test('the report keeps one layout, leads with the result and recaps every moment', async ({
  page,
  browserName,
}) => {
  test.setTimeout(300000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await importAndBrief(page, 'report-layout');
  const decisions = await playToFullTime(page);
  const report = page.getByTestId('match-report');
  await expect(report).toBeVisible();
  // Taken as soon as the report shows (usually before the result is recorded) and again once
  // the XP is confirmed and a second has passed: nothing moves.
  const before = await landmarks(page);
  await expect(page.getByTestId('career-xp')).toContainText('XP earned', { timeout: 60000 });
  await page.waitForTimeout(1000);
  expect(await landmarks(page)).toEqual(before);
  // One heading: the page title gives way to the report's.
  expect(
    await page
      .locator('.match-heading')
      .evaluate((element) => element.getBoundingClientRect().width),
  ).toBeLessThanOrEqual(1);
  await expect(page.getByRole('heading', { name: 'Your match report', exact: true })).toBeVisible();

  await firstScreen(page);
  const next = page.getByRole('button', { name: /Continue to next matchday|Your next fixture/ });
  await expect(next).toBeVisible();
  // The bar stays in view however far the report scrolls.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
  await expect(next).toBeInViewport();

  // Every key moment answered, in order, with the choice made and its chance.
  const recap = page.getByTestId('moment-recap');
  await expect(recap).toHaveCount(decisions);
  if (decisions > 0) {
    await expect(page.getByTestId('moments-summary')).toHaveText(
      new RegExp(`best-value option in \\d+ of ${decisions} moments?\\.$`),
    );
    await expect(recap.first()).toContainText(/You chose .+ · \d+% to /);
    await recap.first().getByText('Why it went this way').click();
    await expect(recap.first().locator('.match-factor-total')).toBeVisible();
  }
  // The story: team statistics side by side.
  // Four rows, and a fifth for the woodwork when a shot hit it (step 5.3).
  await expect(page.getByTestId('team-stats').locator('li').nth(3)).toBeVisible();
  expect(await page.getByTestId('team-stats').locator('li').count()).toBeLessThanOrEqual(5);
  // The touchline lines stay the same after a refresh of the report.
  const quotes = await page.getByTestId('manager-reaction').locator('blockquote').textContent();
  // The maps open on demand.
  await page.locator('.match-report-maps > summary').click();
  await expect(page.getByRole('img', { name: /^Movement heatmap:/ })).toBeVisible();
  if (browserName === 'chromium') {
    await mkdir('artifacts', { recursive: true });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: 'artifacts/report-desktop.png' });
    // The whole report, its maps and a decision's factors open, passes axe in both themes.
    for (const colorScheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
      expect(await violations(page), colorScheme).toEqual([]);
    }
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'no-preference' });
  }

  // Phones: the first screen and no sideways scroll.
  await page.setViewportSize({ width: 390, height: 844 });
  await firstScreen(page);
  await noSidewaysScroll(page, 390);
  await noSidewaysScroll(page, 360);
  if (browserName === 'chromium') await page.screenshot({ path: 'artifacts/report-phone.png' });
  expect(await page.getByTestId('manager-reaction').locator('blockquote').textContent()).toBe(
    quotes,
  );
});

test('a level-up is a moment of its own, shown once and keyboard-operable', async ({
  page,
  browserName,
}) => {
  test.setTimeout(300000);
  await page.setViewportSize({ width: 390, height: 844 });
  await importAndBrief(page, 'report-level', true);
  await playToFullTime(page);
  const report = page.getByTestId('match-report');
  await expect(report).toBeVisible();
  const before = await landmarks(page);
  const moment = page.getByTestId('level-up');
  await expect(moment).toBeVisible({ timeout: 60000 });
  await expect(moment).toContainText('Level up!');
  await expect(moment).toContainText('You reached level 2.');
  await expect(moment).toContainText('+5 attribute points to spend');
  // The report behind it did not move.
  expect(await landmarks(page)).toEqual(before);
  // Focus starts on the way to spend the points and stays inside the moment.
  const spend = moment.getByRole('link', { name: 'Spend points' });
  await expect(spend).toBeFocused();
  for (let press = 0; press < 4; press++) {
    await page.keyboard.press('Tab');
    expect(await moment.evaluate((dialog) => dialog.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press('Shift+Tab');
  expect(await moment.evaluate((dialog) => dialog.contains(document.activeElement))).toBe(true);
  await expect(moment.locator('.match-level-up-badge')).toHaveText('2');
  if (browserName === 'chromium') {
    expect(await violations(page)).toEqual([]);
    await mkdir('artifacts', { recursive: true });
    // The card's spring runs on animation frames, which `settled` cannot see: let it land.
    await page.waitForTimeout(1200);
    await page.screenshot({ path: 'artifacts/report-level-up.png' });
  }
  // Escape closes it; the report and its next action are there underneath.
  await page.keyboard.press('Escape');
  await expect(moment).toHaveCount(0);
  await expect(page).toHaveURL(/\/match/);
  await firstScreen(page);
  // The points wait beside the level; spending them and coming back never repeats the moment.
  await page.locator('.match-report-points').click();
  await expect(page).toHaveURL(/\/career\/profile/);
  // Back once the profile has settled its address (it adds the save to the URL).
  await expect(page.getByRole('heading', { name: 'Player profile', level: 1 })).toBeVisible();
  await expect(page).toHaveURL(/\/career\/profile\?save=1/);
  await page.goBack();
  await expect(report).toBeVisible();
  await expect(page.getByTestId('career-xp')).toContainText('XP earned');
  await page.waitForTimeout(500);
  await expect(moment).toHaveCount(0);
});
