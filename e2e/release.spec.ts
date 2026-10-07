import { expect, test, type Page } from '@playwright/test';
import { isBrowserNoise, skipTutorial } from './support';
import { siteUrl } from '../site';

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

/**
 * The address this build was configured with (`SITE_URL`, or the default), read from the
 * configuration rather than from the page, so a build that ignored it would fail.
 */
const SITE = siteUrl();

test('share tags point at absolute URLs and a real PNG card', async ({ page, request }) => {
  await page.goto('/');
  const meta = (selector: string) => page.locator(selector).getAttribute('content');
  // Every absolute address on the page is the configured site.
  const absolute = await page.evaluate(() =>
    [...document.querySelectorAll('link[href], meta[content]')]
      .map((node) => node.getAttribute('href') ?? node.getAttribute('content') ?? '')
      .filter((value) => /^https?:\/\//.test(value)),
  );
  expect(absolute.length).toBeGreaterThanOrEqual(4);
  for (const value of absolute) expect(value.startsWith(`${SITE}/`), value).toBe(true);
  expect(await meta('meta[property="og:image"]')).toBe(`${SITE}/share.png`);
  expect(await meta('meta[name="twitter:image"]')).toBe(`${SITE}/share.png`);
  expect(await meta('meta[property="og:url"]')).toBe(`${SITE}/`);
  expect(await meta('meta[name="twitter:card"]')).toBe('summary_large_image');
  expect(await meta('meta[property="og:image:width"]')).toBe('1200');
  expect(await page.locator('link[rel="canonical"]').getAttribute('href')).toBe(`${SITE}/`);
  expect((await meta('meta[name="description"]'))!.length).toBeGreaterThan(80);
  const card = await request.get('/share.png');
  expect(card.status()).toBe(200);
  expect(card.headers()['content-type']).toContain('image/png');
  const bytes = await card.body();
  // PNG signature and 1200×630 in the IHDR chunk.
  expect(bytes.subarray(1, 4).toString()).toBe('PNG');
  expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([1200, 630]);
  const touch = await request.get(
    (await page.locator('link[rel="apple-touch-icon"]').getAttribute('href'))!,
  );
  expect(touch.headers()['content-type']).toContain('image/png');
  expect((await request.get('/robots.txt')).status()).toBe(200);
});

test('the manifest offers SVG and PNG icons and shortcuts', async ({ request }) => {
  const manifest = await (await request.get('/manifest.webmanifest')).json();
  expect(manifest).toMatchObject({ id: '/', start_url: '/', display: 'standalone' });
  const types = manifest.icons.map(
    (icon: { type: string; sizes: string }) => `${icon.type} ${icon.sizes}`,
  );
  expect(types).toEqual(
    expect.arrayContaining(['image/svg+xml any', 'image/png 192x192', 'image/png 512x512']),
  );
  expect(manifest.icons.some((icon: { purpose: string }) => icon.purpose === 'maskable')).toBe(
    true,
  );
  for (const icon of manifest.icons) expect((await request.get(icon.src)).status()).toBe(200);
  expect(manifest.shortcuts.map((s: { url: string }) => s.url)).toEqual(['/career', '/match']);
});

test('pages carry the production security and cache headers', async ({ request }) => {
  const page = await request.get('/career/trophies');
  const headers = page.headers();
  expect(headers['content-security-policy']).toContain("default-src 'self'");
  expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['x-frame-options']).toBe('DENY');
  expect((await request.get('/sw.js')).headers()['cache-control']).toBe('no-cache');
});

test('a first visit to the landing page does not download the save system', async ({ page }) => {
  const scripts: string[] = [];
  page.on('request', (request) => {
    if (request.resourceType() === 'script') scripts.push(new URL(request.url()).pathname);
  });
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Start a career' })).toBeVisible();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);
  // The save system's chunks: the lazily imported API and the session behind it.
  expect(scripts.filter((path) => /\/assets\/(api|session)-[\w-]+\.js$/.test(path))).toEqual([]);
  // It loads on demand: opening Saves brings it in.
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .first()
    .getByRole('link', { name: /Save/ })
    .click();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect
    .poll(() => scripts.some((path) => /\/assets\/(api|session|Saves)-[\w-]+\.js$/.test(path)))
    .toBe(true);
});
