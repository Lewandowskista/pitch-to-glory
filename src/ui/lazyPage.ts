import { createElement, lazy, type ComponentType } from 'react';

/**
 * Leaving the page (a reload, or a link away) cancels downloads still in flight. A screen whose
 * code was cancelled that way would otherwise throw into the error boundary of a page that is
 * already going away, and show the error screen for a moment; it waits for the navigation
 * instead. A load that fails while the player stays still reaches the boundary as before. An
 * exit another listener cancels (unsaved changes) stops counting as leaving after a moment.
 */
let leaving = false;
let settle: ReturnType<typeof setTimeout> | undefined;
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    leaving = true;
    clearTimeout(settle);
    settle = setTimeout(() => (leaving = false), 3000);
  });
  window.addEventListener('pageshow', () => (leaving = false));
}
/** How long the automatic second attempt waits after a failed load. */
export const RETRY_DELAY_MS = 700;

/**
 * Load once more after a failure (release 1.0 step 4.2): a dropped connection or a server that
 * blinked is usually fine a moment later. Firefox and Safari fetch the code again; Chromium
 * keeps a failed module for the page's life, so there the second attempt fails at once and the
 * boundary offers a reload. A load cancelled by leaving the page never settles (above).
 */
export async function loadWithRetry<T>(
  load: () => Promise<T>,
  wait: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  isLeaving: () => boolean = () => leaving,
): Promise<T> {
  const never = () => new Promise<T>(() => {});
  try {
    return await load();
  } catch {
    if (isLeaving()) return never();
    await wait(RETRY_DELAY_MS);
    try {
      return await load();
    } catch (error) {
      if (isLeaving()) return never();
      throw error;
    }
  }
}

/**
 * Whether an error is a failed code download rather than a fault in the code: each engine words
 * it differently, and Vite's own preload failure is a fourth.
 */
export function isLoadFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS|ChunkLoadError|Loading chunk/i.test(
    message,
  );
}

/** Pages whose code failed to load, made ready to try again by `retryFailedPages`. */
const failed = new Set<() => void>();
/** Let every page whose code failed to load try again on its next render (the boundary's Retry). */
export function retryFailedPages(): void {
  for (const reset of [...failed]) reset();
}

/**
 * `React.lazy` with one automatic retry, and a fresh start after the boundary's Retry: React
 * remembers a lazy component's failure for good, so a failed page is replaced by a new lazy
 * component that loads again.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the same bound as React.lazy
export function lazyPage<T extends ComponentType<any>>(load: () => Promise<{ default: T }>): T {
  const create = () =>
    lazy(() =>
      loadWithRetry(load).catch((error: unknown) => {
        failed.add(reset);
        throw error;
      }),
    );
  let current = create();
  function reset() {
    failed.delete(reset);
    current = create();
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- forwarded as they came
  const Page = (props: any) => createElement(current, props);
  return Page as unknown as T;
}
