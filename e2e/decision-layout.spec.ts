import type { Page } from '@playwright/test';
import { expect, matchState, settled, skipTutorial, test } from './support';
import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { generateWorld } from '../src/engine/world/generate';
import { createSave, DEFAULT_SETTINGS } from '../src/persistence/schema';

/**
 * The decision card (release 1.0, X1b; docs/EXPERIENCE-REDESIGN-1.0.md 1.4): a chain's step
 * shows its clip and the card together, at desktop and phone sizes, at normal and large text,
 * with nothing covering the focused choice; keys, taps and "Why?" work, and a tap in the first
 * 300 ms of a new step is ignored.
 */
const CASES = [
  { name: 'desktop-1366x768', width: 1366, height: 768, fontScale: 1, reduced: false },
  { name: 'phone-390x844', width: 390, height: 844, fontScale: 1, reduced: false },
  { name: 'phone-390x844-large', width: 390, height: 844, fontScale: 1.3, reduced: false },
  { name: 'phone-360x640', width: 360, height: 640, fontScale: 1, reduced: true },
] as const;
const DESKTOP = { width: 1366, height: 768 };
const PHONE = { width: 390, height: 844 };

type Variant = { fontScale?: number };
const saves = new Map<string, string>();
const key = ({ fontScale = 1 }: Variant) => `${fontScale}`;
test.beforeAll(async ({ browserName }, workerInfo) => {
  const world = generateWorld('decision-layout');
  await mkdir('artifacts', { recursive: true });
  for (const variant of [{ fontScale: 1 }, { fontScale: 1.3 }]) {
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
});

const tour = (page: Page) => page.getByTestId('tutorial');
const card = (page: Page) => page.locator('.reel-card');
const choices = (page: Page) => page.locator('.reel-card button[data-choice]');
/** Import the save and prepare a striker's friendly, ready to kick off. */
async function preview(page: Page, variant: Variant = {}) {
  await page.goto('/saves');
  await page
    .locator('.slot-card')
    .nth(0)
    .getByLabel('Import backup — Slot 1')
    .setInputFiles(saves.get(key(variant))!);
  await expect(page.locator('.notice')).toHaveText('Save imported.', { timeout: 30000 });
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
  await page.getByRole('button', { name: 'Prepare match', exact: true }).click();
  await expect(matchState(page)).toHaveAttribute('data-status', 'preview');
}
/** Skip through the ticker until the first step's card shows, its first choice focused. */
async function toCard(page: Page) {
  for (let turns = 0; turns < 200; turns++) {
    const beat = await matchState(page).getAttribute('data-beat');
    if (beat === 'card') break;
    if (beat === 'wait') await page.locator('.reel-main section button').first().click();
    else if (beat === 'ticker') await page.keyboard.press('Space');
    await page.waitForTimeout(150);
  }
  await expect(choices(page).first()).toBeFocused();
  await settled(page);
}
/** Kick off and stop at the first decision step. */
async function keyMoment(page: Page, variant: Variant = {}) {
  await preview(page, variant);
  await page.getByRole('button', { name: 'Kick off', exact: true }).click();
  await toCard(page);
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
    // Inset past the rounded corners, which large text makes larger.
    const points = [
      [box.left + 10, box.top + 10],
      [box.right - 10, box.top + 10],
      [box.left + box.width / 2, box.top + box.height / 2],
      [box.left + 10, box.bottom - 10],
      [box.right - 10, box.bottom - 10],
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
  test(`a step shows its clip and the card together · ${layout.name}`, async ({
    page,
    browserName,
  }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width: layout.width, height: layout.height });
    if (layout.reduced) await page.emulateMedia({ reducedMotion: 'reduce' });
    await keyMoment(page, { fontScale: layout.fontScale });
    if (browserName === 'chromium')
      await page.screenshot({ path: `artifacts/card-${layout.name}.png` });
    // The focused first choice, with its outcome and chance, is fully on screen and uncovered.
    expect(await visibleShare(page, '.reel-card button[data-choice]')).toBe(1);
    await expect(choices(page).first()).toContainText(/\d+%/);
    await expect(choices(page).first()).toContainText(/Likely|Even|Long shot/);
    expect(await focusedCovered(page)).toBe(false);
    // The stakes header, within 12 words, and the clip beside or above it. On a small phone
    // with large text the card may push the clip partly out of view, never the choices.
    const header = (await card(page).locator('.reel-card-header').textContent())!;
    expect(header.split(/\s+/).filter((token) => /\p{L}/u.test(token)).length).toBeLessThanOrEqual(
      12,
    );
    expect(await visibleShare(page, '[data-testid="clip-stage"]')).toBeGreaterThan(
      layout.height < 700 ? 0.3 : 0.9,
    );
    await noSidewaysScroll(page);
    if (browserName === 'chromium') expect(await accessibilityViolations(page)).toEqual([]);
  });

test('keys reach every choice, Escape and Space never choose, a number key does', async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.setViewportSize(PHONE);
  await keyMoment(page);
  const count = await choices(page).count();
  for (let index = 1; index < count; index++) {
    await page.keyboard.press('ArrowDown');
    await expect(choices(page).nth(index)).toBeFocused();
    expect(await visibleShare(page, '.reel-card button[data-choice]', index)).toBe(1);
  }
  await page.keyboard.press('ArrowUp');
  await expect(choices(page).nth(count - 2)).toBeFocused();
  // "Why?" holds the factors; Escape closes it first, keeping the decision.
  await card(page).getByRole('button', { name: 'Why?' }).click();
  await expect(card(page).locator('.reel-why-panel')).toBeVisible();
  await expect(card(page).locator('.reel-why-panel')).toContainText('%');
  await page.keyboard.press('Escape');
  await expect(card(page).locator('.reel-why-panel')).toHaveCount(0);
  await expect(matchState(page)).toHaveAttribute('data-status', 'decision');
  // Space skips nothing on a card and never chooses.
  await choices(page).first().focus();
  await page.keyboard.press('Space');
  await expect(matchState(page)).toHaveAttribute('data-status', 'decision');
  await expect(matchState(page)).toHaveAttribute('data-beat', 'card');
  const momentId = await matchState(page).getAttribute('data-moment');
  await page.keyboard.press('2');
  await expect(matchState(page)).not.toHaveAttribute('data-moment', momentId!);
  await expect(page.getByTestId('outcome-beat')).toBeVisible({ timeout: 10000 });
});

test.describe('touch', () => {
  test.use({ hasTouch: true });
  test('a tap chooses on a phone, but not in the first 300 ms of a new step', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName === 'firefox', 'Firefox does not emulate touch input.');
    test.setTimeout(120000);
    await page.setViewportSize(PHONE);
    await preview(page);
    await page.getByRole('button', { name: 'Kick off', exact: true }).click();
    for (let turns = 0; turns < 200; turns++) {
      const beat = await matchState(page).getAttribute('data-beat');
      if (beat === 'clip' && (await matchState(page).getAttribute('data-status')) === 'decision')
        break;
      if (beat === 'wait') await page.locator('.reel-main section button').first().click();
      else if (beat === 'ticker' || beat === 'build') await page.keyboard.press('Space');
      await page.waitForTimeout(100);
    }
    // A press the moment the card lands is ignored: clicked from the page in the frame the
    // card appears, as a fast double tap would.
    const momentId = await page.evaluate(
      () =>
        new Promise<string | null>((resolve) => {
          const press = () => {
            const button = document.querySelector<HTMLButtonElement>(
              '.reel-card button[data-choice]',
            );
            if (!button) return requestAnimationFrame(press);
            const id = document
              .querySelector('[data-testid="match-state"]')!
              .getAttribute('data-moment');
            button.click();
            resolve(id);
          };
          press();
        }),
    );
    await expect(matchState(page)).toHaveAttribute('data-moment', momentId!);
    await expect(matchState(page)).toHaveAttribute('data-beat', 'card');
    await page.waitForTimeout(350);
    await choices(page).first().tap();
    await expect(matchState(page)).not.toHaveAttribute('data-moment', momentId!);
    await expect(page.getByTestId('outcome-beat')).toBeVisible({ timeout: 10000 });
  });
});

test('the tutorial points at the card on a phone and never covers a choice', async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize(PHONE);
  await preview(page);
  await expect(tour(page)).toContainText('Before kick-off');
  await tour(page).getByRole('button', { name: 'Next' }).click();
  await expect(page.locator('[data-tour-slot="kickoff"]').getByTestId('tutorial')).toBeVisible();
  await page.locator('[data-tour="kickoff"]').click();
  await expect(matchState(page)).toHaveAttribute('data-status', 'live');
  // Past the ticker's step (its Next, never Space on the tour's buttons), to the first decision.
  const next = tour(page).getByRole('button', { name: 'Next' });
  for (let turns = 0; turns < 200; turns++) {
    const beat = await matchState(page).getAttribute('data-beat');
    if (beat === 'card') break;
    if (await next.isVisible()) await next.click();
    else if (beat === 'ticker')
      await page.getByRole('button', { name: 'Skip to next moment' }).click();
    await page.waitForTimeout(150);
  }
  await expect(choices(page).first()).toBeFocused();
  await expect(page.locator('[data-tour-slot="decision"]').getByTestId('tutorial')).toBeVisible();
  expect(await visibleShare(page, '.reel-card button[data-choice]')).toBe(1);
  expect(await focusedCovered(page)).toBe(false);
  await page.waitForTimeout(320);
  await page.keyboard.press('1');
  await expect(page.locator('[data-tour-slot="decision"]')).toHaveCount(0);
});

test('on a desktop the clip, the card and the live numbers sit side by side', async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize(DESKTOP);
  await keyMoment(page);
  await expect(page.locator('.reel-aside')).toBeVisible();
  const [stage, aside] = await Promise.all([
    page.getByTestId('clip-stage').boundingBox(),
    page.locator('.reel-aside').boundingBox(),
  ]);
  expect(aside!.x).toBeGreaterThanOrEqual(stage!.x + stage!.width - 1);
  expect(await visibleShare(page, '[data-testid="clip-stage"]')).toBe(1);
  expect(await focusedCovered(page)).toBe(false);
});
