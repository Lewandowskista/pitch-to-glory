import { expect, test, type Page } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { generateWorld } from '../src/engine/world/generate';
import { createSave, DEFAULT_SETTINGS } from '../src/persistence/schema';

let backupPath: string;
let fatiguedBackupPath: string;
test.beforeAll(async ({ browserName }, workerInfo) => {
  const world = generateWorld('match-browser', { format: 'legacy' });
  const save = createSave(1, 'Matchday test', {
    kind: 'world',
    world,
    gallery: { seed: 'match-browser', generation: 0 },
    settings: DEFAULT_SETTINGS,
  });
  await mkdir('artifacts', { recursive: true });
  backupPath = `artifacts/match-start-${browserName}-${workerInfo.workerIndex}.json`;
  await writeFile(backupPath, JSON.stringify(save));
  const tired = structuredClone(world);
  for (const player of Object.values(tired.players)) {
    player.fatigue = 95;
    player.attributes.leadership = player.primaryPosition === 'ST' ? 99 : 40;
  }
  fatiguedBackupPath = `artifacts/match-tired-${browserName}-${workerInfo.workerIndex}.json`;
  await writeFile(
    fatiguedBackupPath,
    JSON.stringify(
      createSave(1, 'Captain match', { ...save.payload, kind: 'world', world: tired }),
    ),
  );
});
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
async function prepare(page: Page, keeper = false, tired = false) {
  await page.goto('/saves');
  await page
    .locator('.slot-card')
    .nth(0)
    .getByLabel('Import backup — Slot 1')
    .setInputFiles(tired ? fatiguedBackupPath : backupPath);
  await expect(page.locator('.notice')).toHaveText('Collection imported.', { timeout: 30000 });
  await page
    .getByRole('navigation')
    .first()
    .getByRole('link', { name: 'Matchday', exact: true })
    .click();
  const select = page.getByRole('combobox', { name: 'Your footballer', exact: true });
  await expect(select).toBeVisible();
  await expect(select.locator('option')).toHaveCount(22);
  const player = await select
    .locator('option')
    .evaluateAll(
      (options, position) =>
        (
          options.find((option) => option.textContent?.endsWith(position)) as
            HTMLOptionElement | undefined
        )?.value,
      keeper ? 'GK' : 'ST',
    );
  expect(player).toBeTruthy();
  await select.selectOption(player!);
  await page.getByRole('button', { name: 'Prepare match', exact: true }).click();
  await expect(page.getByTestId('match-state')).toHaveAttribute('data-status', 'preview');
}
async function pause(page: Page) {
  const control = page.getByRole('button', { name: 'Pause', exact: true });
  if (await control.isVisible()) await control.click();
}
async function finish(page: Page) {
  for (let turns = 0; turns < 45; turns++) {
    const status = await page.getByTestId('match-state').getAttribute('data-status');
    if (status === 'finished') return;
    if (status === 'decision') await page.locator('.match-choices button').first().click();
    else if (status === 'halftime')
      await page.getByRole('button', { name: /Motivate the team/ }).click();
    else if (await page.getByRole('button', { name: /Accept the change/ }).isVisible())
      await page.getByRole('button', { name: /Accept the change/ }).click();
    else if (await page.getByRole('button', { name: /Keep the team composed/ }).isVisible())
      await page.getByRole('button', { name: /Keep the team composed/ }).click();
    else {
      await pause(page);
      await page.getByRole('button', { name: 'Next key moment', exact: true }).click();
    }
  }
  throw new Error('Match failed to reach full-time within bounded decisions');
}
test('plays a saved match through keyboard decisions, refresh, half-time and the report', async ({
  page,
  browserName,
}) => {
  test.setTimeout(120000);
  await prepare(page);
  await page.getByRole('button', { name: 'Kick off', exact: true }).click();
  await pause(page);
  await page.getByRole('button', { name: 'Next key moment', exact: true }).click();
  await expect(page.getByTestId('match-state')).toHaveAttribute('data-status', 'decision');
  // A new key moment is announced politely and focus moves to its first choice.
  await expect(page.getByLabel('Live match updates', { exact: true })).toContainText('Key moment');
  await expect(page.locator('.match-choices button').first()).toBeFocused();
  await expect(page.locator('.match-choice-hint').first()).toContainText('Uses');
  const minute = await page.getByTestId('match-state').getAttribute('data-minute');
  await expect(page.locator('.save-indicator')).toHaveText('All changes saved', { timeout: 30000 });
  await page.reload();
  await expect(page.getByTestId('match-state')).toHaveAttribute('data-status', 'decision', {
    timeout: 30000,
  });
  await expect(page.getByTestId('match-state')).toHaveAttribute('data-minute', minute!);
  await page.locator('.match-choices button').first().focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.match-choices button').nth(1)).toBeFocused();
  await page.keyboard.press('1');
  await expect(page.getByTestId('match-state')).toHaveAttribute('data-status', 'live');
  await expect(page.locator('.match-outcome')).toContainText('Relevant attribute');
  await expect(page.locator('.match-outcome')).toContainText('Opposition quality');
  await expect(page.locator('.match-outcome')).toContainText('Fatigue');
  await page.screenshot({ path: `artifacts/match-live-${browserName}.png`, fullPage: true });
  await finish(page);
  await expect(page.getByRole('heading', { name: 'Your match report', exact: true })).toBeVisible();
  await expect(page.getByRole('img', { name: /^Movement heatmap:/ })).toBeVisible();
  await expect(page.getByRole('img', { name: /^Pass map:/ })).toBeVisible();
  await expect(page.getByRole('img', { name: /^Shot map:/ })).toBeVisible();
  await expect(page.locator('.save-indicator')).toHaveText('All changes saved', { timeout: 30000 });
  await page.reload();
  await expect(page.getByTestId('match-state')).toHaveAttribute('data-status', 'finished', {
    timeout: 30000,
  });
  await expect(page.locator('.match-rewards')).toHaveCSS('opacity', '1');
  await page.screenshot({ path: `artifacts/match-report-${browserName}.png`, fullPage: true });
  await page
    .getByRole('navigation')
    .first()
    .getByRole('link', { name: 'Save collections', exact: true })
    .click();
  const download = page.waitForEvent('download');
  await page.locator('.slot-card').first().getByRole('button', { name: 'Export backup' }).click();
  const saved = JSON.parse(await readFile((await (await download).path())!, 'utf8'));
  expect(saved.schemaVersion).toBe(6);
  expect(saved.payload.matchSession.state.match.status).toBe('finished');
  expect(
    saved.payload.matchSession.commands.some(
      (command: { type: string }) => command.type === 'halftime',
    ),
  ).toBe(true);
  expect(saved.payload.world.results).toEqual({});
});
test('keeper decisions work in simulation-only mode with large mobile text', async ({
  page,
  browserName,
}) => {
  test.setTimeout(120000);
  await prepare(page, true);
  await page
    .getByRole('navigation')
    .first()
    .getByRole('link', { name: 'Settings', exact: true })
    .click();
  await page.getByRole('switch', { name: 'Simulation only', exact: true }).check();
  await page.getByRole('radio', { name: 'Dark', exact: true }).check();
  await page.getByLabel('Text size', { exact: true }).focus();
  await page.keyboard.press('End');
  await page
    .getByRole('navigation')
    .first()
    .getByRole('link', { name: 'Matchday', exact: true })
    .click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Kick off', exact: true }).click();
  await pause(page);
  await page.getByRole('button', { name: 'Next key moment', exact: true }).click();
  // Keeper situations are seeded: shot, one-on-one, cross or distribution.
  await expect(page.locator('#decision-heading')).toHaveText(
    /shot is coming|through on goal|cross is swinging|ball is in your hands/,
  );
  expect(await page.locator('.match-choices button').count()).toBeGreaterThanOrEqual(2);
  await expect(page.locator('canvas')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: `artifacts/match-mobile-${browserName}.png`, fullPage: true });
  await finish(page);
  await expect(page.getByRole('heading', { name: 'Your match report', exact: true })).toBeVisible();
});
test('playback pauses when hidden and the pitch survives resize and context loss', async ({
  page,
  browserName,
}) => {
  test.setTimeout(90000);
  await prepare(page);
  await page.getByRole('button', { name: 'Kick off', exact: true }).click();
  await pause(page);
  await page.locator('main').focus();
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  const minute = await page.getByTestId('match-state').getAttribute('data-minute');
  await page.waitForTimeout(1200);
  await expect(page.getByTestId('match-state')).toHaveAttribute('data-minute', minute!);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  await page.setViewportSize({ width: 760, height: 900 });
  if (browserName === 'chromium') {
    await expect(page.locator('canvas')).toHaveCount(1, { timeout: 20000 });
    await page
      .locator('canvas')
      .evaluate((canvas) =>
        canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true })),
      );
    await expect(
      page.getByText('Using the accessible pitch view.', { exact: false }),
    ).toBeVisible();
  }
  await page.getByRole('button', { name: 'Next key moment', exact: true }).click();
  await expect(page.getByTestId('match-state')).toHaveAttribute('data-status', 'decision');
});
test('captain and substitution responses stop skip before completing the match', async ({
  page,
}) => {
  test.setTimeout(120000);
  await prepare(page, false, true);
  await page.getByRole('button', { name: 'Kick off', exact: true }).click();
  await pause(page);
  let captain = false;
  let substitution = false;
  for (let turns = 0; turns < 45; turns++) {
    const status = await page.getByTestId('match-state').getAttribute('data-status');
    if (status === 'finished') break;
    if (status === 'decision') await page.locator('.match-choices button').first().click();
    else if (status === 'halftime')
      await page.getByRole('button', { name: /Motivate the team/ }).click();
    else if (await page.getByRole('button', { name: /Keep the team composed/ }).isVisible()) {
      captain = true;
      await expect(
        page.getByRole('button', { name: 'Next key moment', exact: true }),
      ).toBeDisabled();
      await page.getByRole('button', { name: /Keep the team composed/ }).click();
    } else if (await page.getByRole('button', { name: /Accept the change/ }).isVisible()) {
      substitution = true;
      await expect(page.getByTestId('match-state')).toHaveAttribute('data-minute', '65');
      await expect(
        page.getByRole('button', { name: 'Next key moment', exact: true }),
      ).toBeDisabled();
      await page.getByRole('button', { name: /Encourage your teammates/ }).click();
    } else await page.getByRole('button', { name: 'Next key moment', exact: true }).click();
  }
  expect(captain).toBe(true);
  expect(substitution).toBe(true);
  await expect(page.getByTestId('match-state')).toHaveAttribute('data-status', 'finished');
  await expect(page.getByRole('heading', { name: 'Your match report', exact: true })).toBeVisible();
});
