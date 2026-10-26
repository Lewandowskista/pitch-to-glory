import type { Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { expect, skipTutorial, test } from './support';
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
 * role choice, stoppage time, a knock's decision, coming off the bench, and the shootout as the
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

test('half-time: choose the role to ask for, and see the manager’s answer', async ({ page }) => {
  test.setTimeout(90000);
  await open(page, 'halftime');
  await expect(state(page)).toHaveAttribute('data-status', 'halftime');
  const talk = page.getByTestId('halftime-talk');
  await expect(talk).toContainText('Motivate the team');
  await expect(talk).toContainText('Demand the ball');
  await expect(talk).toContainText(/says no \d+(\.\d)?% of the time/);
  const role = page.getByTestId('halftime-role');
  const options = await role.locator('option').allTextContents();
  expect(options.length).toBeGreaterThanOrEqual(2);
  await role.selectOption({ label: options[1]! });
  await page.getByRole('button', { name: `Ask for ${options[1]}` }).click();
  await expect(state(page)).toHaveAttribute('data-status', 'live');
  await expect(page.getByTestId('role-result')).toContainText(/The manager (agreed|said no)/);
});

test('stoppage time: the board goes up and the clock reads 45+1′', async ({ page }) => {
  test.setTimeout(90000);
  await open(page, 'board');
  await expect(state(page)).toHaveAttribute('data-minute', '45');
  await expect(page.locator('.match-clock-added')).toHaveText(/Added time\s*\+\d/);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.locator('.match-clock-minute')).toHaveText('45+1′', { timeout: 10000 });
  await expect(page.locator('.match-commentary')).toContainText(/\+\d/);
});

test('a knock: play on or come off', async ({ page }) => {
  test.setTimeout(90000);
  await open(page, 'knock');
  const panel = page.getByTestId('injury-decision');
  await expect(panel).toBeVisible();
  await expect(page.getByRole('button', { name: 'Next key moment', exact: true })).toBeDisabled();
  await expect(panel).toContainText(/Fatigue \+\d+/);
  await panel.getByRole('button', { name: /Come off/ }).click();
  await expect(page.getByTestId('injury-result')).toContainText('as a precaution');
  await expect(page.getByRole('button', { name: 'Next key moment', exact: true })).toBeEnabled();
});

test('coming off the bench: warming up, then on', async ({ page }) => {
  test.setTimeout(120000);
  await open(page, 'bench');
  const bench = page.getByTestId('bench-panel');
  await expect(bench).toContainText('On the bench');
  await expect(bench).toContainText('Warming up');
  await page.getByRole('button', { name: '4×' }).click();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.getByTestId('bench-on')).toContainText('You are on!', { timeout: 60000 });
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
    await page.locator('.match-choices button').first().click();
    await expect(state(page)).toHaveAttribute('data-status', /live|finished/);
    // Play the shootout out, choosing at every save or kick of the player's.
    for (let turn = 0; turn < 40; turn++) {
      const status = await state(page).getAttribute('data-status');
      if (status === 'finished') break;
      if (status === 'decision') await page.locator('.match-choices button').first().click();
      else await page.getByRole('button', { name: 'Next key moment', exact: true }).click();
    }
    await expect(state(page)).toHaveAttribute('data-status', 'finished');
    await expect(
      page.getByRole('heading', { name: 'Your match report', exact: true }),
    ).toBeVisible();
    await expect(page.getByTestId('shootout-board')).toBeVisible();
    await expect(page.getByTestId('final-result')).toContainText(/on penalties/);
  });
