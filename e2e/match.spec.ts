import type { Page } from '@playwright/test';
import { expect, readBackup, skipTutorial, test } from './support';
import { mkdir, writeFile } from 'node:fs/promises';
import { generateWorld } from '../src/engine/world/generate';
import { createSave, DEFAULT_SETTINGS } from '../src/persistence/schema';
import { CONFIG } from '../src/engine/config';
import { sessionBeforeGoal } from './matchSessions';

let backupPath: string;
let fatiguedBackupPath: string;
let longNamesBackupPath: string;
let goalBackupPath: string;
/** The minute the goal of `goalBackupPath`'s session goes in. */
let goalMinute: number;
test.beforeAll(async ({ browserName }, workerInfo) => {
  const world = generateWorld('match-browser');
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
  // Ordinary but long club names, which the scoreboard once broke mid-word (review U2).
  const named = structuredClone(world);
  Object.values(named.clubs).forEach((club, index) => {
    club.name = index % 2 ? 'Matlock Albion' : 'Featherstonehaugh Rovers';
  });
  // A friendly one minute before a goal in open play (release 1.0, step 5.1).
  const beforeGoal = sessionBeforeGoal(world);
  goalMinute = beforeGoal.state.match.minute + 1;
  goalBackupPath = `artifacts/match-goal-${browserName}-${workerInfo.workerIndex}.json`;
  await writeFile(
    goalBackupPath,
    JSON.stringify(
      createSave(1, 'Goal match', {
        ...save.payload,
        kind: 'world',
        world,
        matchSession: beforeGoal,
      }),
    ),
  );
  longNamesBackupPath = `artifacts/match-names-${browserName}-${workerInfo.workerIndex}.json`;
  await writeFile(
    longNamesBackupPath,
    JSON.stringify(createSave(1, 'Long names', { ...save.payload, kind: 'world', world: named })),
  );
});
test.beforeEach(async ({ page }) => {
  await skipTutorial(page);
});
async function prepare(page: Page, keeper = false, tired = false, backup?: string) {
  await page.goto('/saves');
  await page
    .locator('.slot-card')
    .nth(0)
    .getByLabel('Import backup — Slot 1')
    .setInputFiles(backup ?? (tired ? fatiguedBackupPath : backupPath));
  await expect(page.locator('.notice')).toHaveText('Save imported.', { timeout: 30000 });
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
    // A knock (match-22): play on.
    else if (await page.getByRole('button', { name: /^Play on/ }).isVisible())
      await page.getByRole('button', { name: /^Play on/ }).click();
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
  await expect(page.getByTestId('live-updates')).toContainText('Key moment');
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
  // The maps sit behind their disclosure and load when it opens.
  await page.getByText('Your match, mapped', { exact: true }).click();
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
    .getByRole('link', { name: 'Saved games', exact: true })
    .click();
  const download = page.waitForEvent('download');
  await page.locator('.slot-card').first().getByRole('button', { name: 'Export backup' }).click();
  const saved = JSON.parse(await readBackup((await (await download).path())!));
  expect(saved.schemaVersion).toBe(CONFIG.saves.schemaVersion);
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
  // Keeper situations are seeded: a shot, a one-on-one, a cross, distribution or a penalty.
  // Each is framed in one of several sentences, so the keeper's choices identify it.
  await expect(page.locator('#decision-heading')).not.toBeEmpty();
  await expect(page.locator('.match-choices button').first()).toHaveText(
    /Catch and hold|Parry|Rush off|Stay on your line|Come and claim|Punch|Roll it out|Kick it long|Read the taker|Stay big/,
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
test('the scoreboard keeps long club names whole beside the clock at 1440 × 900', async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await prepare(page, false, false, longNamesBackupPath);
  await page.getByRole('button', { name: 'Kick off', exact: true }).click();
  await pause(page);
  await page.getByRole('button', { name: 'Next key moment', exact: true }).click();
  await expect(page.getByTestId('match-state')).toHaveAttribute('data-status', 'decision');
  // Each chance says what it is a chance of ("79% to score").
  await expect(page.locator('.match-choice-chance').first()).toHaveText(
    /^\d+% to (score|complete|get through|stop the attack|keep it out|get there first)$/,
  );
  const names = page.locator('.match-scoreboard .match-team-text strong');
  await expect(names).toHaveText([
    /^(Featherstonehaugh Rovers|Matlock Albion)$/,
    /^(Featherstonehaugh Rovers|Matlock Albion)$/,
  ]);
  const layout = await page.evaluate(() => {
    const box = (element: Element | null) => element!.getBoundingClientRect();
    const overlaps = (a: DOMRect, b: DOMRect) =>
      a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    // A word broken across lines has client rects on more than one line.
    const broken: string[] = [];
    const shown: boolean[] = [];
    for (const name of document.querySelectorAll('.match-scoreboard .match-team-text strong')) {
      shown.push(box(name).width > 40);
      const walker = document.createTreeWalker(name, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode())
        for (const word of node.textContent!.matchAll(/\S+/g)) {
          const range = document.createRange();
          range.setStart(node, word.index!);
          range.setEnd(node, word.index! + word[0].length);
          const lines = new Set(
            [...range.getClientRects()].filter((r) => r.width > 0).map((r) => Math.round(r.top)),
          );
          if (lines.size > 1) broken.push(word[0]);
        }
    }
    const state = box(document.querySelector('.match-clock-state'));
    return {
      broken,
      shown,
      overlap: [...document.querySelectorAll('.match-scoreboard .match-team')].some((team) =>
        overlaps(state, box(team)),
      ),
    };
  });
  expect(layout.broken).toEqual([]);
  expect(layout.shown).toEqual([true, true]);
  expect(layout.overlap).toBe(false);
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
  // A paused clock stays put: only time can show it (a match minute is well under a second).
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
test('pausing freezes pitch movement and resuming continues the action', async ({
  page,
  browserName,
}) => {
  test.setTimeout(90000);
  await prepare(page);
  await page.getByRole('button', { name: 'Kick off', exact: true }).click();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.getByTestId('match-state')).not.toHaveAttribute('data-minute', '0');
  await pause(page);
  const pitch = page.locator('.match-pitch-panel figure').first();
  await expect(pitch).toBeVisible();
  if (browserName === 'chromium') await expect(pitch.locator('canvas')).toHaveCount(1);
  const frozen = await pitch.screenshot();
  // Paused, nothing moves: only time can show it.
  await page.waitForTimeout(350);
  expect((await pitch.screenshot()).equals(frozen)).toBe(true);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(async () => expect((await pitch.screenshot()).equals(frozen)).toBe(false)).toPass({
    timeout: 8000,
  });
});

test('the vector fallback animates decisions and respects reduced motion', async ({ page }) => {
  test.setTimeout(90000);
  await prepare(page);
  await page.getByRole('button', { name: 'Kick off', exact: true }).click();
  const canvas = page.locator('.match-pitch-panel canvas');
  await expect
    .poll(
      async () =>
        (await canvas.count()) > 0 ||
        (await page.getByText('Using the accessible pitch view.', { exact: false }).isVisible()),
      { timeout: 20000 },
    )
    .toBe(true);
  if (await canvas.count())
    await canvas.evaluate((node) =>
      node.dispatchEvent(new Event('webglcontextlost', { cancelable: true })),
    );
  await expect(page.getByText('Using the accessible pitch view.', { exact: false })).toBeVisible();
  const pitch = page.locator('.match-pitch-panel svg').first();
  await expect(pitch.locator('text')).toHaveCount(22);
  for (const number of await pitch.locator('text').all())
    await expect(number).toHaveAttribute('text-anchor', 'middle');
  const start = await pitch.screenshot();
  await page.getByRole('button', { name: 'Next key moment', exact: true }).click();
  await expect(async () => expect((await pitch.screenshot()).equals(start)).toBe(false)).toPass({
    timeout: 5000,
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // The pitch draws on a canvas: still once two pictures in a row match...
  await expect
    .poll(async () => (await pitch.screenshot()).equals(await pitch.screenshot()))
    .toBe(true);
  const still = await pitch.screenshot();
  // ...and it stays still. Only time can show nothing moves.
  await page.waitForTimeout(350);
  expect((await pitch.screenshot()).equals(still)).toBe(true);
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

/** Import a save and open its matchday, at whatever viewport the page has. */
async function importAndOpen(page: Page, backup: string) {
  await page.goto('/saves');
  await page
    .locator('.slot-card')
    .nth(0)
    .getByLabel('Import backup — Slot 1')
    .setInputFiles(backup);
  await expect(page.locator('.notice')).toHaveText('Save imported.', { timeout: 30000 });
  await page.goto('/match?save=1');
}
const score = (page: Page) => page.locator('.match-score-value').innerText();

test('the pitch keeps moving through each minute at 1× (review M2)', async ({ page }) => {
  test.setTimeout(90000);
  await prepare(page);
  await page.getByRole('button', { name: 'Kick off', exact: true }).click();
  await page.getByRole('button', { name: '1×', exact: true }).click();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  const state = page.getByTestId('match-state');
  await expect(state).not.toHaveAttribute('data-minute', '0');
  const stage = page.locator('.match-pitch-stage').first();
  // A sample every ~150 ms over a few minutes of play: before 1.0 the pitch stood still for
  // about two thirds of every minute, so most pairs of pictures in a row matched.
  const shots: Buffer[] = [];
  for (let sample = 0; sample < 20; sample++) {
    if ((await state.getAttribute('data-status')) !== 'live') break;
    shots.push(await stage.screenshot({ animations: 'allow' }));
    await page.waitForTimeout(150);
  }
  expect(shots.length).toBeGreaterThanOrEqual(10);
  const moved = shots.slice(1).filter((shot, index) => !shot.equals(shots[index]!)).length;
  expect(moved / (shots.length - 1)).toBeGreaterThanOrEqual(0.8);
});

test('a goal in open play slows down, then shows the GOAL banner and can be replayed (review M3)', async ({
  page,
}) => {
  test.setTimeout(90000);
  await importAndOpen(page, goalBackupPath);
  const state = page.getByTestId('match-state');
  await expect(state).toHaveAttribute('data-status', 'live', { timeout: 30000 });
  const before = await score(page);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(state).toHaveAttribute('data-minute', String(goalMinute), { timeout: 10000 });
  // The build-up plays first: the scoreboard keeps the goal back until the ball is in.
  expect(await score(page)).toBe(before);
  const banner = page.getByTestId('goal-banner');
  await expect(banner).toBeVisible({ timeout: 8000 });
  const after = await score(page);
  expect(after).not.toBe(before);
  await expect(banner).toContainText(/Goal!|Own goal!/);
  await expect(banner).toContainText(after.replace(/\s/g, ''));
  // The commentary names the team and the new score.
  const scoreline = await banner.locator('.match-goal-score').innerText();
  await expect(page.locator('.match-commentary')).toContainText(
    scoreline.replace(/\s+/g, ' ').trim(),
  );
  // R replays the goal on the pitch; the banner returns once it has played.
  await page.locator('main').focus();
  await page.keyboard.press('r');
  await expect(page.getByTestId('goal-replaying')).toBeVisible();
  await expect(banner).toBeHidden();
  await expect(banner).toBeVisible({ timeout: 10000 });
  await page.getByRole('button', { name: /^Replay/ }).click();
  await expect(page.getByTestId('goal-replaying')).toBeVisible();
  // Play goes on after the banner.
  await expect(state).not.toHaveAttribute('data-minute', String(goalMinute), { timeout: 15000 });
  await expect(banner).toBeHidden();
});

test('reduced motion shows the GOAL banner without movement or replay', async ({ page }) => {
  test.setTimeout(90000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await importAndOpen(page, goalBackupPath);
  const state = page.getByTestId('match-state');
  await expect(state).toHaveAttribute('data-status', 'live', { timeout: 30000 });
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  const banner = page.getByTestId('goal-banner');
  await expect(banner).toBeVisible({ timeout: 10000 });
  await expect(page.getByRole('button', { name: /^Replay/ })).toHaveCount(0);
  const animations = await banner.evaluate((element) =>
    element.ownerDocument
      .getAnimations()
      .filter((animation) => {
        const target = (animation.effect as KeyframeEffect | null)?.target;
        return target ? element.contains(target) : false;
      })
      .map((animation) => animation.playState),
  );
  expect(animations).toEqual([]);
});

test('simulation-only mode jumps from moment to moment (review M15)', async ({ page }) => {
  test.setTimeout(120000);
  await prepare(page);
  await page.getByRole('button', { name: 'Kick off', exact: true }).click();
  await pause(page);
  await page.getByRole('switch', { name: 'Simulation only', exact: true }).check();
  await expect(page.locator('.match-simulation')).toBeVisible();
  const state = page.getByTestId('match-state');
  // Two moments in a row: each arrives within moments, not at 2.2 s a simulated minute.
  for (let moment = 0; moment < 2; moment++) {
    const start = Date.now();
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect
      .poll(async () => state.getAttribute('data-status'), { timeout: 10000 })
      .toMatch(/decision|halftime|finished/);
    expect(Date.now() - start).toBeLessThan(7000);
    if ((await state.getAttribute('data-status')) !== 'decision') break;
    await page.locator('.match-choices button').first().click();
    await expect(state).toHaveAttribute('data-status', 'live');
    await page.getByRole('button', { name: 'Continue play', exact: true }).click();
    await pause(page);
  }
});

test('the match speed is remembered for the next match (review M19)', async ({ page }) => {
  test.setTimeout(120000);
  await prepare(page);
  await page.getByRole('button', { name: 'Kick off', exact: true }).click();
  await expect(page.getByRole('button', { name: '1×', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: '4×', exact: true }).click();
  // The next match starts at the speed chosen last.
  await finish(page);
  await page.getByRole('button', { name: 'Play again', exact: true }).click();
  await page.getByRole('button', { name: 'Kick off', exact: true }).click();
  await expect(page.getByRole('button', { name: '4×', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  // And after a reload, once the new match is saved.
  await expect(page.locator('.save-indicator')).toHaveText('All changes saved', { timeout: 30000 });
  await page.reload();
  await expect(page.getByRole('button', { name: '4×', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
    { timeout: 30000 },
  );
  await page.getByRole('button', { name: '2×', exact: true }).click();
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('ptg-match') ?? 'null')),
  ).toEqual({ speed: 2 });
});

test('on a phone the briefing opens at its top, kick-off shows the pitch, and the tab bar steps aside (U3, U4, U16)', async ({
  page,
}) => {
  test.setTimeout(150000);
  await page.setViewportSize({ width: 390, height: 844 });
  await importAndOpen(page, backupPath);
  const select = page.getByRole('combobox', { name: 'Your footballer', exact: true });
  await expect(select.locator('option')).toHaveCount(22, { timeout: 30000 });
  const striker = await select
    .locator('option')
    .evaluateAll(
      (options) =>
        (options.find((option) => option.textContent?.endsWith('ST')) as HTMLOptionElement).value,
    );
  await select.selectOption(striker);
  await page.getByRole('button', { name: 'Prepare match', exact: true }).click();
  await expect(page.getByTestId('match-state')).toHaveAttribute('data-status', 'preview');
  // The briefing opens at its top, its player header stacked: name, then the tiles.
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  const header = await page.evaluate(() => {
    const box = (selector: string) => document.querySelector(selector)!.getBoundingClientRect();
    const name = box('.match-briefing-name');
    const tiles = box('.match-briefing-player .match-tiles');
    const meta = box('.match-briefing-player .match-card-note');
    return { nameBottom: name.bottom, tilesTop: tiles.top, metaHeight: meta.height };
  });
  expect(header.tilesTop).toBeGreaterThanOrEqual(header.nameBottom);
  expect(header.metaHeight).toBeLessThan(60);
  await expect(page.locator('.bottom-nav')).toBeVisible();
  await page.getByRole('button', { name: 'Kick off', exact: true }).click();
  // Kick-off brings the score and the pitch into view.
  await expect
    .poll(() =>
      page.evaluate(() => {
        const board = document.querySelector('.match-live .match-scoreboard')!;
        const pitch = document.querySelector('.match-stage')!;
        const a = board.getBoundingClientRect(),
          b = pitch.getBoundingClientRect();
        return a.top >= 0 && b.top < window.innerHeight * 0.6;
      }),
    )
    .toBe(true);
  // A live match is a focused flow: no tab bar; the score stays in view while scrolling.
  await expect(page.locator('.bottom-nav')).toBeHidden();
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect
    .poll(() =>
      page.evaluate(
        () => document.querySelector('.match-live .match-scoreboard')!.getBoundingClientRect().top,
      ),
    )
    .toBeLessThan(24);
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(200);
  await finish(page);
  await expect(page.getByRole('heading', { name: 'Your match report', exact: true })).toBeVisible();
  await expect(page.locator('.bottom-nav')).toBeVisible();
});
