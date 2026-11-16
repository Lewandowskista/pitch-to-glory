import type { Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { expect, playReel, skipTutorial, test } from './support';
import { generateWorld } from '../src/engine/world/generate';
import { createSave, DEFAULT_SETTINGS } from '../src/persistence/schema';
import type { MatchSession } from '../src/engine/match';
import {
  sessionAtBoard,
  sessionAtHalfTime,
  sessionAtKnock,
  sessionAtShootoutKick,
  sessionOnBench,
} from './occasionSessions';

/**
 * The occasions of a match-22 session on the match screen (release 1.0 step 5.4): the half-time
 * card, stoppage time, a knock's decision, coming off the bench, and the shootout as the
 * taker and as the keeper. Each test opens a friendly saved at that point.
 */
const backups = new Map<string, string>();
test.beforeAll(async ({ browserName }, workerInfo) => {
  const world = generateWorld('occasions-browser');
  const save = (session: MatchSession) =>
    JSON.stringify(
      createSave(1, 'Occasions', {
        kind: 'world',
        world,
        gallery: { seed: 'occasions-browser', generation: 0 },
        settings: DEFAULT_SETTINGS,
        matchSession: session,
      }),
    );
  await mkdir('artifacts', { recursive: true });
  for (const [name, session] of [
    ['halftime', sessionAtHalfTime(world)],
    ['board', sessionAtBoard(world)],
    ['knock', sessionAtKnock(world)],
    ['bench', sessionOnBench(world)],
    ['taker', sessionAtShootoutKick(world, false)],
    ['keeper', sessionAtShootoutKick(world, true)],
  ] as const) {
    const path = `artifacts/occasion-${name}-${browserName}-${workerInfo.workerIndex}.json`;
    await writeFile(path, save(session));
    backups.set(name, path);
  }
});
test.beforeEach(async ({ page }) => {
  await skipTutorial(page);
});
async function open(page: Page, name: string) {
  await page.goto('/saves');
  await page
    .locator('.slot-card')
    .nth(0)
    .getByLabel('Import backup — Slot 1')
    .setInputFiles(backups.get(name)!);
  await expect(page.locator('.notice')).toHaveText('Save imported.', { timeout: 30000 });
  await page.goto('/match?save=1');
  await expect(page.getByTestId('match-state')).not.toHaveAttribute('data-status', 'selection', {
    timeout: 30000,
  });
}
const state = (page: Page) => page.getByTestId('match-state');

test('half-time is one manager card with two answers, the manager’s pick first', async ({
  page,
}) => {
  test.setTimeout(90000);
  await open(page, 'halftime');
  await expect(state(page)).toHaveAttribute('data-status', 'halftime');
  const talk = page.getByTestId('halftime-talk');
  const options = talk.locator('button');
  await expect(options).toHaveCount(2);
  await expect(options.first()).toHaveAttribute('data-default', '');
  await expect(options.first()).toContainText(/Motivate the team|Lift the side/);
  await expect(options.first()).toBeFocused();
  // The other answer, and the manager's reply.
  const other = (await options.nth(1).innerText()).split('\n')[0]!;
  await options.nth(1).click();
  await expect(state(page)).toHaveAttribute('data-status', 'live');
  if (/^Ask for /.test(other))
    await expect(page.getByTestId('role-result')).toContainText(/The manager (agreed|said no)/);
});

test('stoppage time: the board goes up and the clock reads 45+1′', async ({ page }) => {
  test.setTimeout(90000);
  await open(page, 'board');
  await expect(state(page)).toHaveAttribute('data-minute', '45');
  await expect(page.getByTestId('added-time-board')).toHaveText(/\+\d/);
  await expect(page.locator('.match-clock-minute')).toHaveText('45+1′', { timeout: 10000 });
});

test('a knock: play on or come off', async ({ page }) => {
  test.setTimeout(90000);
  await open(page, 'knock');
  const panel = page.getByTestId('injury-decision');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText(/Fatigue \+\d+/);
  // Nothing moves on until it is answered.
  const minute = await state(page).getAttribute('data-minute');
  await page.keyboard.press('Space');
  await page.waitForTimeout(800);
  await expect(state(page)).toHaveAttribute('data-minute', minute!);
  await panel.getByRole('button', { name: /Come off/ }).click();
  await expect(page.getByTestId('injury-result')).toContainText('as a precaution');
});

test('coming off the bench: warming up, then on', async ({ page }) => {
  test.setTimeout(120000);
  await open(page, 'bench');
  const bench = page.getByTestId('bench-panel');
  await expect(bench).toContainText('On the bench');
  await expect(bench).toContainText('Warming up');
  // Skip through the ticker until the manager sends the player on.
  const on = page.getByTestId('bench-on');
  for (let turns = 0; turns < 200 && !(await on.isVisible()); turns++) {
    const beat = await state(page).getAttribute('data-beat');
    if (beat === 'ticker' || beat === 'clip' || beat === 'banner')
      await page.keyboard.press('Space');
    await page.waitForTimeout(150);
  }
  await expect(on).toContainText('You are on!');
});

for (const role of ['taker', 'keeper'] as const)
  test(`a shootout as the ${role}: the player’s ${role === 'taker' ? 'kick' : 'save'} and the board`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    await open(page, role);
    await expect(state(page)).toHaveAttribute('data-status', 'decision');
    const board = page.getByTestId('shootout-board');
    await expect(board).toBeVisible();
    await expect(board).toContainText('Penalty shootout');
    // Play the shootout out, choosing at every save or kick of the player's.
    await playReel(page);
    await expect(
      page.getByRole('heading', { name: 'Your match report', exact: true }),
    ).toBeVisible();
    await expect(page.getByTestId('shootout-board')).toBeVisible();
    await expect(page.getByTestId('final-result')).toContainText(/on penalties/);
  });
