import { compareVersions, isVersion } from './semver';

/**
 * The "Updated to x.y.z" notice: shown once the app starts on a version newer than the last one
 * this browser has seen. Kept tiny for the app shell; the patch notes themselves load only with
 * the What's new screen.
 */
export const LAST_SEEN_KEY = 'ptg-last-version';

/** Where the last-seen version lives. Reads and writes never throw. */
export interface VersionStore {
  read(): string | null;
  write(version: string): void;
}

/** This browser's localStorage. Private windows and blocked storage can throw on any access. */
export const browserVersionStore: VersionStore = {
  read() {
    try {
      return localStorage.getItem(LAST_SEEN_KEY);
    } catch {
      return null;
    }
  },
  write(version) {
    try {
      localStorage.setItem(LAST_SEEN_KEY, version);
    } catch {
      // Without storage the notice simply never shows.
    }
  },
};

/**
 * Whether a player who last saw `lastSeen` should be told about `current`. Never on a first
 * visit (nothing stored), never for the same or an older version, never for a value this code
 * cannot read.
 */
export function shouldShowUpdateNotice(current: string, lastSeen: string | null): boolean {
  if (lastSeen === null || !isVersion(lastSeen) || !isVersion(current)) return false;
  return compareVersions(current, lastSeen) > 0;
}

/**
 * Run once when the app starts: the version the player is coming from when the notice should
 * show, otherwise null. A first visit (or an unreadable value) records the current version, so
 * the next release is noticed; an update is recorded only when the player acknowledges it.
 */
export function startupUpdateNotice(
  current: string,
  store: VersionStore = browserVersionStore,
): string | null {
  const lastSeen = store.read();
  if (shouldShowUpdateNotice(current, lastSeen)) return lastSeen;
  if (lastSeen === null || !isVersion(lastSeen)) store.write(current);
  return null;
}

/** The player has seen the notice (dismissed it or opened What's new). */
export function acknowledgeUpdate(
  current: string,
  store: VersionStore = browserVersionStore,
): void {
  store.write(current);
}
