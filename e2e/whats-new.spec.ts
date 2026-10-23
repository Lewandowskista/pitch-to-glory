import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { PATCH_NOTES, RELEASE_SECTIONS } from '../src/i18n/patchNotes';
import { whatsNewText } from '../src/i18n/whatsNew';
import { isAbortedLoad, isBrowserNoise, skipTutorial } from './support';

/** Versions and patch notes: the What's new screen and the "Updated" notice. */
const { version } = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };
const latest = PATCH_NOTES[0]!;
const LAST_SEEN = 'ptg-last-version';

test.beforeEach(async ({ page }) => {
  await skipTutorial(page);
  const errors: string[] = [];
  page.on('pageerror', (error) => {
    if (!isAbortedLoad(error.message)) errors.push(error.message);
  });
  page.on('console', (message) => {
    if (message.type() === 'error' && !isBrowserNoise(message))
      errors.push(`${message.text()} (${message.location().url || 'no location'})`);
  });
  (page as typeof page & { runtimeErrors: string[] }).runtimeErrors = errors;
});
test.afterEach(async ({ page }) => {
  expect((page as typeof page & { runtimeErrors: string[] }).runtimeErrors).toEqual([]);
});

test('Settings and the clubhouse lead to What’s new, and Back returns', async ({ page }) => {
  expect(latest.version).toBe(version);
  await page.goto('/settings');
  const about = page.getByRole('region', { name: 'About' });
  await expect(about).toContainText(`Version ${version}`);
  await about.getByRole('link', { name: 'What’s new' }).click();
  await expect(page).toHaveURL(/\/whats-new$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('What’s new');
  await expect(page).toHaveTitle(/^What’s new · Pitch to Glory$/);
  await expect(page.getByText(`You are playing version ${version}`)).toBeVisible();
  const newest = page.getByRole('region', { name: latest.title });
  await expect(newest).toContainText(`Version ${version}`);
  // The first section the release has (sections are optional).
  const section = RELEASE_SECTIONS.find((key) => latest[key]?.length)!;
  await expect(
    newest.getByRole('heading', { level: 3, name: whatsNewText.sections[section] }),
  ).toBeVisible();
  await expect(newest.getByRole('listitem').first()).toHaveText(latest[section]![0]!);
  // Older releases wait behind a disclosure.
  const older = PATCH_NOTES[1]!;
  const disclosure = page.locator('details', { hasText: `${older.version} · ${older.title}` });
  await expect(disclosure).not.toHaveAttribute('open');
  await disclosure.locator('summary').click();
  await expect(disclosure.getByText(older.summary)).toBeVisible();
  // Refreshing keeps the screen; Back returns to where the player came from.
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('What’s new');
  await page.goBack();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Settings');

  await page.goto('/');
  await expect(page.getByText(`Version ${version}`, { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'What’s new' }).click();
  await expect(page).toHaveURL(/\/whats-new$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('What’s new');
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
});

/** Waits until the service worker controls the page, so its first-visit prompt has passed. */
async function installed(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true);
}
const lastSeen = (page: Page) => page.evaluate((key) => localStorage.getItem(key), LAST_SEEN);
const seed = (page: Page, value: string) =>
  page.evaluate(([key, stored]) => localStorage.setItem(key!, stored!), [LAST_SEEN, value]);

test('an update is announced once, after the first visit', async ({ page }) => {
  // Installing the service worker precaches every route first; CI runners can take a while.
  test.setTimeout(90000);
  const notice = page.getByRole('status').filter({ hasText: `Updated to ${version}` });
  // First visit: nothing to announce, and this version is remembered.
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await installed(page);
  await expect.poll(() => lastSeen(page)).toBe(version);
  await expect(notice).toHaveCount(0);

  // A returning player whose browser last ran an older version.
  await seed(page, '0.1.0');
  await page.reload();
  await expect(notice).toBeVisible();
  await notice.getByRole('link', { name: 'See what’s new' }).click();
  await expect(page).toHaveURL(/\/whats-new$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('What’s new');
  await expect(notice).toHaveCount(0);
  expect(await lastSeen(page)).toBe(version);
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await expect(notice).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(notice).toHaveCount(0);

  // Dismissing counts as seen too; the same version never announces itself again.
  await seed(page, '0.1.0');
  await page.reload();
  await expect(notice).toBeVisible();
  await notice.getByRole('button', { name: 'Dismiss' }).click();
  await expect(notice).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(notice).toHaveCount(0);
  expect(await lastSeen(page)).toBe(version);
});
