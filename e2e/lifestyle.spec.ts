import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { generateWorld } from '../src/engine/world/generate';
import { createCareer, trialOffers } from '../src/engine/career/create';
import { makeSponsorOffer, BRAND_BY_ID } from '../src/engine/career/lifestyle';
import { createRng } from '../src/engine/rng';
import { CONFIG } from '../src/engine/config';
import { createSave, DEFAULT_SETTINGS } from '../src/persistence/schema';
import type { World } from '../src/model/domain';

test.beforeEach(async ({ page }) => {
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

/** A career at fame level 4 with savings and a sponsor offer waiting, built with the engine. */
function lifestyleSave(): { json: string; brand: string } {
  const base = generateWorld('lifestyle-browser', { format: 'legacy' });
  const trial = trialOffers(base, 'country:0', 'lifestyle-browser')[0]!;
  const world: World = createCareer(
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
    'lifestyle-browser',
  );
  world.career!.fame = CONFIG.career.lifestyle.fameLevels[3];
  world.career!.style.fameLevel = 4;
  world.career!.market.finances.cash = 30_000;
  world.career!.market.finances.lifetimeEarnings = 30_000;
  const offer = makeSponsorOffer(world, createRng('lifestyle-browser-offer'))!;
  const save = createSave(1, 'Lifestyle career', {
    kind: 'world',
    world,
    gallery: { seed: 'lifestyle-browser', generation: 0 },
    settings: DEFAULT_SETTINGS,
  });
  return { json: JSON.stringify(save), brand: BRAND_BY_ID[offer.brandId]!.name };
}

test('signs a sponsor, buys a car, dresses up and picks a celebration', async ({
  page,
  browserName,
}) => {
  test.setTimeout(180000);
  const { json, brand } = lifestyleSave();
  await page.goto('/saves');
  await page
    .locator('.slot-card')
    .nth(0)
    .getByLabel('Import backup — Slot 1')
    .setInputFiles({
      name: 'lifestyle.json',
      mimeType: 'application/json',
      buffer: Buffer.from(json),
    });
  await expect(page.locator('.slot-card').nth(0).getByRole('heading')).toHaveText(
    'Lifestyle career',
  );

  // Lifestyle: fame, the sponsor offer and a purchase.
  await page.goto('/career/lifestyle?save=1');
  await expect(page.getByRole('heading', { name: /Fame level 4/ })).toBeVisible();
  await page.getByRole('button', { name: `Sign the deal — ${brand}` }).click();
  await expect(page.getByRole('heading', { name: 'Your deals' })).toBeVisible();
  await expect(page.getByText('Start', { exact: false }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Buy — City hatchback' }).click();
  const owned = page.getByRole('region', { name: 'Lifestyle' });
  await expect(owned.getByRole('button', { name: /Sell for .* — City hatchback/ })).toBeVisible();
  await expect(owned.getByText('27,500 Cr')).toBeVisible();

  // Wardrobe: today's challenges arrive, a free hairstyle, long sleeves and a celebration.
  const nav = page.getByRole('navigation', { name: 'Career sections' });
  await nav.getByRole('link', { name: 'Wardrobe', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Challenges' }).getByRole('listitem')).toHaveCount(
    6,
  );
  const hair = page.getByRole('list', { name: 'Hairstyle' });
  await expect(
    hair.getByRole('button', { name: /Hairstyle 8 · Fame level 6|Hairstyle 8 · Unlock/ }),
  ).toBeDisabled();
  await hair.getByRole('button', { name: /^Hairstyle 2/ }).click();
  await expect(hair.getByRole('button', { name: /^Hairstyle 2/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByText('Long', { exact: true }).click();
  const celebrations = page.getByRole('list', { name: 'Celebrations' });
  await celebrations.getByRole('button', { name: /^Knee slide/ }).click();
  await expect(celebrations.getByRole('button', { name: /^Knee slide/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('img', { name: 'Preview of Knee slide' })).toBeVisible();

  // Everything survives an autosave and a refresh.
  await expect(page.getByText('All changes saved').first()).toBeVisible({ timeout: 30000 });
  await page.reload();
  await expect(
    page.getByRole('list', { name: 'Celebrations' }).getByRole('button', { name: /^Knee slide/ }),
  ).toHaveAttribute('aria-pressed', 'true', { timeout: 30000 });
  await expect(page.getByRole('radio', { name: 'Long' })).toBeChecked();

  if (browserName === 'chromium') {
    await mkdir('artifacts', { recursive: true });
    for (const path of ['lifestyle', 'wardrobe']) {
      await page.goto(`/career/${path}?save=1`);
      await expect(nav).toBeVisible();
      await page.screenshot({ path: `artifacts/career-${path}.png`, fullPage: true });
    }
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      for (const path of ['/career/lifestyle', '/career/wardrobe', '/career']) {
        await page.goto(`${path}?save=1`);
        await expect(nav).toBeVisible();
        expect(await accessibilityViolations(page), `${scheme} ${path}`).toEqual([]);
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    for (const path of ['/career/lifestyle', '/career/wardrobe', '/career']) {
      await page.goto(`${path}?save=1`);
      await expect(nav).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, path).toBeLessThanOrEqual(0);
    }
  }
});
