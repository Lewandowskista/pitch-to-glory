import type { ConsoleMessage, Page } from '@playwright/test';

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
export const isAbortedLoad = (text: string): boolean => ABORTED_LOAD.test(text);

export function isBrowserNoise(message: ConsoleMessage): boolean {
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
