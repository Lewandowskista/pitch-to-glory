import { expect, test, type Page } from '@playwright/test';
import { isBrowserNoise, skipTutorial, openCareerPage, careerTabs } from './support';
import { readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { generateWorld } from '../src/engine/world/generate';
import { createCareer, trialOffers } from '../src/engine/career/create';
import { advanceCareerWeek } from '../src/engine/career/season';
import { chronicle, encodeClip, momentLink } from '../src/engine/career/honours';
import { createSave, DEFAULT_SETTINGS } from '../src/persistence/schema';
import type { Moment, World } from '../src/model/domain';

test.beforeEach(async ({ page }) => {
  await skipTutorial(page);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (entry) => {
    if (entry.type() === 'error' && !isBrowserNoise(entry)) errors.push(entry.text());
  });
  (page as Page & { errors: string[] }).errors = errors;
  // No system share sheet in tests: links are copied, files downloaded.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
    Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          (window as unknown as { copied: string }).copied = text;
        },
      },
    });
  });
});
test.afterEach(async ({ page }) => {
  expect((page as Page & { errors: string[] }).errors).toEqual([]);
});
test.use({ actionTimeout: 15000 });

const axeSource = readFileSync('node_modules/axe-core/axe.min.js', 'utf8');
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
            violations: {
              id: string;
              impact: string;
              nodes: { target: string[]; html: string }[];
            }[];
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
          `${violation.id}: ${violation.nodes.map((n) => `${n.target.join(' ')} ${n.html}`).join(', ')}`,
      );
  });
}

const MOMENT_CLIP = encodeClip({
  selected: 9,
  frames: [0, 1, 2].map((frame) => ({
    ball: { x: 60 + frame * 15, y: 48 + frame },
    players: Array.from({ length: 22 }, (_, index) => ({
      x: index < 11 ? 20 + index * 6 + frame * 3 : 30 + (index - 11) * 6 - frame * 2,
      y: ((index * 17 + frame * 4) % 90) + 5,
    })),
  })),
});

/**
 * A full engine-played season ending with the career player at 34: awards, a Golden Ball,
 * Chronicle entries and a saved moment, ready to retire.
 */
let cached: { json: string; link: string } | undefined;
function honoursSave() {
  if (cached) return cached;
  const base = generateWorld('honours-browser', { format: 'legacy' });
  const trial = trialOffers(base, 'country:0', 'honours-browser')[0]!;
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
    'honours-browser',
  );
  while (world.phase === 'active')
    world = advanceCareerWeek(world, { inPlace: true, autoPlay: true }).world;
  const player = world.players[world.career!.playerId]!;
  player.birthSeason = world.date.season - 34;
  const club = world.clubs[player.clubId!]!;
  const moment: Moment = {
    id: 'moment:browser',
    playerId: player.id,
    date: { ...world.date },
    kind: 'winner',
    minute: 90,
    scorerName: player.name,
    home: { name: club.name, color: club.kits.home.colors[0] },
    away: { name: 'Mill Lane', color: '#cc2200' },
    score: [2, 1],
    seed: 'honours-browser:moment',
    clip: MOMENT_CLIP,
  };
  world.moments.push(moment);
  chronicle(
    world,
    'moment',
    { opponent: 'Mill Lane', kind: 'winner', minute: 90 },
    { momentId: moment.id },
  );
  const save = createSave(1, 'Honours career', {
    kind: 'world',
    world,
    gallery: { seed: 'honours-browser', generation: 0 },
    settings: DEFAULT_SETTINGS,
  });
  cached = { json: JSON.stringify(save), link: momentLink(moment) };
  return cached;
}

test('celebrates a career, shares a moment, retires and starts the next generation', async ({
  page,
  browserName,
}) => {
  test.setTimeout(300000);
  const { json, link } = honoursSave();
  await page.goto('/saves');
  await page
    .locator('.slot-card')
    .nth(0)
    .getByLabel('Import backup — Slot 1')
    .setInputFiles({
      name: 'honours.json',
      mimeType: 'application/json',
      buffer: Buffer.from(json),
    });
  await expect(page.locator('.slot-card').nth(0).getByRole('heading')).toHaveText('Honours career');

  // The hub offers retirement once the season is over.
  await page.goto('/career?save=1');
  const honours = page.getByRole('region', { name: 'Honours' });
  await expect(honours.getByText(/You can retire now/)).toBeVisible();

  // The Golden Ball ceremony lives in the URL: back closes it.
  await openCareerPage(page, 'Trophies');
  await page.getByRole('button', { name: 'Watch the ceremony' }).click();
  await expect(page).toHaveURL(/ceremony=/);
  const ceremony = page.getByRole('region', { name: /Golden Ball \d+/ });
  await expect(ceremony.getByRole('listitem')).toHaveCount(9);
  await page.getByRole('button', { name: 'Reveal the winner' }).click();
  await expect(ceremony.getByRole('listitem')).toHaveCount(10);
  await expect(ceremony.getByRole('status')).toContainText(/You (finished|were not)/);
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Your cabinet' })).toBeVisible();

  // The Chronicle reads like a biography and exports as an image.
  await openCareerPage(page, 'Chronicle');
  await expect(page.getByText(/signs for .* after a trial/)).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export as image' }).click();
  expect((await download).suggestedFilename()).toBe('robin-vale-chronicle.png');
  await expect(page.getByText('Image ready.')).toBeVisible();

  // A moment is replayed and shared as a link that works without the save.
  await page.getByRole('link', { name: 'Watch the moment' }).last().click();
  await expect(page).toHaveURL(/\/career\/moments\?.*moment=/);
  const card = page.locator('[id="moment-moment:browser"]');
  await expect(
    card.getByRole('img', { name: 'Replay of Robin Vale’s goal, minute 90' }),
  ).toBeVisible();
  await card.getByRole('button', { name: 'Replay' }).click();
  await card.getByRole('button', { name: 'Share link' }).click();
  await expect(card.getByText('Link copied.')).toBeVisible();
  const copied = await page.evaluate(() => (window as unknown as { copied: string }).copied);
  expect(copied).toContain(`/moment#${link}`);

  const viewer = await page.context().newPage();
  await viewer.goto(`/moment#${link}`);
  await expect(viewer.getByRole('heading', { name: 'Late winner · Robin Vale' })).toBeVisible();
  await expect(viewer.getByRole('img', { name: /Replay of Robin Vale’s goal/ })).toBeVisible();
  await viewer.goto(`/moment#${link.slice(0, 40)}`);
  await expect(viewer.getByRole('alert')).toHaveText('This replay link is incomplete or damaged.');
  await viewer.close();

  if (browserName === 'chromium') {
    await mkdir('artifacts', { recursive: true });
    for (const path of ['trophies', 'chronicle', 'moments', 'national']) {
      await page.goto(`/career/${path}?save=1`);
      await expect(careerTabs(page)).toBeVisible({ timeout: 30000 });
      await page.screenshot({ path: `artifacts/career-${path}.png`, fullPage: true });
    }
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      for (const path of [
        '/career/trophies?save=1',
        '/career/trophies?save=1&ceremony=' + (await ceremonySeason(page)),
        '/career/chronicle?save=1',
        '/career/moments?save=1',
        '/career/national?save=1',
        '/career?save=1',
        `/moment#${link}`,
      ]) {
        await page.goto(path);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        expect(await accessibilityViolations(page), `${scheme} ${path}`).toEqual([]);
      }
    }
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'no-preference' });
  }

  // Retire: the career becomes a legacy, and the next generation can start.
  await page.goto('/career?save=1');
  await page
    .getByRole('region', { name: 'Honours' })
    .getByRole('button', { name: 'Retire' })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Retire now?' });
  await dialog.getByRole('button', { name: 'Retire' }).click();
  await expect(page).toHaveURL(/\/career\/legacy/);
  await expect(page.getByText('Your career has ended')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Robin Vale', level: 2 })).toBeVisible();
  await expect(page.getByText(/players in this world’s history/)).toBeVisible();
  await expect(page.getByText(/Retires at 34/)).toBeVisible();

  // Retirement is saved: a refresh lands on the legacy, not a career.
  await expect(page.getByText('All changes saved').first()).toBeVisible({ timeout: 30000 });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Robin Vale', level: 2 })).toBeVisible({
    timeout: 30000,
  });

  if (browserName === 'chromium') {
    await page.screenshot({ path: 'artifacts/career-legacy.png', fullPage: true });
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      for (const path of ['/career/legacy?save=1', '/career?save=1']) {
        await page.goto(path);
        await expect(page.getByRole('heading', { name: 'Robin Vale', level: 2 })).toBeVisible({
          timeout: 30000,
        });
        expect(await accessibilityViolations(page), `${scheme} ${path}`).toEqual([]);
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    for (const path of ['/career/legacy?save=1', '/career?save=1', `/moment#${link}`]) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, path).toBeLessThanOrEqual(0);
    }
    await page.setViewportSize({ width: 1280, height: 800 });
  }

  await page.goto('/career/legacy?save=1');
  await page.getByRole('link', { name: 'Play as Robin Vale’s child' }).click();
  await expect(page).toHaveURL(/\/career\/new\?.*parent=/);
  await expect(page.getByText('Child of Robin Vale')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Player name' })).toHaveValue('Vale');
  await expect(page.getByRole('group', { name: 'Nationality' }).getByRole('radio')).toHaveCount(1);

  // The child wizard continues this saved world through refreshes and history moves.
  await expect(page).toHaveURL(/save=1/);
  const childStep = (step: string) => {
    const url = new URL(page.url());
    url.searchParams.set('step', step);
    return url.toString();
  };
  const trialUrl = childStep('trial');
  const confirmUrl = childStep('confirm');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page).toHaveURL(/step=appearance/);
  await page.reload();
  await expect(page).toHaveURL(/step=appearance/);
  await expect(page.getByRole('button', { name: 'Randomise look', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page).toHaveURL(/step=position/);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page).toHaveURL(/step=world/);
  await expect(page.getByText('Use the loaded world')).toBeVisible();
  await expect(page.getByText(/It autosaves to slot 1\./)).toBeVisible();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  const trialHeading = page.getByRole('heading', { name: 'Three clubs want a look at you.' });
  await expect(trialHeading).toBeVisible();
  await page.reload();
  await expect(trialHeading).toBeVisible({ timeout: 30000 });
  await expect(page).toHaveURL(/step=trial/);
  await expect(page).toHaveURL(/parent=/);

  // Another tab holding the slot sees a recoverable error, never a replacement world.
  const other = await page.context().newPage();
  await other.goto(trialUrl);
  await expect(other.getByRole('alert')).toContainText('open in another tab');
  await expect(other.getByRole('button', { name: 'Try again' })).toBeVisible();
  await expect(other.getByRole('button', { name: 'Build world' })).toHaveCount(0);
  await other.close();

  await page.locator('input[name="trial"]').first().check({ force: true });
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  const confirm = page.getByRole('heading', { name: 'Ready to sign?' });
  await expect(confirm).toBeVisible();
  await page.reload();
  await expect(confirm).toBeVisible({ timeout: 30000 });
  await page.goBack();
  await expect(trialHeading).toBeVisible();
  await page.goForward();
  await expect(confirm).toBeVisible();
  await page.getByRole('button', { name: /^Sign for / }).click();
  await expect(page).toHaveURL(/\/career\?save=1$/, { timeout: 60000 });
  await expect(page.getByRole('heading', { name: 'Career hub', exact: true })).toBeVisible();

  // The child joined the parent's world; the wizard cannot sign them a second time.
  await expect(page.getByText('All changes saved').first()).toBeVisible({ timeout: 30000 });
  await page.goto('/career/legacy?save=1');
  await expect(page.getByText('Their child is already playing.')).toBeVisible();
  await page.goto(confirmUrl);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Sign for / })).toHaveCount(0);
});

/** The season of the latest Golden Ball, read from the cabinet's ceremony button target. */
async function ceremonySeason(page: Page): Promise<string> {
  await page.goto('/career/trophies?save=1');
  const heading = await page
    .getByRole('heading', { name: /Golden Ball \d+/ })
    .first()
    .textContent();
  return heading!.match(/\d+/)![0]!;
}
