import type { Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import {
  backupFile,
  type BackupPayload,
  expect,
  JOURNEY_DRAFT,
  nationalCareer,
  openCareerPage,
  recordedReport,
  skipTutorial,
  test,
} from './support';
import { validateDraft } from '../src/engine/career/create';
import { advanceCareerWeek } from '../src/engine/career/season';
import { applyEditAction, NAME_LIMIT } from '../src/engine/world/edits';
import { createSave, DEFAULT_SETTINGS } from '../src/persistence/schema';
import { careerText } from '../src/i18n/career';
import { format } from '../src/i18n';

/**
 * Identity layout (release 1.0 plan, step 2.5; review finding U1). A career whose player,
 * club and competition have the longest names the game allows, and a check that no visible
 * text on the surfaces that show them breaks inside a word, at the five layout widths and at
 * 130% text (Settings' largest font scale) on a phone.
 *
 * A word is a run of letters between spaces (a hyphen ends it, so "Maximiliano-" may end a
 * line). Each word is measured with a Range: client rects on two lines mean the browser split
 * it, as `overflow-wrap: anywhere` or `break-words` do when a word cannot fit.
 *
 * KNOWN_U1 lists the surfaces that split these names today, which Phase 6.8 fixes: their
 * splits are reported (a line per surface in the output, annotations, and a screenshot of each
 * in artifacts/identity-layout/) without failing the run. Every other surface must have none,
 * so the scoreboard (fixed in 0.9.1, U2), the rival hero, the matchday card, the briefing and
 * the report, which keep these names whole in Chromium, Firefox and WebKit, are guarded now.
 * Phase 6.8 empties KNOWN_U1, which makes this the guard for every identity surface.
 */
const KNOWN_U1 = new Set<string>([
  // Review U1: the name wraps inside "Featherstonehaugh" (CareerProfile.tsx, HubBody.tsx).
  'profile hero',
  'hub player card',
  // Found by this spec: the save name ("{player} — career") splits at 768px (ui/Shell.tsx).
  'sidebar save card',
]);

/** 40 characters, the wizard's limit, with long words on both sides of the hyphen. */
const PLAYER = 'Maximiliano-Alexandros Featherstonehaugh';
/** At edit mode's limit for clubs and leagues, renamed the way edit mode does. */
const CLUB = 'Featherstonehaugh Borough Athletic FC';
const COMPETITION = 'Northamptonshire Combination League One';
const WIDTHS = [360, 390, 768, 1366, 1440];
/** Every width at normal text, then a phone at the largest font scale. */
const LAYOUTS = [...WIDTHS.map((width) => ({ width, scale: 1 })), { width: 390, scale: 1.3 }];

let backup: BackupPayload;
test.beforeAll(() => {
  expect(PLAYER).toHaveLength(40);
  const draft = { ...JOURNEY_DRAFT, name: PLAYER };
  let world = nationalCareer('identity-layout', draft);
  validateDraft(world, draft);
  const club = world.clubs[world.players[world.career!.playerId]!.clubId!]!;
  expect(Math.max(CLUB.length, COMPETITION.length)).toBeLessThanOrEqual(NAME_LIMIT);
  world = applyEditAction(world, { type: 'rename-club', id: club.id, name: CLUB });
  world = applyEditAction(world, { type: 'rename-league', id: club.leagueId, name: COMPETITION });
  // Up to the first matchday, so the hub offers the match.
  for (let week = 0; week < 20; week++) {
    const step = advanceCareerWeek(world, { inPlace: true });
    world = step.world;
    if (step.pendingFixtureId) break;
  }
  const save = createSave(1, format(careerText.wizard.saveName, { name: PLAYER }), {
    kind: 'world',
    world,
    gallery: { seed: 'identity-layout', generation: 0 },
    settings: DEFAULT_SETTINGS,
  });
  backup = backupFile('identity-layout', JSON.stringify(save));
});

test.beforeEach(async ({ page }) => {
  await skipTutorial(page);
});
test.use({ actionTimeout: 15000 });

interface Split {
  surface: string;
  layout: string;
  word: string;
  text: string;
}

/** Words split across lines inside the elements `selector` matches (visible text only). */
function splitWords(page: Page, selector: string) {
  return page.evaluate((selector) => {
    const found: { word: string; text: string }[] = [];
    let visible = 0;
    for (const root of Array.from(document.querySelectorAll(selector))) {
      if (!root.getClientRects().length) continue;
      visible++;
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const parent = node.parentElement;
        // Screen-reader-only text is clipped to a pixel and wraps at every letter by design.
        if (!parent || parent.closest('svg, .sr-only, title')) continue;
        const style = getComputedStyle(parent);
        if (style.visibility === 'hidden' || !parent.getClientRects().length) continue;
        const text = (node as Text).data;
        for (const match of text.matchAll(/[^\s\-‐–—/·]{2,}[-‐]?/g)) {
          const range = document.createRange();
          range.setStart(node, match.index);
          range.setEnd(node, match.index + match[0].length);
          const rects = Array.from(range.getClientRects()).filter(
            (rect) => rect.width > 0.5 && rect.height > 0.5,
          );
          if (rects.length < 2) continue;
          const tops = rects.map((rect) => rect.top);
          const line = Math.min(...rects.map((rect) => rect.height));
          if (Math.max(...tops) - Math.min(...tops) > line / 2)
            found.push({ word: match[0], text: text.trim().slice(0, 80) });
        }
      }
    }
    return { visible, found };
  }, selector);
}

/**
 * Check one surface at every layout, from the page it is on. Records splits, screenshots each
 * offending layout, and returns how many layouts showed the surface at all.
 */
async function checkSurface(
  page: Page,
  browserName: string,
  surface: string,
  selector: string,
  splits: Split[],
  layouts = LAYOUTS,
): Promise<number> {
  let shown = 0;
  for (const { width, scale } of layouts) {
    await page.setViewportSize({ width, height: 900 });
    // What Settings' font scale does (ui/Shell.tsx): the root font size, which rem units follow.
    await page.evaluate((percent) => {
      document.documentElement.style.fontSize = `${percent}%`;
    }, scale * 100);
    // Let layout settle after the resize (container queries, resize observers).
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    const { visible, found } = await splitWords(page, selector);
    if (visible) shown++;
    if (!found.length) continue;
    const layout = scale === 1 ? `${width}px` : `${width}px at ${scale * 100}% text`;
    for (const split of found) splits.push({ surface, layout, ...split });
    await mkdir('artifacts/identity-layout', { recursive: true });
    const name = `${browserName}-${surface.replace(/\W+/g, '-')}-${width}${scale === 1 ? '' : '-large'}`;
    await page
      .locator(selector)
      .first()
      .screenshot({ path: `artifacts/identity-layout/${name}.png` })
      .catch(() => page.screenshot({ path: `artifacts/identity-layout/${name}.png` }));
  }
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '100%';
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  return shown;
}

const state = (page: Page) => page.getByTestId('match-state');

/** Play the briefed fixture to full time with skip and number keys (as e2e/career.spec.ts). */
async function playToFullTime(page: Page) {
  for (let turns = 0; turns < 150; turns++) {
    const status = await state(page).getAttribute('data-status');
    if (status === 'finished') return;
    if (status === 'decision') {
      await expect(page.locator('.match-choices button').first()).toBeFocused();
      await page.keyboard.press('1');
      await expect(state(page)).not.toHaveAttribute('data-status', 'decision');
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
  throw new Error('The match did not reach full time');
}

test('long player, club and competition names never break inside a word', async ({
  page,
  browserName,
}) => {
  test.setTimeout(720000);
  const splits: Split[] = [];
  const shown = new Map<string, number>();
  const check = async (surface: string, selector: string, layouts = LAYOUTS) =>
    shown.set(
      surface,
      (shown.get(surface) ?? 0) +
        (await checkSurface(page, browserName, surface, selector, splits, layouts)),
    );

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/saves');
  await page
    .locator('.slot-card')
    .first()
    .getByLabel('Import backup — Slot 1')
    .setInputFiles(backup);
  await expect(page.locator('.notice')).toHaveText('Save imported.', { timeout: 60000 });
  await page.goto('/career?save=1');
  await expect(page.getByRole('heading', { name: PLAYER })).toBeVisible({ timeout: 60000 });

  // The career pages that name the player and the club.
  await check('hub player card', '[aria-labelledby="player-card-heading"]');
  // The sidebar is a wide-screen element; narrower layouts show the bottom bar instead.
  await check('sidebar save card', '.local-save');
  await openCareerPage(page, 'Profile');
  await expect(page.locator('#profile-name')).toHaveText(PLAYER);
  await check('profile hero', '[aria-labelledby="profile-name"]');
  await openCareerPage(page, 'Rival');
  await check('rival hero', 'section[aria-labelledby="rival-heading"]');

  // Matchday: the fixture card, the briefing, the live scoreboard and the report.
  await openCareerPage(page, 'Hub');
  await page.getByRole('link', { name: 'Play matchday', exact: true }).click();
  await expect(page.getByTestId('career-fixture')).toContainText(CLUB, { timeout: 60000 });
  await check('matchday card', '[data-testid="career-fixture"]');
  await page.getByRole('button', { name: 'Go to the pre-match briefing', exact: true }).click();
  await expect(state(page)).toHaveAttribute('data-status', 'preview');
  await check('pre-match briefing', '.match-briefing');
  await page.getByRole('button', { name: 'Kick off', exact: true }).click();
  const pause = page.getByRole('button', { name: 'Pause', exact: true });
  await expect(page.locator('.match-scoreboard')).toBeVisible();
  if (await pause.isVisible()) await pause.click();
  await check('scoreboard', '.match-scoreboard');
  await playToFullTime(page);
  await recordedReport(page);
  await check('report', '.match-report');

  // Every surface was on screen somewhere: a renamed selector cannot pass by finding nothing.
  for (const surface of [
    ...KNOWN_U1,
    'rival hero',
    'matchday card',
    'pre-match briefing',
    'scoreboard',
    'report',
  ])
    expect(shown.get(surface) ?? 0, `${surface} shown`).toBeGreaterThan(0);

  const known = splits.filter((split) => KNOWN_U1.has(split.surface));
  for (const split of known)
    test.info().annotations.push({
      type: 'known U1 split (Phase 6.8)',
      description: `${split.surface} at ${split.layout}: "${split.word}" in "${split.text}"`,
    });
  // The list reporter shows annotations only for failures: summarise the offenders per surface.
  const bySurface = new Map<string, Set<string>>();
  for (const split of known)
    bySurface.set(split.surface, (bySurface.get(split.surface) ?? new Set()).add(split.layout));
  for (const [surface, layouts] of bySurface)
    console.log(`[${browserName}] known U1: ${surface} splits at ${[...layouts].join(', ')}`);
  expect(
    splits.filter((split) => !KNOWN_U1.has(split.surface)),
    'words split across lines on surfaces that must keep them whole',
  ).toEqual([]);
});
