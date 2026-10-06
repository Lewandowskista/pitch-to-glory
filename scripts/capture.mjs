import { chromium, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
const preview = process.argv[2] ?? 'http://127.0.0.1:4173';
await mkdir('artifacts/visual', { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
for (const [name, url] of [
  ['menu', '/'],
  ['crests', '/gallery'],
  ['kits', '/gallery?view=kits'],
  ['avatars', '/gallery?view=avatars'],
  ['saves', '/saves'],
  ['settings', '/settings'],
  ['world-create', '/world'],
]) {
  await page.goto(`${preview}${url}`);
  await page.waitForLoadState('networkidle');
  if (await page.getByRole('button', { name: 'Dismiss', exact: true }).isVisible())
    await page.getByRole('button', { name: 'Dismiss', exact: true }).click();
  await page.screenshot({ path: `artifacts/visual/${name}-desktop.png`, fullPage: true });
}
await page.goto(`${preview}/world`);
await page.getByRole('button', { name: 'Create world', exact: true }).click();
await page.locator('.standings-table tbody tr').first().waitFor();
await expect(page.getByRole('button', { name: 'Advance week', exact: true })).toBeEnabled();
await page.screenshot({ path: 'artifacts/visual/world-desktop.png', fullPage: true });
await page.screenshot({ path: 'artifacts/visual/world-desktop-viewport.png' });
await page.setViewportSize({ width: 390, height: 844 });
await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
await page.waitForTimeout(200);
await page.screenshot({ path: 'artifacts/visual/world-mobile-dark.png', fullPage: true });
await page.screenshot({ path: 'artifacts/visual/world-mobile-viewport.png' });
await page.setViewportSize({ width: 1440, height: 1100 });
await page.emulateMedia({ colorScheme: 'dark' });
await page.goto(`${preview}/gallery?view=avatars`);
await page.waitForLoadState('networkidle');
await page.screenshot({ path: 'artifacts/visual/avatars-dark.png', fullPage: true });
await page.setViewportSize({ width: 390, height: 844 });
for (const [name, url] of [
  ['menu', '/'],
  ['crests', '/gallery'],
  ['settings', '/settings'],
  ['saves', '/saves'],
]) {
  await page.goto(`${preview}${url}`);
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: `artifacts/visual/${name}-mobile-dark.png`, fullPage: true });
}
console.log('Captured desktop, mobile and dark-theme screens to artifacts/visual.');
await browser.close();
