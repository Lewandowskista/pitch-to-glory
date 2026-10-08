import { expect, test, type Page } from '@playwright/test';
import { isBrowserNoise, skipTutorial } from './support';
import { readFileSync } from 'node:fs';
import { generateWorld } from '../src/engine/world/generate';
import { createCareer, trialOffers } from '../src/engine/career/create';
import { advanceCareerWeek } from '../src/engine/career/season';
import { createSave, DEFAULT_SETTINGS } from '../src/persistence/schema';
import type { World } from '../src/model/domain';

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
test.use({ actionTimeout: 15000 });

const axeSource = readFileSync('node_modules/axe-core/axe.min.js', 'utf8');
async function accessibilityViolations(page: Page): Promise<string[]> {
  // Evaluated rather than injected as a script tag, which the page's CSP blocks.
  await page.evaluate(axeSource);
  return page.evaluate(async () => {
    const axe = (
      window as unknown as {
        axe: {
          run: (
            context: unknown,
            options: unknown,
          ) => Promise<{
            violations: {
              id: string;
              impact: string;
              nodes: { target: string[]; html: string }[];
            }[];
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
          `${violation.id}: ${violation.nodes.map((n) => `${n.target.join(' ')} ${n.html.slice(0, 120)}`).join(', ')}`,
      );
  });
}

/** A career eight weeks in: inbox, media, form, training and market all have content. */
let cached: string | undefined;
function careerSave(): string {
  if (cached) return cached;
  const base = generateWorld('a11y-browser', { format: 'legacy' });
  const trial = trialOffers(base, 'country:0', 'a11y-browser')[0]!;
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
    'a11y-browser',
  );
  for (let week = 0; week < 8; week++)
    world = advanceCareerWeek(world, { inPlace: true, autoPlay: true }).world;
  cached = JSON.stringify(
    createSave(1, 'Sweep career', {
      kind: 'world',
      world,
      gallery: { seed: 'a11y', generation: 0 },
      settings: DEFAULT_SETTINGS,
    }),
  );
  return cached;
}

const ROUTES = [
  '/',
  '/gallery',
  '/saves',
  '/settings',
  '/world?save=1',
  '/edit?save=1',
  '/match?save=1',
  '/career/new',
  '/career?save=1',
  '/career/calendar?save=1',
  '/career/inbox?save=1',
  '/career/profile?save=1',
  '/career/skills?save=1',
  '/career/training?save=1',
  '/career/club?save=1',
  '/career/transfers?save=1',
  '/career/agent?save=1',
  '/career/rival?save=1',
  '/career/media?save=1',
  '/career/lifestyle?save=1',
  '/career/wardrobe?save=1',
  '/career/national?save=1',
  '/career/trophies?save=1',
  '/career/chronicle?save=1',
  '/career/moments?save=1',
  '/career/legacy?save=1',
  '/moment',
];

test('every screen passes axe in both themes and fits a phone', async ({ page, browserName }) => {
  test.setTimeout(420000);
  await page.goto('/saves');
  await page
    .locator('.slot-card')
    .nth(0)
    .getByLabel('Import backup — Slot 1')
    .setInputFiles({
      name: 'sweep.json',
      mimeType: 'application/json',
      buffer: Buffer.from(careerSave()),
    });
  await expect(page.locator('.slot-card').nth(0).getByRole('heading')).toHaveText('Sweep career');
  const open = async (route: string) => {
    await page.goto(route);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 30000 });
    await expect(page.getByText(/Loading/)).toHaveCount(0, { timeout: 30000 });
    // Let slot listings and other first-load states settle, and keep the pointer off controls.
    await page.waitForLoadState('networkidle');
    await page.mouse.move(0, 0);
    await page.waitForTimeout(250);
  };
  if (browserName !== 'chromium') {
    // The other engines render every screen without errors (checked after each test).
    for (const route of ROUTES) await open(route);
    return;
  }
  // Collect every violation first, so one run reports them all.
  const failures: string[] = [];
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    for (const route of ROUTES) {
      await open(route);
      for (const violation of await accessibilityViolations(page))
        failures.push(`${scheme} ${route} ${violation}`);
    }
  }
  expect(failures).toEqual([]);
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'no-preference' });
  await page.setViewportSize({ width: 390, height: 844 });
  const overflowing: string[] = [];
  for (const route of ROUTES) {
    await open(route);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    if (overflow > 0) overflowing.push(`${route} ${overflow}px`);
  }
  expect(overflowing).toEqual([]);
});

test('the keyboard reaches every main control and focus is always visible', async ({
  page,
  browserName,
}) => {
  // WebKit follows Safari, where Tab skips links and buttons by default (a user setting), and
  // the Windows test driver does not honour Option+Tab; Chromium and Firefox cover keyboard order.
  test.skip(browserName === 'webkit', 'WebKit Tab order depends on a Safari user setting');
  const tab = 'Tab';
  test.setTimeout(240000);
  await page.goto('/saves');
  await page
    .locator('.slot-card')
    .nth(0)
    .getByLabel('Import backup — Slot 1')
    .setInputFiles({
      name: 'sweep.json',
      mimeType: 'application/json',
      buffer: Buffer.from(careerSave()),
    });
  await expect(page.locator('.slot-card').nth(0).getByRole('heading')).toHaveText('Sweep career');
  for (const route of ['/career?save=1', '/edit?save=1', '/settings', '/career/trophies?save=1']) {
    await page.goto(route);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 30000 });
    // Tab through the page: every stop is visible on screen with a visible focus indicator.
    const seen = new Set<string>();
    for (let step = 0; step < 40; step++) {
      await page.keyboard.press(tab);
      const focus = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return null;
        const style = getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return {
          key: `${el.tagName}:${el.textContent?.trim().slice(0, 30)}:${rect.top}`,
          indicated:
            (style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0) ||
            style.boxShadow !== 'none',
          size: rect.width > 0 && rect.height > 0,
          name: el.getAttribute('aria-label') ?? el.textContent?.trim() ?? '',
        };
      });
      if (!focus) continue;
      seen.add(focus.key);
      expect(focus.size, `${route} ${focus.key}`).toBe(true);
      expect(focus.indicated, `${route} ${focus.key}`).toBe(true);
    }
    expect(seen.size, route).toBeGreaterThan(10);
  }
});
