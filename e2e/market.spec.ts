import { expect, test, type Page } from '@playwright/test';
import { careerTabs, isAbortedLoad, isBrowserNoise, openCareerPage, skipTutorial } from './support';
import { readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { generateWorld } from '../src/engine/world/generate';
import { createCareer, trialOffers } from '../src/engine/career/create';
import { careerContract, makeTransferBid, marketSeasonEnd } from '../src/engine/career/market';
import { advanceCareerWeek } from '../src/engine/career/season';
import { createSave, DEFAULT_SETTINGS } from '../src/persistence/schema';
import type { World } from '../src/model/domain';

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
test.use({ actionTimeout: 15000 });

const axeSource = readFileSync('node_modules/axe-core/axe.min.js', 'utf8');
/** Serious or critical WCAG A/AA violations on the current page, by rule id. */
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

/**
 * A saved career, built with the real engine: a club has had a bid accepted and its
 * contract offer is waiting, so the journey can negotiate without simulating a season.
 */
function marketSave(
  options: { buyerName?: string; settings?: Partial<typeof DEFAULT_SETTINGS> } = {},
): { json: string; buyer: string; parent: string; offerId: string } {
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
  if (options.buyerName) buyer.name = options.buyerName;
  const offer = makeTransferBid(world, buyer, 80);
  if (offer?.status !== 'terms') throw new Error('The prepared bid was not accepted');
  const save = createSave(1, 'Market career', {
    kind: 'world',
    world,
    gallery: { seed: 'market-browser', generation: 0 },
    settings: { ...DEFAULT_SETTINGS, ...options.settings },
  });
  return { json: JSON.stringify(save), buyer: buyer.name, parent: parent.name, offerId: offer.id };
}

async function importSave(page: Page, json: string): Promise<void> {
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
}

// Phone talks keep the club's name readable and the terms close: no overflow is not enough,
// because a squeezed heading can wrap word by word while staying inside the viewport.
for (const phone of [
  { width: 360, height: 640, fontScale: 1 },
  { width: 360, height: 640, fontScale: 1.3 },
  { width: 390, height: 844, fontScale: 1 },
  { width: 390, height: 844, fontScale: 1.3 },
]) {
  const name = `${phone.width}x${phone.height} at ${Math.round(phone.fontScale * 100)}% text`;
  test(`transfer talks stay readable on a phone · ${name}`, async ({ page, browserName }) => {
    test.setTimeout(120000);
    const { json, buyer, offerId } = marketSave({
      buyerName: 'Oakfield Athletic Wanderers',
      settings: { fontScale: phone.fontScale },
    });
    await page.setViewportSize({ width: phone.width, height: phone.height });
    await importSave(page, json);
    await page.goto(`/career/transfers?save=1&offer=${encodeURIComponent(offerId)}`);
    const heading = page.getByRole('heading', { name: `Talks with ${buyer}` });
    await expect(heading).toBeVisible();
    const geometry = await heading.evaluate((element) => {
      const section = element.closest('[aria-labelledby="talks-heading"]')!;
      const panel = section.getBoundingClientRect();
      const box = element.getBoundingClientRect();
      const lineHeight = parseFloat(getComputedStyle(element).lineHeight);
      // A word split across lines has more than one client rect.
      const broken: string[] = [];
      const terms = document.querySelector('[aria-labelledby="their-heading"] dl')!;
      for (const node of [element, ...terms.querySelectorAll('dd')]) {
        const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
        for (let text = walker.nextNode(); text; text = walker.nextNode())
          for (const match of (text.textContent ?? '').matchAll(/\S+/g)) {
            const range = document.createRange();
            range.setStart(text, match.index);
            range.setEnd(text, match.index + match[0].length);
            if (range.getClientRects().length > 1) broken.push(match[0]);
          }
      }
      const back = [...section.querySelectorAll('button')]
        .find((button) => button.textContent?.trim() === 'Back to offers')!
        .getBoundingClientRect();
      const first = terms.getBoundingClientRect();
      return {
        share: box.width / panel.width,
        lines: Math.round(box.height / lineHeight),
        broken,
        // Back has its own row, above or below the club's name, never squeezing it.
        backApart: back.bottom <= box.top || back.top >= box.bottom,
        termsTop: first.top + window.scrollY,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });
    await mkdir('artifacts/market-layout', { recursive: true });
    await page.screenshot({
      path: `artifacts/market-layout/talks-${phone.width}-${Math.round(phone.fontScale * 100)}-${browserName}.png`,
      fullPage: true,
    });
    expect(geometry.share, 'heading width share').toBeGreaterThanOrEqual(0.6);
    // A long name in the hero title may take a fourth line at enlarged text, at full width.
    expect(geometry.lines, 'heading lines').toBeLessThanOrEqual(phone.fontScale > 1 ? 4 : 3);
    expect(geometry.broken, 'words broken across lines').toEqual([]);
    expect(geometry.backApart, 'Back sits on its own row').toBe(true);
    expect(geometry.overflow).toBeLessThanOrEqual(0);
    // The club's terms start within one screen of scrolling (a little more on the smallest
    // phone with enlarged text, where the club's hero alone fills most of a screen).
    const screens = phone.height < 700 && phone.fontScale > 1 ? 2.25 : 2;
    expect(geometry.termsTop, 'first contract term').toBeLessThan(phone.height * screens);
  });
}

/** A finished season whose contract ends with it, the club's option used, and two suitors. */
function expirySave(): { json: string; club: string } {
  const base = generateWorld('expiry-browser', { format: 'legacy' });
  const trial = trialOffers(base, 'country:0', 'expiry-browser')[0]!;
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
    'expiry-browser',
  );
  while (world.phase === 'active')
    world = advanceCareerWeek(world, { inPlace: true, autoPlay: true }).world;
  const contract = careerContract(world);
  contract.end = { ...contract.end, season: world.date.season };
  contract.optionTaken = true;
  world.offers = [];
  world.negotiations = {};
  world.scouting = Object.values(world.clubs)
    .filter((club) => club.id !== contract.clubId && club.playerIds.length > 0)
    .sort((a, b) => b.reputation - a.reputation)
    .slice(0, 2)
    .map((club, index) => ({
      id: `interest:browser:${index}`,
      clubId: club.id,
      playerId: world.career!.playerId,
      kind: 'transfer' as const,
      started: { ...world.date, week: 1 },
      weeksObserved: 10,
      confidence: 80,
      stage: 'offer' as const,
      lastOffer: null,
    }));
  marketSeasonEnd(world);
  const save = createSave(1, 'Market career', {
    kind: 'world',
    world,
    gallery: { seed: 'expiry-browser', generation: 0 },
    settings: DEFAULT_SETTINGS,
  });
  return { json: JSON.stringify(save), club: world.clubs[contract.clubId]!.name };
}

test('an expiring contract asks the player to decide before the next season', async ({ page }) => {
  test.setTimeout(120000);
  const { json, club } = expirySave();
  await importSave(page, json);
  await page.goto('/career?save=1');
  const priority = page.getByRole('link', { name: /Decide where you play next season/ });
  await expect(priority).toBeVisible();

  // Starting the season without a decision states the default and can be cancelled.
  await page.getByRole('button', { name: 'Start next season' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText(`you stay at ${club} on a one-season deal`);
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();

  // The decision lives with the contract, beside the clubs' offers.
  await priority.click();
  await expect(page).toHaveURL(/\/career\/transfers/);
  const decision = page.locator('#contract-decision');
  await expect(decision).toContainText('2 interested clubs have opened talks');
  await expect(decision).toContainText(`you stay at ${club} on a one-season deal`);
  await expect(page.getByText(/Club option: already used/)).toBeVisible();
});

test('negotiates a transfer from the inbox, hires an agent and survives a refresh', async ({
  page,
  browserName,
}) => {
  test.setTimeout(180000);
  const { json, buyer, parent } = marketSave();
  await importSave(page, json);

  // The inbox shows the club's accepted bid; opening a message marks it read.
  await page.goto('/career/inbox?save=1');
  await expect(page.getByRole('heading', { name: 'Inbox', exact: true })).toBeVisible();
  await expect(
    careerTabs(page, 'Overview').getByRole('link', { name: /Inbox · 1 unread/ }),
  ).toBeVisible();
  await page.getByRole('button', { name: new RegExp(`${buyer} agree a fee`) }).click();
  await expect(page.getByRole('heading', { name: `${buyer} agree a fee` })).toBeVisible();
  await expect(page.getByText(new RegExp(`${parent} accepted`))).toBeVisible();
  await expect(
    careerTabs(page, 'Overview').getByRole('link', { name: 'Inbox', exact: true }),
  ).toBeVisible();

  // Talks: a demand above the club's budget is met halfway, with the reason shown.
  await page.getByRole('link', { name: 'Go to the talks' }).click();
  await expect(page).toHaveURL(/\/career\/transfers\?.*offer=/);
  await expect(page.getByRole('heading', { name: `Talks with ${buyer}` })).toBeVisible();
  // What the move means for minutes: the slot under their manager and the chance of starting.
  await expect(page.getByText('Playing time there')).toBeVisible();
  await expect(page.getByText(/start about \d+% of matches/)).toBeVisible();
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
  await openCareerPage(page, 'Agent');
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
  await openCareerPage(page, 'Transfers');
  await expect(contract.getByText(buyer, { exact: true })).toBeVisible();

  // The populated market pages have no serious accessibility violations, in both themes.
  if (browserName === 'chromium')
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      for (const path of ['/career/transfers', '/career/agent', '/career/inbox', '/career']) {
        await page.goto(`${path}?save=1`);
        await expect(careerTabs(page)).toBeVisible();
        expect(await accessibilityViolations(page), `${scheme} ${path}`).toEqual([]);
      }
    }

  // Every market page fits a phone screen.
  if (browserName === 'chromium') {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const path of ['/career/transfers', '/career/agent', '/career/inbox', '/career']) {
      await page.goto(`${path}?save=1`);
      await expect(careerTabs(page)).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, path).toBeLessThanOrEqual(0);
    }
  }
});
