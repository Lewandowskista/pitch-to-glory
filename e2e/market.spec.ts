import { expect, test, type Page } from '@playwright/test';
import { skipTutorial } from './support';
import { readFileSync } from 'node:fs';
import { generateWorld } from '../src/engine/world/generate';
import { createCareer, trialOffers } from '../src/engine/career/create';
import { makeTransferBid } from '../src/engine/career/market';
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
/** Serious or critical WCAG A/AA violations on the current page, by rule id. */
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

/**
 * A saved career, built with the real engine: a club has had a bid accepted and its
 * contract offer is waiting, so the journey can negotiate without simulating a season.
 */
function marketSave(): { json: string; buyer: string; parent: string } {
  const base = generateWorld('market-browser', { format: 'legacy' });
  const trial = trialOffers(base, 'country:0', 'market-browser')[0]!;
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
    'market-browser',
  );
  const parent = world.clubs[trial.id]!;
  const buyer = Object.values(world.clubs)
    .filter((club) => club.id !== parent.id && club.reputation > parent.reputation)
    .sort((a, b) => a.reputation - b.reputation || (a.id < b.id ? -1 : 1))[0]!;
  buyer.finances.transferBudget = 1e9;
  const offer = makeTransferBid(world, buyer, 80);
  if (offer?.status !== 'terms') throw new Error('The prepared bid was not accepted');
  const save = createSave(1, 'Market career', {
    kind: 'world',
    world,
    gallery: { seed: 'market-browser', generation: 0 },
    settings: DEFAULT_SETTINGS,
  });
  return { json: JSON.stringify(save), buyer: buyer.name, parent: parent.name };
}

test('negotiates a transfer from the inbox, hires an agent and survives a refresh', async ({
  page,
  browserName,
}) => {
  test.setTimeout(180000);
  const { json, buyer, parent } = marketSave();
  await page.goto('/saves');
  await page
    .locator('.slot-card')
    .nth(0)
    .getByLabel('Import backup — Slot 1')
    .setInputFiles({
      name: 'market.json',
      mimeType: 'application/json',
      buffer: Buffer.from(json),
    });
  await expect(page.locator('.slot-card').nth(0).getByRole('heading')).toHaveText('Market career');

  // The inbox shows the club's accepted bid; opening a message marks it read.
  await page.goto('/career/inbox?save=1');
  await expect(page.getByRole('heading', { name: 'Inbox', exact: true })).toBeVisible();
  const nav = page.getByRole('navigation', { name: 'Career sections' });
  await expect(nav.getByRole('link', { name: /Inbox · 1 unread/ })).toBeVisible();
  await page.getByRole('button', { name: new RegExp(`${buyer} agree a fee`) }).click();
  await expect(page.getByRole('heading', { name: `${buyer} agree a fee` })).toBeVisible();
  await expect(page.getByText(new RegExp(`${parent} accepted`))).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Inbox', exact: true })).toBeVisible();

  // Talks: a demand above the club's budget is met halfway, with the reason shown.
  await page.getByRole('link', { name: 'Go to the talks' }).click();
  await expect(page).toHaveURL(/\/career\/transfers\?.*offer=/);
  await expect(page.getByRole('heading', { name: `Talks with ${buyer}` })).toBeVisible();
  const wage = page.getByLabel('Weekly wage', { exact: true });
  const opening = Number(await wage.inputValue());
  const ask = Math.round(opening * 1.25);
  await wage.fill(String(ask));
  await page.getByRole('button', { name: 'Send counter-offer' }).click();
  await expect(page.getByText('They came back with new terms.')).toBeVisible();
  await expect(page.getByText('The wage is above their budget.')).toBeVisible();
  await expect(wage).not.toHaveValue(String(ask));
  if (browserName === 'chromium') expect(await accessibilityViolations(page), 'talks').toEqual([]);

  // Browser back returns to the message the talks were opened from, forward returns.
  await page.goBack();
  await expect(page).toHaveURL(/\/career\/inbox/);
  await page.goForward();
  await expect(page.getByRole('heading', { name: `Talks with ${buyer}` })).toBeVisible();

  // Accepting completes the move.
  await page.getByRole('button', { name: 'Accept their terms' }).click();
  await expect(page.getByText('Deal agreed.')).toBeVisible();
  await expect(page.getByText('These talks are closed.')).toBeVisible();
  await page.getByRole('button', { name: 'Back to offers' }).click();
  const contract = page.getByRole('region', { name: 'Your contract' });
  await expect(contract.getByText(buyer, { exact: true })).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Career moves' }).getByRole('cell', { name: 'Transfer' }),
  ).toBeVisible();

  // A transfer request asks for confirmation; Escape cancels it.
  await page.getByRole('button', { name: 'Hand in a transfer request' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();

  // Hire the first agent who will take the player on.
  await nav.getByRole('link', { name: 'Agent', exact: true }).click();
  await expect(page).toHaveURL(/\/career\/agent/);
  await page
    .getByRole('button', { name: /^Hire / })
    .first()
    .click();
  const current = page.getByRole('region', { name: 'Your agent' });
  await expect(current.getByRole('button', { name: 'Release agent' })).toBeVisible();

  // The autosaved slot restores the move and the agent after a refresh.
  await expect(page.getByText('All changes saved').first()).toBeVisible({ timeout: 30000 });
  await page.reload();
  await expect(current.getByRole('button', { name: 'Release agent' })).toBeVisible({
    timeout: 30000,
  });
  await nav.getByRole('link', { name: 'Transfers', exact: true }).click();
  await expect(contract.getByText(buyer, { exact: true })).toBeVisible();

  // The populated market pages have no serious accessibility violations, in both themes.
  if (browserName === 'chromium')
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      for (const path of ['/career/transfers', '/career/agent', '/career/inbox', '/career']) {
        await page.goto(`${path}?save=1`);
        await expect(page.getByRole('navigation', { name: 'Career sections' })).toBeVisible();
        expect(await accessibilityViolations(page), `${scheme} ${path}`).toEqual([]);
      }
    }

  // Every market page fits a phone screen.
  if (browserName === 'chromium') {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const path of ['/career/transfers', '/career/agent', '/career/inbox', '/career']) {
      await page.goto(`${path}?save=1`);
      await expect(page.getByRole('navigation', { name: 'Career sections' })).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, path).toBeLessThanOrEqual(0);
    }
  }
});
