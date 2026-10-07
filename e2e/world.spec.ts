import { expect, test, type Page } from '@playwright/test';
import { isBrowserNoise, skipTutorial } from './support';
import { mkdir, readFile } from 'node:fs/promises';

test.beforeEach(async ({ page }) => {
  await skipTutorial(page);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (entry) => {
    if (entry.type() === 'error' && !isBrowserNoise(entry)) errors.push(entry.text());
  });
  await page.addInitScript(() => {
    window.addEventListener('unhandledrejection', (event) => {
      throw new Error(String(event.reason));
    });
  });
  (page as Page & { errors: string[] }).errors = errors;
});
test.afterEach(async ({ page }) => {
  expect((page as Page & { errors: string[] }).errors).toEqual([]);
});
async function generate(page: Page, seed = 'browser-world') {
  await page.goto('/world');
  await page.getByLabel('World seed', { exact: true }).fill(seed);
  await page.getByRole('button', { name: 'Create world', exact: true }).click();
  await expect(page.locator('.standings-table tbody tr')).toHaveCount(20, { timeout: 30000 });
  await expect(page.getByRole('button', { name: 'Advance week', exact: true })).toBeEnabled();
}
test('generates a world and browses real countries, divisions, clubs and squads', async ({
  page,
  browserName,
}) => {
  await generate(page);
  if (browserName === 'chromium') {
    await mkdir('artifacts', { recursive: true });
    await page.screenshot({ path: 'artifacts/world-national-desktop.png', fullPage: true });
  }
  await expect(page.locator('.world-facts')).toContainText('959');
  await expect(page.locator('.world-facts')).toContainText('21,098');
  await expect(page.locator('.world-facts')).toContainText('52');
  await page.getByLabel('Division', { exact: true }).selectOption('6');
  await expect(page.locator('.standings-table tbody tr')).toHaveCount(24);
  await expect(page.getByLabel('Group', { exact: true }).locator('option')).toHaveCount(2);
  await expect(page.locator('.rules-reference')).toHaveText(
    'Real-world model: National League North/South · 2026/27 rules',
  );
  // Read South's id from its option, not from the select mid-update.
  const southGroup = (await page
    .getByLabel('Group', { exact: true })
    .locator('option', { hasText: 'South' })
    .getAttribute('value'))!;
  await page.getByLabel('Group', { exact: true }).selectOption({ label: 'South' });
  await expect(page).toHaveURL(new RegExp(`group=${encodeURIComponent(southGroup)}(&|$)`));
  await expect(page.locator('.standings-table caption')).toContainText('South');
  await page.goBack();
  await expect(page.getByLabel('Group', { exact: true }).locator('option:checked')).toHaveText(
    'North',
  );
  await page.goForward();
  await expect(page).toHaveURL(new RegExp(`group=${encodeURIComponent(southGroup)}(&|$)`));
  await expect(page.getByLabel('Group', { exact: true })).toHaveValue(southGroup);
  // Fast input events must merge against the pending route, even before React renders it.
  await page.evaluate(() => {
    const country = document.querySelector<HTMLSelectElement>('#world-country')!;
    const division = document.querySelector<HTMLSelectElement>('#world-tier')!;
    country.value = 'country:2';
    country.dispatchEvent(new Event('change', { bubbles: true }));
    division.value = '4';
    division.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect(page.locator('.rules-reference')).toHaveText(
    'Real-world model: Segunda Federación · 2026/27 rules',
  );
  await expect(page).toHaveURL(/country=.*tier=4/);
  await page.locator('.standings-table tbody tr').nth(2).getByRole('button').click();
  await expect(page.locator('.squad-table tbody tr')).toHaveCount(22);
  await expect(page.locator('.club-kits img')).toHaveCount(3);
  await page.getByRole('tab', { name: 'Fixtures', exact: true }).click();
  await expect(page).toHaveURL(/view=fixtures/);
  await expect(page.locator('.fixture-row')).toHaveCount(9);
  await page.getByRole('tab', { name: 'Domestic cup', exact: true }).click();
  await expect(page.locator('.fixture-row')).toHaveCount(44);
  await page.getByLabel('Country', { exact: true }).selectOption({ label: 'Italy' });
  await expect(page.locator('.rules-reference')).toHaveText(
    'Real-world model: Serie A · 2026/27 rules',
  );
  await page.getByLabel('Division', { exact: true }).selectOption('4');
  await expect(page.getByLabel('Group', { exact: true }).locator('option')).toHaveCount(9);
  await page
    .getByLabel('Cup competition', { exact: true })
    .selectOption({ label: 'Terza Serie Cup' });
  await expect(page).toHaveURL(/competition=/);
  await expect(page.locator('.view-heading h2')).toHaveText('Terza Serie Cup');
  await expect(page.locator('.fixture-row')).toHaveCount(28);
  await page.getByLabel('Country', { exact: true }).selectOption({ label: 'Germany' });
  await expect(page.locator('.rules-reference')).toHaveText(
    'Real-world model: Bundesliga · 2026/27 rules',
  );
  await page.getByLabel('Division', { exact: true }).selectOption('4');
  await page.getByRole('tab', { name: 'League table', exact: true }).click();
  await page.getByLabel('Group', { exact: true }).selectOption({ label: 'Nord' });
  await expect(page.locator('.table-legend')).toContainText('Regional promotion playoff');
  await page.getByLabel('Group', { exact: true }).selectOption({ label: 'Nordost' });
  await expect(page.locator('.table-legend')).toContainText('Automatic promotion');
});
test('worker advances, autosaves, finishes and rolls over a reproducible season', async ({
  page,
  browserName,
}) => {
  test.setTimeout(360000);
  await generate(page, 'season-roundtrip');
  await page.getByRole('link', { name: 'Save this world', exact: true }).click();
  await page.getByLabel('Collection name').fill('Season world');
  await page
    .locator('.slot-card')
    .first()
    .getByRole('button', { name: 'Save world', exact: true })
    .click();
  await page.getByRole('link', { name: 'Open world', exact: true }).click();
  await page.getByRole('button', { name: 'Advance week', exact: true }).click();
  await expect(page.locator('.world-date')).toContainText('Week 2', { timeout: 30000 });
  await expect(page.locator('.standings-table tbody tr').first()).toContainText('3');
  if (browserName === 'chromium') {
    await page.evaluate(() => {
      let last = performance.now(),
        maximumFrameGap = 0,
        frameCount = 0,
        stopped = false;
      const longTasks: number[] = [];
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) longTasks.push(entry.duration);
      });
      if (PerformanceObserver.supportedEntryTypes.includes('longtask'))
        observer.observe({ type: 'longtask', buffered: false });
      const frame = (now: number) => {
        maximumFrameGap = Math.max(maximumFrameGap, now - last);
        last = now;
        frameCount++;
        if (!stopped) requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
      (window as Window & { stopWorldMeasurement?: () => object }).stopWorldMeasurement = () => {
        stopped = true;
        observer.disconnect();
        return {
          maximumFrameGap,
          frameCount,
          longTaskCount: longTasks.length,
          maximumLongTask: Math.max(0, ...longTasks),
        };
      };
    });
  }
  await page.getByRole('button', { name: 'Finish season', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Start next season', exact: true })).toBeVisible({
    timeout: 300000,
  });
  if (browserName === 'chromium')
    console.log(
      'Season worker responsiveness:',
      await page.evaluate(() =>
        (window as Window & { stopWorldMeasurement?: () => object }).stopWorldMeasurement?.(),
      ),
    );
  await expect(page.locator('.season-summary')).toContainText('Confirmed league movement');
  await page.getByRole('link', { name: 'Save this world', exact: true }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.locator('.slot-card').first().getByRole('button', { name: 'Export backup' }).click();
  const backupPath = (await (await downloadPromise).path())!;
  const json = await readFile(backupPath, 'utf8');
  console.log(`Completed-season backup: ${Buffer.byteLength(json, 'utf8')} bytes`);
  const saved = JSON.parse(json);
  expect(saved.schemaVersion).toBe(13);
  expect(saved.payload.kind).toBe('world');
  expect(saved.payload.world.phase).toBe('complete');
  expect(saved.payload.world.history).toHaveLength(1);
  expect(saved.payload.world.format).toBe('national-v1');
  expect(Object.keys(saved.payload.world.pyramid.phases).length).toBeGreaterThan(0);
  expect(
    Object.values(saved.payload.world.pyramid.ties).every(
      (tie) => (tie as { status: string }).status === 'complete',
    ),
  ).toBe(true);
  await page
    .locator('.slot-card')
    .nth(1)
    .getByLabel('Import backup — Slot 2')
    .setInputFiles(backupPath);
  await expect(page.locator('.notice')).toHaveText('Collection imported.', { timeout: 60000 });
  await expect(page.locator('.slot-card').nth(1).locator('.active-label')).toBeVisible();
  await page.reload();
  await page
    .locator('.slot-card')
    .first()
    .getByRole('button', { name: 'Load world', exact: true })
    .click();
  await page.getByRole('link', { name: 'Open world', exact: true }).click();
  await expect(page).toHaveURL(/save=1/);
  await page.goto('/world?save=1&country=country%3A2&tier=2.5&view=cup&stage=1.5');
  await expect(page.getByLabel('Country', { exact: true })).toHaveValue('country:2');
  await expect(page.getByLabel('Division', { exact: true })).toHaveValue('1');
  await expect(page.locator('.fixture-row')).toHaveCount(1);
  await page.getByRole('button', { name: 'Start next season', exact: true }).click();
  await expect(page.locator('.world-date')).toContainText('2027', { timeout: 30000 });
  await expect(page.locator('.world-date')).toContainText('Week 1');
  await page.getByRole('tab', { name: 'Season history', exact: true }).click();
  await expect(page.locator('.history-view')).toContainText('2026');
  await page.getByLabel('Country', { exact: true }).selectOption({ label: 'Portugal' });
  await expect(page.locator('.rules-reference')).toHaveText(
    'Real-world model: Liga Portugal · 2026/27 rules',
  );
  await page.getByLabel('Division', { exact: true }).selectOption('3');
  await expect(page.locator('.history-view .postseason-view')).toBeVisible();
  await page
    .getByLabel('Phase or tie', { exact: true })
    .selectOption({ label: 'Portuguese Terceira promotion league' });
  await expect(page).toHaveURL(/postseason=phase/);
  await expect(
    page.locator('.history-view .postseason-view .standings-table tbody tr'),
  ).toHaveCount(8);
  await expect(page.locator('.history-view .postseason-meta')).toContainText('Complete');
});
test('mobile world preserves full statistics at large text sizes', async ({
  page,
  browserName,
}) => {
  await generate(page, 'mobile-world');
  await page.locator('.sidebar').getByRole('link', { name: 'Settings', exact: true }).click();
  await page.getByRole('radio', { name: 'Dark', exact: true }).check();
  await page.getByLabel('Text size', { exact: true }).focus();
  await page.keyboard.press('End');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.bottom-nav').getByRole('link', { name: 'World', exact: true }).click();
  await page.getByRole('button', { name: 'Show all statistics', exact: true }).click();
  await expect(
    page.locator('.standings-table').getByRole('columnheader', { name: 'Goals for', exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.locator('.squad-table tbody tr')).toHaveCount(22);
  await page.getByLabel('Country', { exact: true }).selectOption({ label: 'Italy' });
  await expect(page.locator('.rules-reference')).toHaveText(
    'Real-world model: Serie A · 2026/27 rules',
  );
  await page.getByLabel('Division', { exact: true }).selectOption('4');
  await page.getByLabel('Group', { exact: true }).selectOption({ label: 'Girone I' });
  await expect(page.locator('.standings-table caption')).toContainText('Girone I');
  await page.locator('.competition-rules summary').click();
  await expect(page.locator('.rule-sources a').first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  if (browserName === 'chromium')
    await page.screenshot({ path: 'artifacts/world-national-mobile.png', fullPage: true });
});
test('season simulation can be cancelled and resumed without freezing navigation', async ({
  page,
}) => {
  await generate(page, 'cancel-world');
  await page.getByRole('button', { name: 'Finish season', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Cancel simulation', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel simulation', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Advance week', exact: true })).toBeEnabled({
    timeout: 30000,
  });
  await expect(page.locator('.world-notice')).toContainText('cancelled');
  await page.getByRole('button', { name: 'Advance week', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Advance week', exact: true })).toBeEnabled({
    timeout: 30000,
  });
});
test('world worker and route work offline after a connected visit', async ({
  page,
  context,
  browserName,
}) => {
  await page.goto('/');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true);
  await context.setOffline(true);
  if (browserName === 'webkit') {
    const cached = await page.evaluate(async () => {
      for (const key of await caches.keys()) {
        const cache = await caches.open(key);
        const urls = await cache.keys();
        const worker = urls.find((request) => /world\.worker-.*\.js/.test(request.url));
        const route = urls.find((request) => /\/World-.*\.js/.test(request.url));
        if (worker && route) {
          const workerResponse = await cache.match(worker),
            routeResponse = await cache.match(route);
          if (
            workerResponse?.ok &&
            routeResponse?.ok &&
            (await workerResponse.text()).length > 0 &&
            (await routeResponse.text()).length > 0
          )
            return true;
        }
      }
      return false;
    });
    expect(cached).toBe(true);
  } else {
    await page.locator('.sidebar').getByRole('link', { name: 'World', exact: true }).click();
    await page.getByLabel('World seed', { exact: true }).fill('offline-world');
    await page.getByRole('button', { name: 'Create world', exact: true }).click();
    await expect(page.locator('.standings-table tbody tr')).toHaveCount(20, { timeout: 30000 });
    await page.getByRole('button', { name: 'Advance week', exact: true }).click();
    await expect(page.locator('.world-date')).toContainText('Week 2', { timeout: 30000 });
  }
  await context.setOffline(false);
});
