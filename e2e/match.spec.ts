import type { Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { expect, importToMatch, matchState, playReel, skipTutorial, test } from './support';
import { generateWorld } from '../src/engine/world/generate';
import { createSave, DEFAULT_SETTINGS } from '../src/persistence/schema';
import { sessionBeforeGoal } from './matchSessions';

/**
 * The live match as a highlights reel (release 1.0, X1b; docs/EXPERIENCE-REDESIGN-1.0.md
 * 1.2–1.5): the one-screen pre-match, the ticker with its one control, decision chains on the
 * card, the inline outcome beat, every goal as a clip, Watch highlights, Simulate, the Match
 * log, pausing, the stills fallback and the report's moment tiles. `REEL_SHOTS=<dir>` saves the
 * screenshots at 390 × 844.
 */
const SHOTS = process.env.REEL_SHOTS;
const PHONE = { width: 390, height: 844 };
let backupPath: string;
let goalBackupPath: string;
test.beforeAll(async ({ browserName }, workerInfo) => {
  const world = generateWorld('match-browser');
  const payload = {
    kind: 'world' as const,
    world,
    gallery: { seed: 'match-browser', generation: 0 },
    settings: DEFAULT_SETTINGS,
  };
  await mkdir('artifacts', { recursive: true });
  backupPath = `artifacts/match-start-${browserName}-${workerInfo.workerIndex}.json`;
  await writeFile(backupPath, JSON.stringify(createSave(1, 'Matchday test', payload)));
  // A friendly one minute before a goal in open play.
  goalBackupPath = `artifacts/match-goal-${browserName}-${workerInfo.workerIndex}.json`;
  await writeFile(
    goalBackupPath,
    JSON.stringify(
      createSave(1, 'Goal match', { ...payload, matchSession: sessionBeforeGoal(world) }),
    ),
  );
});
test.beforeEach(async ({ page }) => {
  await skipTutorial(page);
});
test.use({ actionTimeout: 15000 });

async function shot(page: Page, name: string) {
  if (!SHOTS) return;
  await mkdir(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
}
/** A friendly prepared for the first striker, at the pre-match screen. */
async function prepare(page: Page) {
  await importToMatch(page, backupPath);
  const select = page.getByRole('combobox', { name: 'Your footballer', exact: true });
  await expect(select).toBeVisible({ timeout: 30000 });
  const player = await select
    .locator('option')
    .evaluateAll(
      (options) =>
        (
          options.find((option) => option.textContent?.endsWith('ST')) as
            HTMLOptionElement | undefined
        )?.value,
    );
  await select.selectOption(player!);
  await page.getByRole('button', { name: 'Prepare match', exact: true }).click();
  await expect(matchState(page)).toHaveAttribute('data-status', 'preview');
}
/** Skip through the ticker until the reel shows `beat`. */
async function skipTo(page: Page, beat: string) {
  const state = matchState(page);
  for (let turns = 0; turns < 200; turns++) {
    const now = await state.getAttribute('data-beat');
    if (now === beat) return;
    if (now === 'wait') await page.locator('.reel-main section button').first().click();
    else if (now === 'ticker') await page.keyboard.press('Space');
    await page.waitForTimeout(150);
  }
  throw new Error(`The reel never reached ${beat}`);
}
const words = (text: string) => text.split(/\s+/).filter((token) => /\p{L}/u.test(token)).length;

test('pre-match is one screen, and Kick off starts the reel', async ({ page }) => {
  test.setTimeout(90000);
  await page.setViewportSize(PHONE);
  await prepare(page);
  const pre = page.getByTestId('pre-match');
  await expect(pre.getByTestId('pre-match-objective')).toHaveCount(1);
  await expect(pre.locator('.reel-role summary')).toContainText('Your role');
  await expect(pre.locator('.reel-details')).not.toHaveAttribute('open', '');
  const kickoff = page.getByRole('button', { name: 'Kick off', exact: true });
  await expect(kickoff).toBeInViewport({ ratio: 1 });
  await expect(page.getByRole('button', { name: 'Watch highlights' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Simulate' })).toBeVisible();
  await shot(page, 'pre-match');
  await kickoff.click();
  await expect(matchState(page)).toHaveAttribute('data-status', 'live');
  await expect(page.getByTestId('ticker')).toBeVisible();
  // One control, and no playback speeds.
  await expect(page.getByRole('button', { name: 'Skip to next moment' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^[124]×$/ })).toHaveCount(0);
  await expect(page.locator('.reel-wave')).toBeVisible();
  await page.waitForTimeout(1500);
  await shot(page, 'ticker');
});

test('plays decision chains on the card to the report, and a refresh keeps the step', async ({
  page,
}) => {
  test.setTimeout(240000);
  await page.setViewportSize(PHONE);
  await prepare(page);
  await page.getByRole('button', { name: 'Kick off', exact: true }).click();
  await skipTo(page, 'card');
  const card = page.locator('.reel-card');
  await expect(card.locator('button[data-choice]').first()).toBeFocused();
  // The card and the clip fit one screen: header within 12 words, options within 20.
  expect(words((await card.locator('.reel-card-header').textContent())!)).toBeLessThanOrEqual(12);
  const box = (await card.boundingBox())!;
  expect(box.y + box.height).toBeLessThanOrEqual(PHONE.height);
  await expect(page.getByTestId('clip-stage')).toBeInViewport();
  await expect(card.locator('button[data-choice]').first()).toContainText(/\d+%/);
  await shot(page, 'chain-step');
  // "Why?" holds the factors; Escape closes it and never chooses.
  await card.getByRole('button', { name: 'Why?' }).click();
  await expect(card.locator('.reel-why-panel')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(card.locator('.reel-why-panel')).toHaveCount(0);
  await expect(matchState(page)).toHaveAttribute('data-status', 'decision');
  // A refresh brings back the same step.
  const momentId = await matchState(page).getAttribute('data-moment');
  await page.reload();
  await expect(page.locator('.reel-card')).toBeVisible({ timeout: 30000 });
  await expect(matchState(page)).toHaveAttribute('data-moment', momentId!);
  await expect(page.locator('.reel-card button[data-choice]').first()).toBeFocused();
  await page.waitForTimeout(320);
  await page.keyboard.press('1');
  // The outcome is a beat on the clip: a mark and one cause line, then play moves on by itself.
  const beat = page.getByTestId('outcome-beat');
  await expect(beat).toBeVisible({ timeout: 10000 });
  await expect(beat).toContainText(/\d+%/);
  await shot(page, 'outcome-beat');
  await expect(beat).toHaveCount(0, { timeout: 10000 });
  const answered = await playReel(page);
  expect(answered).toBeGreaterThan(0);
  // The report leads with the score and one tile per chain; a tile replays its clips.
  await expect(page.getByTestId('final-result')).toBeVisible();
  const tiles = page.getByTestId('moment-tile');
  expect(await tiles.count()).toBeGreaterThan(0);
  await page.waitForTimeout(800);
  await shot(page, 'report');
  await tiles.first().click();
  await expect(page.getByTestId('moment-replay')).toBeVisible();
});

test('every goal is seen: a clip, then the GOAL banner and the score', async ({ page }) => {
  test.setTimeout(90000);
  await page.setViewportSize(PHONE);
  await importToMatch(page, goalBackupPath);
  const state = matchState(page);
  await expect(state).toHaveAttribute('data-status', 'live', { timeout: 30000 });
  const before = await page.locator('.match-score-value').innerText();
  await expect(state).toHaveAttribute('data-beat', 'clip', { timeout: 15000 });
  // The board keeps the goal back until it goes in on the pitch.
  expect(await page.locator('.match-score-value').innerText()).toBe(before);
  await page.waitForTimeout(1800);
  await shot(page, 'goal');
  await expect(state).toHaveAttribute('data-beat', 'banner', { timeout: 10000 });
  await expect(page.locator('.match-score-value')).not.toHaveText(before);
});

test('Watch highlights plays the reel with no decisions to make', async ({ page }) => {
  test.setTimeout(200000);
  await prepare(page);
  await page.getByRole('button', { name: 'Watch highlights' }).click();
  const started = Date.now();
  const state = matchState(page);
  await expect(state).toHaveAttribute('data-mode', 'watch');
  // No input at all but the touchline's calls, answered as the manager would.
  await expect(state).toHaveAttribute('data-status', 'finished', { timeout: 180000 });
  await expect(page.getByTestId('final-result')).toBeVisible();
  // About a minute (a headless browser runs the clips a little slower than a phone).
  expect(Date.now() - started).toBeLessThan(100000);
});

test('Simulate goes straight to the report', async ({ page }) => {
  test.setTimeout(90000);
  await prepare(page);
  await page.getByRole('button', { name: 'Simulate' }).click();
  await expect(page.getByTestId('final-result')).toBeVisible({ timeout: 30000 });
  await expect(matchState(page)).toHaveAttribute('data-status', 'finished');
});

test('the Match log is a sheet Back closes; hiding the tab pauses; reduced motion draws stills', async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await prepare(page);
  await page.getByRole('button', { name: 'Kick off', exact: true }).click();
  await page.getByRole('button', { name: 'Match log' }).click();
  await expect(page.getByTestId('match-log')).toBeVisible();
  await expect(page).toHaveURL(/log=1/);
  await page.goBack();
  await expect(page.getByTestId('match-log')).toHaveCount(0);
  // Hidden, the reel holds; Space plays on.
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.getByTestId('reel-paused')).toHaveAttribute('data-paused', 'true');
  const minute = await matchState(page).getAttribute('data-minute');
  await page.waitForTimeout(1500);
  await expect(matchState(page)).toHaveAttribute('data-minute', minute!);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
  });
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.getByTestId('reel-paused')).not.toHaveAttribute('data-paused', 'true');
  // With reduced motion a clip is drawn as stills.
  await skipTo(page, 'card');
  await expect(page.locator('.reel-still')).toBeVisible();
});
