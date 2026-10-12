import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { skipTutorial } from './support';

for (const layout of [
  { name: 'wide', width: 1920, height: 1080, large: false },
  { name: 'tablet-large', width: 768, height: 1024, large: true },
  { name: 'phone', width: 390, height: 844, large: false },
]) {
  test(`empty Matchday and World have readable action spacing and compact panels · ${layout.name}`, async ({
    page,
    browserName,
  }) => {
    await skipTutorial(page);
    await page.setViewportSize({ width: layout.width, height: layout.height });
    await page.goto('/settings');
    await page.getByRole('radio', { name: 'Dark', exact: true }).check();
    if (layout.large) {
      await page.locator('#font-scale').focus();
      await page.keyboard.press('End');
      await expect(page.locator('#font-scale')).toHaveValue('130');
    }
    await page.goto('/match');
    const empty = page.locator('.match-empty');
    await expect(empty).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    if (layout.large) await expect(page.locator('html')).toHaveAttribute('style', /130%/);
    await page.waitForTimeout(250);
    const gap = await empty.evaluate((panel) => {
      const body = panel.querySelector('p')!.getBoundingClientRect();
      const action = panel.querySelector('a')!.getBoundingClientRect();
      return action.top - body.bottom;
    });
    expect(gap).toBeGreaterThanOrEqual(12);
    await mkdir('artifacts/empty-layout', { recursive: true });
    await page.screenshot({
      path: `artifacts/empty-layout/match-${layout.name}-${browserName}.png`,
    });
    await empty.getByRole('link', { name: 'Open world', exact: true }).click();
    const creation = page.locator('.world-create');
    await expect(creation).toBeVisible();
    await page.waitForTimeout(250);
    const bounds = await creation.evaluate((panel) => {
      const box = panel.getBoundingClientRect();
      const action = panel.querySelector('button')!.getBoundingClientRect();
      return {
        height: box.height,
        actionBottom: action.bottom,
        viewportHeight: innerHeight,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });
    expect(bounds.overflow).toBeLessThanOrEqual(0);
    expect(bounds.actionBottom).toBeLessThan(bounds.viewportHeight - (layout.width < 701 ? 80 : 0));
    if (layout.width > 900) expect(bounds.height).toBeLessThan(360);
    await page.screenshot({
      path: `artifacts/empty-layout/world-${layout.name}-${browserName}.png`,
    });
    await expect(page.getByRole('button', { name: 'Create world', exact: true })).toBeEnabled();
  });
}
