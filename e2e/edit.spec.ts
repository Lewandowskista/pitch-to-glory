import { expect, test, type Page } from '@playwright/test';
import { skipTutorial } from './support';
import { readFileSync } from 'node:fs';
import { generateWorld } from '../src/engine/world/generate';
import { createSave, DEFAULT_SETTINGS } from '../src/persistence/schema';

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

function worldSave(): { json: string; club: string; league: string } {
  const world = generateWorld('edit-browser', { format: 'legacy' });
  const save = createSave(1, 'Edit world', {
    kind: 'world',
    world,
    gallery: { seed: 'edit-browser', generation: 0 },
    settings: DEFAULT_SETTINGS,
  });
  return {
    json: JSON.stringify(save),
    club: world.clubs['club:0:0']!.name,
    league: world.leagues['league:0:1']!.name,
  };
}

test('renames, repaints and recrests, reverts, exports and imports edits', async ({
  page,
  browserName,
}) => {
  test.setTimeout(240000);
  const { json, club, league } = worldSave();
  await page.goto('/saves');
  await page
    .locator('.slot-card')
    .nth(0)
    .getByLabel('Import backup — Slot 1')
    .setInputFiles({ name: 'edit.json', mimeType: 'application/json', buffer: Buffer.from(json) });
  await expect(page.locator('.slot-card').nth(0).getByRole('heading')).toHaveText('Edit world');

  await page.goto('/edit?save=1');
  await expect(page.getByRole('heading', { name: 'No edits yet in this world.' })).toHaveCount(0);
  await expect(page.getByText('No edits yet in this world.')).toBeVisible();

  // A club: search, rename, repaint and draw a new crest.
  await page.getByLabel('Search').fill(club);
  await page.getByRole('button', { name: new RegExp(`^${club}`) }).click();
  await expect(page).toHaveURL(/id=club%3A0%3A0/);
  const editor = page.getByRole('region', { name: club });
  // Retry until the typed name sticks: a slow first load can re-render the form once.
  await expect(async () => {
    await editor.getByLabel('Name', { exact: true }).fill('Red Lions');
    await expect(editor.getByRole('button', { name: 'Save name' })).toBeEnabled({ timeout: 1000 });
  }).toPass();
  await editor.getByRole('button', { name: 'Save name' }).click();
  await expect(page.getByRole('heading', { name: 'Red Lions', level: 2 })).toBeVisible();
  const redLions = page.getByRole('region', { name: 'Red Lions' });
  await expect(redLions.getByText(`Originally ${club}`)).toBeVisible();
  await redLions.getByLabel('Primary colour, hex code').fill('#aa0000');
  await redLions.getByLabel('Secondary colour, hex code').fill('#00aa00');
  await expect(
    redLions.getByText(/look alike with|No distinct kit|distinct for every viewer/).first(),
  ).toBeVisible();
  await redLions.getByLabel('Accent colour, hex code').fill('#zz');
  await expect(redLions.getByRole('alert')).toHaveText('Use six-digit hex codes such as #1a2b3c.');
  await redLions.getByLabel('Accent colour, hex code').fill('#f5f5f5');
  await redLions.getByRole('button', { name: 'Apply colours' }).click();
  await expect(redLions.getByText('Colours applied.')).toBeVisible();
  const crest = await redLions.getByRole('img', { name: 'Red Lions crest' }).getAttribute('src');
  await redLions.getByRole('button', { name: 'Draw a new crest' }).click();
  await expect(redLions.getByText('New crest drawn.')).toBeVisible();
  await expect(redLions.getByRole('img', { name: 'Red Lions crest' })).not.toHaveAttribute(
    'src',
    crest!,
  );

  // Leagues by keyboard: arrow keys move between the tabs.
  await page.getByRole('tab', { name: 'Clubs' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Leagues' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tab', { name: 'Leagues' })).toBeFocused();
  await page.getByLabel('Search').fill(league);
  await page
    .getByRole('button', { name: new RegExp(`^${league}`) })
    .first()
    .click();
  await page
    .getByRole('region', { name: league })
    .getByLabel('Name', { exact: true })
    .fill('Premier Division');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Premier Division', level: 2 })).toBeVisible();

  await expect(page.getByText('1 club · 1 league · 0 players edited')).toBeVisible();
  await page.getByLabel('Search').fill('');
  await page.getByLabel('Edited only').check();
  await expect(page.locator('#edit-results li')).toHaveCount(1);

  // Export, revert, then bring the edits back from the file.
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export edits' }).click();
  const file = await (await download).path();
  const pack = JSON.parse(readFileSync(file!, 'utf8'));
  expect(pack).toMatchObject({ format: 'pitch-to-glory-edits', version: 1 });
  expect(pack.clubs[0]).toMatchObject({ id: 'club:0:0', original: club, name: 'Red Lions' });
  await page.getByRole('tab', { name: 'Clubs' }).click();
  await page.getByRole('button', { name: /^Red Lions/ }).click();
  await page.getByRole('button', { name: 'Revert all changes' }).click();
  await expect(page.getByRole('heading', { name: club, level: 2 })).toBeVisible();
  await expect(page.getByText('0 clubs · 1 league · 0 players edited')).toBeVisible();
  await page.getByLabel('Import an edit file').setInputFiles(file!);
  await expect(page.getByText('Applied 2 edits.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Red Lions', level: 2 })).toBeVisible();
  await page
    .getByLabel('Import an edit file')
    .setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{}') });
  await expect(
    page.getByRole('alert').filter({ hasText: 'not a Pitch to Glory edit file' }),
  ).toBeVisible();

  // Edits are saved with the world.
  await expect(page.getByText('All changes saved').first()).toBeVisible({ timeout: 30000 });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Red Lions', level: 2 })).toBeVisible({
    timeout: 30000,
  });
  await page.goto('/world?save=1');
  await expect(page.getByText('Premier Division').first()).toBeVisible({ timeout: 30000 });

  if (browserName === 'chromium') {
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      await page.goto('/edit?save=1&id=club%3A0%3A0');
      await expect(page.getByRole('heading', { name: 'Red Lions', level: 2 })).toBeVisible();
      expect(await accessibilityViolations(page), scheme).toEqual([]);
    }
    await page.screenshot({ path: 'artifacts/edit-mode.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/edit?save=1&id=club%3A0%3A0');
    await expect(page.getByRole('heading', { name: 'Red Lions', level: 2 })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    await page.screenshot({ path: 'artifacts/edit-mode-mobile.png', fullPage: true });
  }
});
