import { expect, test as base, type ConsoleMessage, type Page } from '@playwright/test';
import type { World } from '../src/model/domain';
import { generateWorld } from '../src/engine/world/generate';
import { createCareer, trialOffers, type CareerDraft } from '../src/engine/career/create';
import { existsSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { gunzipSync, gzipSync } from 'node:zlib';
import { buildNationalCareer, playNationalCareer } from '../tests/support/fixtures';
import { fixtureDirectory, fixturePath, writeFixture } from '../tests/support/store';

/** The career player of the journeys: an English 17-year-old striker. */
export const JOURNEY_DRAFT: CareerDraft = {
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
};
/**
 * A career as a new player gets one: a national world, the only format the game creates, with
 * the career at the first trial club its nationality offers (release 1.0 plan, step 2.1). It
 * takes about a second here, and its save (about 40 MB) a few seconds to import in a browser.
 */
export function nationalCareer(seed: string, draft: Partial<CareerDraft> = {}): World {
  const base = generateWorld(seed);
  const full = { ...JOURNEY_DRAFT, ...draft };
  const trial = trialOffers(base, full.nationalityId, seed)[0]!;
  return createCareer(base, full, trial.id, seed);
}
/** A file for `setInputFiles`, given as a buffer (at most 50 MB). */
export interface BackupPayload {
  name: string;
  mimeType: string;
  buffer: Buffer;
}
/**
 * A save as the game exports it since 1.0 (step 3.7): a gzip backup, passed to `setInputFiles`
 * as a buffer. Compressed, a national world after a played season (over 50 MB as JSON) fits the
 * buffer limit, so no file is written; importing it exercises the gzip path in every browser.
 */
export function backupFile(name: string, json: string): BackupPayload {
  return {
    name: `${name}.json.gz`,
    mimeType: 'application/gzip',
    buffer: gzipSync(json, { level: 1 }),
  };
}
/**
 * A downloaded backup's JSON: gzip (an export since 1.0), or plain JSON where the browser could
 * not compress. Told apart by the gzip magic bytes, as the game does.
 */
export async function readBackup(path: string): Promise<string> {
  const bytes = await readFile(path);
  return (bytes[0] === 0x1f && bytes[1] === 0x8b ? gunzipSync(bytes) : bytes).toString('utf8');
}
/**
 * The unit tests' shared national career after its first season, before the rollover
 * (tests/support/world.ts): read from their cache for these sources, or played here (about a
 * minute) and cached for the next journey.
 */
export function nationalCareerSeason(): World {
  const dir = fixtureDirectory();
  const path = fixturePath(dir, 'career-season');
  if (!existsSync(path))
    playNationalCareer(buildNationalCareer(), (name, world) =>
      writeFixture(dir, name, JSON.stringify(world)),
    );
  return JSON.parse(readFileSync(path, 'utf8')) as World;
}

/**
 * Mark the guided tour as seen on this device, so journeys that are not about the tutorial
 * are not interrupted by it. Merges into stored preferences rather than replacing them.
 */
export async function skipTutorial(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      const key = 'ptg-preferences';
      const stored = JSON.parse(localStorage.getItem(key) ?? 'null') as Record<string, unknown>;
      const base =
        stored && typeof stored === 'object'
          ? stored
          : {
              theme: 'system',
              fontScale: 1,
              reducedMotion: false,
              backupReminder: true,
              simulationOnly: false,
            };
      localStorage.setItem(key, JSON.stringify({ ...base, tutorial: { week: true, match: true } }));
    } catch {
      // Storage may be unavailable; the tutorial then shows, as it would for a player.
    }
  });
}

/**
 * Console errors that come from the browser itself rather than the game. Firefox on Linux
 * reports an internal "Navigated away from page" error, with no script location, on ordinary
 * navigations; anything with a web location is still treated as a real error. Errors located in
 * browser-internal chrome:// code, such as Playwright's Firefox instrumentation reporting
 * NS_BINDING_ABORTED when a navigation cancels a worker request, never come from game code.
 * NS_BINDING_ABORTED is Firefox's own code for a request cancelled by a navigation; it can
 * also be attributed to the worker script whose load was cancelled, and is never game code.
 */
/**
 * A load the browser cancelled because the page navigated, went offline or reloaded while it
 * was still fetching: each engine reports it differently, and never from game code. A load
 * that is genuinely missing still breaks what the journey checks on screen, so tests keep
 * catching real failures.
 */
const ABORTED_LOAD = new RegExp(
  [
    'NS_BINDING_ABORTED',
    'error loading dynamically imported module',
    'Failed to fetch dynamically imported module',
    'Importing a module script failed',
    'due to access control checks',
    'ServiceWorker intercepted the request and encountered an unexpected error',
  ].join('|'),
);
const isAbortedLoad = (text: string): boolean => ABORTED_LOAD.test(text);

function isBrowserNoise(message: ConsoleMessage): boolean {
  const { url } = message.location();
  return (
    isAbortedLoad(message.text()) ||
    (message.text() === '[JavaScript Error: "InvalidStateError: Navigated away from page"]' &&
      !url) ||
    url.startsWith('chrome://') ||
    /\{file: "chrome:\/\/juggler\//.test(message.text()) ||
    message.text().startsWith('[JavaScript Error: "NS_BINDING_ABORTED"')
  );
}

/**
 * The journeys' `test` and `expect`. Every test's page fails it on a console error, an uncaught
 * exception or an unhandled promise rejection (AGENTS.md §11), apart from the browser noise
 * above; the check runs when the test ends, after its own hooks. `runtimeErrors` is what has
 * been collected so far, for a journey that wants to look at it sooner.
 */
export const test = base.extend<{ runtimeErrors: string[] }>({
  runtimeErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => {
        if (!isAbortedLoad(error.message)) errors.push(error.message);
      });
      page.on('console', (message) => {
        if (message.type() === 'error' && !isBrowserNoise(message))
          errors.push(`${message.text()} (${message.location().url || 'no location'})`);
      });
      // An unhandled rejection becomes an uncaught error, which every engine reports.
      await page.addInitScript(() => {
        window.addEventListener('unhandledrejection', (event) => {
          throw new Error(`Unhandled rejection: ${String(event.reason)}`);
        });
      });
      await use(errors);
      expect(errors, 'console errors, uncaught exceptions and unhandled rejections').toEqual([]);
    },
    { auto: true },
  ],
});
export { expect };

/**
 * Wait until the page has stopped moving: no finite CSS or Web Animation running (Framer Motion
 * runs its transitions as Web Animations) and every scroll position the same a frame later.
 * For a layout measurement or a screenshot right after something changed, instead of a sleep.
 */
export async function settled(page: Page): Promise<void> {
  await page.waitForFunction(async () => {
    const moving = () =>
      document
        .getAnimations()
        .some(
          (animation) =>
            animation.playState === 'running' &&
            Number.isFinite(Number(animation.effect?.getComputedTiming().endTime ?? 0)),
        );
    const scrolls = () => {
      const positions = [window.scrollX, window.scrollY];
      for (const element of document.querySelectorAll('*'))
        if (element.scrollTop || element.scrollLeft)
          positions.push(element.scrollTop, element.scrollLeft);
      return positions.join();
    };
    const before = scrolls();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return !moving() && scrolls() === before;
  });
}

/** The career group each page tab belongs to (src/screens/career/navigation.ts). */
const CAREER_GROUP: Record<string, string> = {
  Hub: 'Overview',
  Calendar: 'Overview',
  Inbox: 'Overview',
  Profile: 'Player',
  Skills: 'Player',
  Training: 'Player',
  'National team': 'Player',
  'Club life': 'Club',
  Transfers: 'Club',
  Agent: 'Club',
  Media: 'Life',
  Rival: 'Life',
  Lifestyle: 'Life',
  Wardrobe: 'Life',
  Trophies: 'History',
  Chronicle: 'History',
  Moments: 'History',
  Legacy: 'History',
};
/** A career group's link; Overview's name also carries its unread count ("Overview, 2 unread"). */
export const groupLinkName = (group: string) => new RegExp(`^${group}\\s*(,|$)`);
/** The page tabs of the current career group, such as "Player pages". */
export const careerTabs = (page: Page, group?: string) =>
  page.getByRole('navigation', { name: group ? `${group} pages` : /pages$/ });
/**
 * Open a career page the way a player would: its group in the sidebar (desktop) or the bottom
 * bar or More sheet (phones), then its tab.
 */
/** A page tab's accessible name, allowing an unread count ("Inbox · 2 unread"). */
export function tabName(name: string): RegExp {
  return new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}( · \\d+ unread)?$`);
}
export async function openCareerPage(page: Page, name: string): Promise<void> {
  const group = CAREER_GROUP[name];
  if (!group) throw new Error(`Unknown career page ${name}`);
  const tabs = careerTabs(page, group);
  if (!(await tabs.isVisible())) {
    const bar = page.locator('.bottom-nav');
    if (await bar.isVisible()) {
      if (group === 'History') {
        await bar.getByRole('button', { name: 'More' }).click();
        await page.getByRole('dialog', { name: 'More' }).getByRole('link', { name }).click();
        return;
      }
      await bar.getByRole('link', { name: groupLinkName(group) }).click();
    } else
      await page
        .getByRole('navigation', { name: 'Main navigation' })
        .first()
        .getByRole('link', { name: groupLinkName(group) })
        .click();
  }
  await tabs.getByRole('link', { name: tabName(name) }).click();
}

/**
 * Wait for a recorded match's XP and close the level-up moment if the match brought one
 * (release 1.0, step 5.1): it is modal, so journeys that go on from the report close it first.
 * Returns whether it was shown.
 */
export async function recordedReport(page: Page): Promise<boolean> {
  await expect(page.getByTestId('career-xp')).toContainText('XP earned', { timeout: 60000 });
  // The moment opens in an effect after the XP is drawn.
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  const moment = page.getByTestId('level-up');
  if (!(await moment.isVisible())) return false;
  await page.keyboard.press('Escape');
  await expect(moment).toHaveCount(0);
  return true;
}

/** The match screen's state: `data-status`, `data-minute` and the reel's `data-beat`. */
export const matchState = (page: Page) => page.getByTestId('match-state');
/**
 * The touchline's answers, the first (the manager's default) of whichever is asking: half-time,
 * a knock, being substituted, the captain's call.
 */
const CALLS = [
  '[data-testid="halftime-talk"] button',
  '[data-testid="injury-decision"] button',
  '[data-testid="substitution-talk"] button',
  '.match-captain-options button',
].join(', ');
/**
 * Play the live reel (release 1.0, X1b) to full time: Space skips the ticker and each clip to
 * its outcome, a key answers each decision card once its first choice has focus (after the
 * card's 300 ms guard), and the default answer goes to every touchline call. Returns the
 * decision steps answered.
 */
export async function playReel(page: Page, { key = '1', skip = true } = {}): Promise<number> {
  const state = matchState(page);
  let decisions = 0;
  for (let turns = 0; turns < 600; turns++) {
    const status = await state.getAttribute('data-status');
    if (status === 'finished') return decisions;
    const beat = await state.getAttribute('data-beat');
    const card = page.locator('.reel-card');
    if (beat === 'card' && (await card.isVisible())) {
      await expect(card.locator('button[data-choice]').first()).toBeFocused();
      const momentId = await state.getAttribute('data-moment');
      await page.waitForTimeout(320);
      await page.keyboard.press(key);
      decisions++;
      // The card goes, or the chain's next step replaces it.
      await expect(state).not.toHaveAttribute('data-moment', momentId ?? '');
      continue;
    }
    const call = page.locator(CALLS).first();
    if ((beat === 'wait' || status === 'halftime') && (await call.isVisible())) {
      await call.click();
      continue;
    }
    if (skip && beat !== 'wait' && beat !== 'idle') await page.keyboard.press('Space');
    await page.waitForTimeout(120);
  }
  throw new Error('The match did not reach full time');
}
/** Import a backup into slot 1 and open the match screen. */
export async function importToMatch(page: Page, backup: string | BackupPayload): Promise<void> {
  await page.goto('/saves');
  await page
    .locator('.slot-card')
    .first()
    .getByLabel('Import backup — Slot 1')
    .setInputFiles(backup);
  await expect(page.locator('.notice')).toHaveText('Save imported.', { timeout: 60000 });
  await page.goto('/match?save=1');
}
