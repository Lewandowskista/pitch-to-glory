import { expect, test, type Page, type Request } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { isAbortedLoad, isBrowserNoise, skipTutorial } from './support';
import { generateWorld } from '../src/engine/world/generate';
import { createCareer, trialOffers } from '../src/engine/career/create';
import { advanceCareerWeek } from '../src/engine/career/season';
import { createSave, DEFAULT_SETTINGS } from '../src/persistence/schema';
import { EVENTS } from '../src/analytics/events';

/**
 * Analytics and consent (docs/ANALYTICS.md). Automated browsers never send events, so these
 * journeys turn analytics on with the test-only override (honoured only under automation), a
 * dummy key and a short flush interval, and answer PostHog's batch endpoint themselves: nothing
 * leaves the machine, whatever key the build carries. The production Content Security Policy
 * applies, so a request that arrives here is also one the policy allows.
 */
interface Batch {
  api_key: string;
  batch: { event: string; properties: Record<string, unknown>; timestamp: string }[];
}
type Analytics = Page & { batches: Batch[]; errors: string[] };
const HOST = 'https://eu.i.posthog.com';

// Requests a service worker makes are out of reach of `page.route` in WebKit, so the worker
// stays off here: every request is answered by this spec and none can reach PostHog.
test.use({ serviceWorkers: 'block' });

async function enable(page: Page, key = 'phc_test'): Promise<void> {
  await page.addInitScript((key) => {
    (window as { __ptgAnalyticsTest?: object }).__ptgAnalyticsTest = {
      key,
      environment: 'ci',
      flushMs: 250,
    };
  }, key);
}

test.beforeEach(async ({ page }) => {
  await skipTutorial(page);
  const target = page as Analytics;
  target.batches = [];
  target.errors = [];
  page.on('pageerror', (error) => {
    if (!isAbortedLoad(error.message)) target.errors.push(error.message);
  });
  page.on('console', (entry) => {
    if (entry.type() === 'error' && !isBrowserNoise(entry)) target.errors.push(entry.text());
  });
  await page.route(`${HOST}/**`, async (route) => {
    const cors = {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-headers': 'content-type',
    };
    if (route.request().method() === 'OPTIONS')
      return route.fulfill({ status: 204, headers: cors });
    target.batches.push(route.request().postDataJSON() as Batch);
    return route.fulfill({ status: 200, headers: cors, json: { status: 1 } });
  });
});
test.afterEach(async ({ page }) => {
  expect((page as Analytics).errors).toEqual([]);
});

const sent = (page: Page) => (page as Analytics).batches.flatMap((batch) => batch.batch);
const named = (page: Page, event: string) => sent(page).filter((entry) => entry.event === event);
const routes = (page: Page) => named(page, 'route_viewed').map((entry) => entry.properties.route);
const stored = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('ptg-analytics') ?? 'null'));
const mainNav = (page: Page) => page.getByRole('navigation', { name: 'Main navigation' }).first();

test('without a key, or under automation, nothing is sent or downloaded', async ({ page }) => {
  const requests: Request[] = [];
  page.on('request', (request) => requests.push(request));
  // Automation alone: analytics stays off whatever key the build carries.
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Start a career' })).toBeVisible();
  await mainNav(page)
    .getByRole('link', { name: /Settings/ })
    .click();
  await expect(page.getByText(/sends no statistics/)).toBeVisible();
  await page.waitForTimeout(2500);
  // A test that turns analytics on without a key gets nothing either.
  await enable(page, '');
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
  await page.waitForTimeout(2500);
  expect(requests.filter((request) => /posthog/.test(request.url()))).toEqual([]);
  expect(requests.filter((request) => /\/assets\/runtime-[\w-]+\.js$/.test(request.url()))).toEqual(
    [],
  );
  expect(sent(page)).toEqual([]);
});

test('anonymous statistics arrive personless, and opting out stops them', async ({ page }) => {
  await enable(page);
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Start a career' })).toBeVisible();
  await expect.poll(() => named(page, 'app_loaded').length, { timeout: 15000 }).toBe(1);
  const [first] = sent(page);
  expect(first!.properties).toMatchObject({
    $process_person_profile: false,
    $lib: 'ptg',
    environment: 'ci',
    route: '/',
  });
  expect((page as Analytics).batches[0]!.api_key).toBe('phc_test');
  expect(named(page, 'landing_viewed')[0]!.properties).toMatchObject({ initial: true });
  // One identifier for the page load, held in memory: nothing is stored on the device.
  const ids = new Set(sent(page).map((entry) => entry.properties.distinct_id));
  expect(ids.size).toBe(1);
  expect(await stored(page)).toBeNull();
  const cookies = await page.context().cookies();
  expect(cookies).toEqual([]);

  await mainNav(page)
    .getByRole('link', { name: /Settings/ })
    .click();
  await expect.poll(() => routes(page), { timeout: 10000 }).toContain('/settings');
  const anonymous = page.getByRole('switch', { name: 'Anonymous statistics' });
  await expect(anonymous).toBeChecked();
  await anonymous.uncheck();
  const count = sent(page).length;
  await page.getByRole('link', { name: 'Read the privacy notice' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Privacy' })).toBeVisible();
  await mainNav(page)
    .getByRole('link', { name: /Saved games|Saves/ })
    .click();
  await page.waitForTimeout(1500);
  expect(sent(page).length).toBe(count);
  // The choice is remembered on this device, and a new page load sends nothing either.
  await page.reload();
  await page.waitForTimeout(3000);
  expect(sent(page).length).toBe(count);
  expect(await stored(page)).toMatchObject({ anonymous: false, personal: false });
});

test('sharing play over time adds a stable id stored on the device', async ({ page }) => {
  await enable(page);
  await page.goto('/settings');
  await expect.poll(() => named(page, 'app_loaded').length, { timeout: 15000 }).toBe(1);
  const anonymousId = sent(page)[0]!.properties.distinct_id;
  const personal = page.getByRole('switch', { name: 'Share how you play over time' });
  await expect(personal).not.toBeChecked();
  await personal.check();
  const { installId } = await stored(page);
  expect(installId).toMatch(/^[0-9a-f-]{16,40}$/);
  expect(installId).not.toBe(anonymousId);
  await page.getByRole('link', { name: 'Read the privacy notice' }).click();
  await expect
    .poll(() => named(page, 'route_viewed').at(-1)?.properties, { timeout: 10000 })
    .toMatchObject({ route: '/privacy', distinct_id: installId, $process_person_profile: true });
  // The same id after a reload.
  await page.reload();
  await expect
    .poll(() => named(page, 'app_loaded').at(-1)?.properties.distinct_id, { timeout: 15000 })
    .toBe(installId);
  // Withdrawing deletes the id, and events are personless again.
  await page.goto('/settings');
  await page.getByRole('switch', { name: 'Share how you play over time' }).uncheck();
  expect((await stored(page)).installId).toBeUndefined();
  await mainNav(page)
    .getByRole('link', { name: /Gallery/ })
    .click();
  await expect
    .poll(() => named(page, 'route_viewed').at(-1)?.properties, { timeout: 10000 })
    .toMatchObject({ route: '/gallery', $process_person_profile: false });
  expect(named(page, 'route_viewed').at(-1)!.properties.distinct_id).not.toBe(installId);
});

/** A career waiting at its first matchday, as an exported save file. */
function matchdaySave(): string {
  const seed = 'analytics-browser';
  const base = generateWorld(seed, { format: 'legacy' });
  const trial = trialOffers(base, 'country:0', seed)[0]!;
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
    seed,
  );
  while (!advanceCareerWeek(world, { inPlace: true }).pendingFixtureId);
  return JSON.stringify(
    createSave(1, 'Robin Vale', {
      kind: 'world',
      world,
      gallery: { seed, generation: 0 },
      settings: DEFAULT_SETTINGS,
    }),
  );
}

/** Play the prepared career fixture to full time, choosing the first option each time. */
async function playMatch(page: Page) {
  const state = page.getByTestId('match-state');
  await page.getByRole('button', { name: 'Go to the pre-match briefing', exact: true }).click();
  await page.getByRole('button', { name: 'Kick off', exact: true }).click();
  for (let turns = 0; turns < 120; turns++) {
    const status = await state.getAttribute('data-status');
    if (status === 'finished') return;
    if (status === 'decision') {
      // The invitation never covers a key moment's choices.
      await expect(page.getByRole('heading', { name: 'Help shape the game' })).toHaveCount(0);
      await page.locator('.match-choices button').first().click();
      await expect(state).not.toHaveAttribute('data-status', 'decision');
    } else if (status === 'halftime')
      await page.getByRole('button', { name: /Motivate the team/ }).click();
    else if (await page.getByRole('button', { name: /Accept the change/ }).isVisible())
      await page.getByRole('button', { name: /Accept the change/ }).click();
    else if (await page.getByRole('button', { name: /Keep the team composed/ }).isVisible())
      await page.getByRole('button', { name: /Keep the team composed/ }).click();
    else {
      const pause = page.getByRole('button', { name: 'Pause', exact: true });
      if (await pause.isVisible()) await pause.click();
      await page
        .getByRole('button', { name: 'Next key moment', exact: true })
        .click({ timeout: 3000 })
        .catch(() => {});
    }
  }
  throw new Error('Career match did not reach full time');
}

test('a first finished match brings the funnel, the decisions and one invitation', async ({
  page,
  browserName,
}) => {
  test.setTimeout(300000);
  await enable(page);
  await page.goto('/saves');
  await page
    .locator('.slot-card')
    .nth(0)
    .getByLabel('Import backup — Slot 1')
    .setInputFiles({
      name: 'career.json',
      mimeType: 'application/json',
      buffer: Buffer.from(matchdaySave()),
    });
  await expect(page.locator('.slot-card').nth(0).getByRole('heading')).toHaveText('Robin Vale');
  await page.goto('/match?save=1');
  await playMatch(page);
  await expect(page.getByTestId('career-xp')).toBeVisible({ timeout: 60000 });

  // With the service worker blocked, the app reports it could not register one; the
  // invitation waits for that prompt like any other, and follows once it is dismissed.
  const invitation = page.getByRole('region', { name: 'Help shape the game' });
  const later = page.locator('.pwa-prompt').getByRole('button', { name: 'Dismiss' });
  if (await later.isVisible()) {
    await expect(invitation).toHaveCount(0);
    await later.click();
  }
  await expect(invitation).toBeVisible();
  await expect(invitation.getByRole('link', { name: 'How it works' })).toHaveAttribute(
    'href',
    '/privacy',
  );
  if (browserName === 'chromium') {
    await mkdir('artifacts', { recursive: true });
    // After its short entrance.
    await page.waitForTimeout(400);
    await page.screenshot({ path: 'artifacts/analytics-invitation.png' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: 'artifacts/analytics-invitation-phone.png' });
    await page.setViewportSize({ width: 1280, height: 720 });
  }
  await expect.poll(() => named(page, 'match_result').length, { timeout: 15000 }).toBe(1);
  expect(named(page, 'first_key_moment')).toHaveLength(1);
  expect(named(page, 'match_finished')[0]!.properties).toMatchObject({ count: 1, played: true });
  expect(named(page, 'key_moment').length).toBeGreaterThan(0);
  // Every event carries only allow-listed properties, and nothing typed by the player.
  for (const entry of sent(page)) {
    const allowed = [...EVENTS[entry.event as keyof typeof EVENTS]] as string[];
    for (const key of Object.keys(entry.properties))
      if (!key.startsWith('$') && !allowed.includes(key))
        expect(
          [
            'distinct_id',
            'app_version',
            'schema',
            'engine',
            'world_format',
            'environment',
            'device_class',
            'cores',
            'memory',
            'viewport',
            'input',
            'route',
          ],
          `${entry.event}.${key}`,
        ).toContain(key);
    expect(JSON.stringify(entry), entry.event).not.toMatch(/Robin|analytics-browser/);
  }

  await invitation.getByRole('button', { name: 'Yes, share' }).click();
  await expect(invitation).toHaveCount(0);
  const { installId, prompted } = await stored(page);
  expect(prompted).toBe(true);
  expect(installId).toMatch(/^[0-9a-f-]{16,40}$/);
  await expect
    .poll(() => named(page, 'consent_prompt').at(-1)?.properties.answer, { timeout: 10000 })
    .toBe('accept');
  // Answered once: it never returns on this device.
  await page.reload();
  await expect(
    page
      .getByTestId('career-xp')
      .or(page.getByRole('heading', { level: 1 }))
      .first(),
  ).toBeVisible();
  await page.waitForTimeout(1000);
  await expect(invitation).toHaveCount(0);
});
