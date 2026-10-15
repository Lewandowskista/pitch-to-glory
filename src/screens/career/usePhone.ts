import { useSyncExternalStore } from 'react';

/** The shell's phone layout (bottom tab bar), the same breakpoint as `--tabbar`. */
export const PHONE_QUERY = '(max-width: 700px)';

/** Whether the shell is in its phone layout; follows resizes and rotation. */
export function usePhone(): boolean {
  return useSyncExternalStore(
    (change) => {
      const list = window.matchMedia(PHONE_QUERY);
      list.addEventListener('change', change);
      return () => list.removeEventListener('change', change);
    },
    () => window.matchMedia(PHONE_QUERY).matches,
    () => false,
  );
}
