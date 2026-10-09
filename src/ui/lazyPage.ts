import { lazy, type ComponentType } from 'react';

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the same bound as React.lazy
export function lazyPage<T extends ComponentType<any>>(load: () => Promise<{ default: T }>) {
  return lazy(() =>
    load().catch((error: unknown) =>
      leaving ? new Promise<{ default: T }>(() => {}) : Promise.reject(error),
    ),
  );
}
