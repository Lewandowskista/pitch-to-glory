import { expect, test, type Page } from '@playwright/test';
import { isBrowserNoise, skipTutorial } from './support';
import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { generateWorld } from '../src/engine/world/generate';
import { createSave, DEFAULT_SETTINGS } from '../src/persistence/schema';

/**
 * Phase 2: a key moment shows the football context and the first action together, at desktop
 * and phone sizes, at normal and large text, with nothing covering the focused choice.
 */
const CASES = [
  { name: 'desktop-1366x768', width: 1366, height: 768, fontScale: 1, reduced: false },
  { name: 'phone-390x844', width: 390, height: 844, fontScale: 1, reduced: false },
  { name: 'phone-390x844-large', width: 390, height: 844, fontScale: 1.3, reduced: false },
  { name: 'phone-360x640', width: 360, height: 640, fontScale: 1, reduced: true },
  { name: 'phone-360x640-large', width: 360, height: 640, fontScale: 1.3, reduced: false },
] as const;
const DESKTOP = { width: 1366, height: 768 };
const PHONE = { width: 390, height: 844 };

type Variant = { fontScale?: number; simulationOnly?: boolean };
const saves = new Map<string, string>();
const key = ({ fontScale = 1, simulationOnly = false }: Variant) =>
  `${fontScale}-${simulationOnly}`;
test.beforeAll(async ({ browserName }, workerInfo) => {
  const world = generateWorld('decision-layout', { format: 'legacy' });
  await mkdir('artifacts', { recursive: true });
  for (const variant of [
    { fontScale: 1 },
    { fontScale: 1.3 },
    { fontScale: 1, simulationOnly: true },
  ]) {
    const path = `artifacts/decision-${key(variant)}-${browserName}-${workerInfo.workerIndex}.json`;
    await writeFile(
      path,
      JSON.stringify(
        createSave(1, 'Decision layout', {
          kind: 'world',
          world,
          gallery: { seed: 'decision-layout', generation: 0 },
          settings: { ...DEFAULT_SETTINGS, ...variant },
        }),
      ),
    );
    saves.set(key(variant), path);
  }
});
test.beforeEach(async ({ page }, testInfo) => {
  // The tutorial journeys show the tour; every other journey has already seen it.
  if (!testInfo.title.includes('tutorial')) await skipTutorial(page);
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

const tour = (page: Page) => page.getByTestId('tutorial');
/**
 * Press a control from the keyboard. On a phone in Firefox, a pointer click can scroll the
 * control under the tab bar or a first-visit offline notice; focus and Enter cannot.
 */
async function press(page: Page, name: string) {
  const button = page.getByRole('button', { name, exact: true });
  await button.focus();
  await page.keyboard.press('Enter');
}
/** Import the save and prepare a striker's friendly, ready to kick off. */
async function preview(page: Page, variant: Variant = {}) {
  await page.goto('/saves');
  await page
    .locator('.slot-card')
    .nth(0)
    .getByLabel('Import backup — Slot 1')
    .setInputFiles(saves.get(key(variant))!);
  await expect(page.locator('.notice')).toHaveText('Collection imported.', { timeout: 30000 });
  await page.goto('/match?save=1');
  const select = page.getByRole('combobox', { name: 'Your footballer', exact: true });
  await expect(select.locator('option')).toHaveCount(22, { timeout: 30000 });
  const striker = await select
    .locator('option')
    .evaluateAll(
      (options) =>
        (options.find((option) => option.textContent?.endsWith('ST')) as HTMLOptionElement).value,
    );
  await select.selectOption(striker);
  await press(page, 'Prepare match');
  await expect(page.getByTestId('match-state')).toHaveAttribute('data-status', 'preview');
}
/** Kick off and stop at the first key moment. */
async function keyMoment(page: Page, variant: Variant = {}) {
  await preview(page, variant);
  await press(page, 'Kick off');
  if (await page.getByRole('button', { name: 'Pause', exact: true }).isVisible())
    await press(page, 'Pause');
  await press(page, 'Next key moment');
  await expect(page.getByTestId('match-state')).toHaveAttribute('data-status', 'decision');
  await expect(page.locator('.match-choices button').first()).toBeFocused();
  // Let focus-driven scrolling and layout settle before measuring.
  await page.waitForTimeout(400);
}
/** Fraction of an element's height on screen, above the phone tab bar when there is one. */
async function visibleShare(page: Page, selector: string, index = 0): Promise<number> {
  return page
    .locator(selector)
    .nth(index)
    .evaluate((element) => {
      const box = element.getBoundingClientRect();
      if (!box.height) return 0;
      const bar = document.querySelector<HTMLElement>('.bottom-nav');
      const covered = bar && bar.offsetParent ? bar.getBoundingClientRect().height : 0;
      const top = Math.max(0, box.top);
      const bottom = Math.min(window.innerHeight - covered, box.bottom);
      return Math.max(0, bottom - top) / box.height;
    });
}
/**
 * What is drawn over the focused element (a tour card, a notice), or false when nothing is:
 * its corners and centre must all hit it.
 */
async function focusedCovered(page: Page): Promise<string | false> {
  return page.evaluate(() => {
    const focused = document.activeElement as HTMLElement;
    const box = focused.getBoundingClientRect();
    const points = [
      [box.left + 4, box.top + 4],
      [box.right - 4, box.top + 4],
      [box.left + box.width / 2, box.top + box.height / 2],
      [box.left + 4, box.bottom - 4],
      [box.right - 4, box.bottom - 4],
    ];
    for (const [x, y] of points) {
      const hit = document.elementFromPoint(x!, y!);
      if (!hit) return `off screen at ${Math.round(x!)},${Math.round(y!)}`;
      if (!focused.contains(hit))
        return `${hit.tagName.toLowerCase()}.${hit.className} at ${Math.round(x!)},${Math.round(y!)}`;
    }
    return false;
  });
}
const axeSource = readFileSync('node_modules/axe-core/axe.min.js', 'utf8');
/** Serious and critical WCAG 2.1 AA violations on the page. */
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
async function noSidewaysScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

for (const layout of CASES)
  test(`a key moment shows the situation and the first action together · ${layout.name}`, async ({
    page,
    browserName,
  }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width: layout.width, height: layout.height });
    if (layout.reduced) await page.emulateMedia({ reducedMotion: 'reduce' });
    await keyMoment(page, { fontScale: layout.fontScale });
    if (browserName === 'chromium')
      await page.screenshot({ path: `artifacts/phase2-${layout.name}.png` });

    // The focused first choice, with its action and chance, is fully on screen and uncovered.
    expect(await visibleShare(page, '.match-choices button')).toBe(1);
    await expect(page.locator('.match-choices button').first()).toContainText('%');
    expect(await focusedCovered(page)).toBe(false);
    // The football context is on screen with it: the whole pitch beside the decision on
    // desktop, the situation preview above it on phones. The score stays with the decision.
    if (layout.width >= 951)
      expect(await visibleShare(page, '.match-pitch-panel canvas, .match-pitch-panel svg')).toBe(1);
    else expect(await visibleShare(page, '.match-situation')).toBe(1);
    await expect(page.locator('.match-decision .match-eyebrow')).toContainText('0–0');
    await noSidewaysScroll(page);
    if (browserName === 'chromium') expect(await accessibilityViolations(page)).toEqual([]);
  });

test('keys reach every choice clear of the tab bar on a phone, and Escape never chooses', async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.setViewportSize(PHONE);
  await keyMoment(page);
  const choices = page.locator('.match-choices button');
  const count = await choices.count();
  for (let index = 1; index < count; index++) {
    await page.keyboard.press('ArrowDown');
    await expect(choices.nth(index)).toBeFocused();
    expect(await visibleShare(page, '.match-choices button', index)).toBe(1);
    expect(await focusedCovered(page)).toBe(false);
  }
  await page.keyboard.press('ArrowUp');
  await expect(choices.nth(count - 2)).toBeFocused();
  // Escape closes an open breakdown first, keeping the decision.
  const second = page.locator('.match-choice').nth(count - 2);
  await page.keyboard.press('Tab');
  await expect(second.locator('summary')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(second.locator('.match-factors')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(second.locator('.match-factors')).toBeHidden();
  await expect(choices.nth(count - 2)).toBeFocused();
  await expect(page.getByTestId('match-state')).toHaveAttribute('data-status', 'decision');
  // Otherwise Escape means back, never a choice: the key moment is waiting on return.
  await page.keyboard.press('Escape');
  await expect(page).not.toHaveURL(/\/match/);
  await page.goBack();
  await expect(page).toHaveURL(/\/match/);
  await expect(page.getByTestId('match-state')).toHaveAttribute('data-status', 'decision');
  await page.locator('.match-choices button').first().focus();
  // Space never chooses either; a number key does.
  await page.keyboard.press('Space');
  await expect(page.getByTestId('match-state')).toHaveAttribute('data-status', 'decision');
  await page.keyboard.press('2');
  await expect(page.getByTestId('match-state')).toHaveAttribute('data-status', 'live');
  await expect(page.locator('.match-outcome')).toContainText('Relevant attribute');
});

test.describe('touch', () => {
  test.use({ hasTouch: true });
  test('a tap chooses on a phone, and the details open with a tap', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName === 'firefox', 'Firefox does not emulate touch input.');
    test.setTimeout(120000);
    await page.setViewportSize(PHONE);
    await keyMoment(page);
    const first = page.locator('.match-choice').first();
    await first.getByText('Why this choice?').tap();
    await expect(first.locator('.match-factors')).toBeVisible();
    await first.locator('button[data-choice]').tap();
    await expect(page.getByTestId('match-state')).toHaveAttribute('data-status', 'live');
    await expect(page.locator('.match-outcome')).toBeVisible();
  });
});

test('simulation-only mode keeps the decision without a pitch on a small phone', async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 360, height: 640 });
  await keyMoment(page, { simulationOnly: true });
  await expect(page.locator('.match-situation')).toHaveCount(0);
  await expect(page.locator('.match-simulation')).toBeAttached();
  expect(await visibleShare(page, '.match-choices button')).toBe(1);
  expect(await focusedCovered(page)).toBe(false);
  await page.keyboard.press('1');
  await expect(page.getByTestId('match-state')).toHaveAttribute('data-status', 'live');
});

/** Walk the match tour from the briefing to the key moment. */
async function tourToKeyMoment(page: Page) {
  await expect(tour(page)).toContainText('Before kick-off');
  await tour(page).getByRole('button', { name: 'Next' }).click();
  await expect(tour(page)).toContainText('Kick off');
  return async () => {
    await page.locator('[data-tour="kickoff"]').click();
    await expect(tour(page)).toContainText('Controlling the match');
    await tour(page).getByRole('button', { name: 'Next' }).click();
    await expect(tour(page)).toContainText('Follow the game');
    if (await page.getByRole('button', { name: 'Pause', exact: true }).isVisible())
      await press(page, 'Pause');
    await press(page, 'Next key moment');
    await expect(tour(page)).toContainText('A key moment');
    await expect(page.locator('.match-choices button').first()).toBeFocused();
    await page.waitForTimeout(400);
  };
}

test('the tutorial sits in the page on a phone and never covers a choice', async ({
  page,
  browserName,
}) => {
  test.setTimeout(120000);
  await page.setViewportSize(PHONE);
  await preview(page);
  const continueTour = await tourToKeyMoment(page);
  // The kick-off step is part of the briefing, not a sheet over it.
  await expect(page.locator('[data-tour-slot="kickoff"]').getByTestId('tutorial')).toBeVisible();
  await continueTour();
  await expect(page.locator('.match-decision').getByTestId('tutorial')).toBeVisible();
  if (browserName === 'chromium')
    await page.screenshot({ path: 'artifacts/phase2-phone-tutorial.png' });
  expect(await visibleShare(page, '.match-choices button')).toBe(1);
  expect(await visibleShare(page, '.match-situation')).toBe(1);
  expect(await focusedCovered(page)).toBe(false);
  await page.keyboard.press('1');
  await expect(tour(page)).toContainText('Every result is explained');
  await tour(page).getByRole('button', { name: 'Got it' }).click();
  await expect(tour(page)).toHaveCount(0);
});

test('the tutorial card on desktop moves rather than cover the focused choice', async ({
  page,
  browserName,
}) => {
  test.setTimeout(120000);
  await page.setViewportSize(DESKTOP);
  await preview(page);
  const continueTour = await tourToKeyMoment(page);
  await continueTour();
  if (browserName === 'chromium')
    await page.screenshot({ path: 'artifacts/phase2-desktop-tutorial.png' });
  const choices = page.locator('.match-choices button');
  for (let index = 0; index < (await choices.count()); index++) {
    if (index) await page.keyboard.press('ArrowDown');
    await expect(choices.nth(index)).toBeFocused();
    // Focus may still be scrolling the choice into view.
    await expect.poll(() => focusedCovered(page), { message: `choice ${index + 1}` }).toBe(false);
  }
  expect(await visibleShare(page, '.match-pitch-panel canvas, .match-pitch-panel svg')).toBe(1);
});
