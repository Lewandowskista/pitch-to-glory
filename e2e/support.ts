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
 */
export function isBrowserNoise(message: ConsoleMessage): boolean {
  const { url } = message.location();
  return (
    (message.text() === '[JavaScript Error: "InvalidStateError: Navigated away from page"]' &&
      !url) ||
    url.startsWith('chrome://') ||
    /\{file: "chrome:\/\/juggler\//.test(message.text())
  );
}
