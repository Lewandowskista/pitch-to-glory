import { platform, type PlatformAdapter } from '../platform';
import { APP_VERSION } from '../release/version';
import { scrubMessage } from './scrub';

/**
 * Local diagnostics without telemetry (release 1.0 step 4.7): a small log of what went wrong on
 * this device — caught render errors, uncaught errors, unhandled rejections, failed code loads
 * and worker failures — kept through the platform adapter (`diagnostics`), never in a save and
 * never sent. Messages are scrubbed exactly like analytics: no addresses, paths, quoted text or
 * numbers, and no stack. Settings shows it and exports it as a file the player can attach to a
 * bug report; analytics' `error` event reads from it, under the player's consent.
 */
export type DiagnosticKind = 'error' | 'unhandledrejection' | 'preload' | 'worker' | 'boundary';
/** Where a failure was caught: a fixed tag, never free text. */
export type DiagnosticSource =
  'window' | 'route' | 'pitch' | 'app' | 'world' | 'persistence' | 'audio';
export interface DiagnosticEntry {
  kind: DiagnosticKind;
  source: DiagnosticSource;
  /** The scrubbed message, with the error's class name ("TypeError: …"). */
  message: string;
  /** The app's route pattern when it happened (`/career/profile`, or `other`). */
  route: string;
  version: string;
  /** ISO time of the latest occurrence. */
  time: string;
  /** Identical consecutive failures are counted, so a loop cannot push out the rest. */
  count: number;
}
/** The most entries kept; the oldest are dropped first. */
export const DIAGNOSTICS_LIMIT = 50;
const KINDS: readonly DiagnosticKind[] = [
  'error',
  'unhandledrejection',
  'preload',
  'worker',
  'boundary',
];
const SOURCES: readonly DiagnosticSource[] = [
  'window',
  'route',
  'pitch',
  'app',
  'world',
  'persistence',
  'audio',
];

/** An error's class and message, before scrubbing. Anything else by its type. */
export function errorMessage(error: unknown): string {
  if (error instanceof Error || (error && typeof error === 'object' && 'message' in error)) {
    const { name, message } = error as { name?: unknown; message?: unknown };
    const label = typeof name === 'string' && /^[A-Za-z]{1,40}$/.test(name) ? name : 'Error';
    return `${label}: ${String(message ?? '')}`;
  }
  if (typeof error === 'string') return error;
  return error === undefined || error === null ? 'No reason given' : `A ${typeof error} value`;
}
/** A route as a pattern of lower-case words; anything else is `other`. */
export const routeOf = (pathname: string): string =>
  /^\/(?:[a-z-]{1,24}(?:\/[a-z-]{1,24})?)?$/.test(pathname) ? pathname : 'other';

/** `entries` with `entry` added: counted onto an identical latest entry, capped at `limit`. */
export function addEntry(
  entries: readonly DiagnosticEntry[],
  entry: Omit<DiagnosticEntry, 'count'>,
  limit = DIAGNOSTICS_LIMIT,
): DiagnosticEntry[] {
  const last = entries.at(-1);
  if (
    last &&
    last.kind === entry.kind &&
    last.source === entry.source &&
    last.message === entry.message &&
    last.route === entry.route
  )
    return [...entries.slice(0, -1), { ...last, time: entry.time, count: last.count + 1 }];
  return [...entries, { ...entry, count: 1 }].slice(-limit);
}

const isEntry = (value: unknown): value is DiagnosticEntry => {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Record<string, unknown>;
  return (
    KINDS.includes(entry.kind as DiagnosticKind) &&
    SOURCES.includes(entry.source as DiagnosticSource) &&
    typeof entry.message === 'string' &&
    entry.message.length <= 200 &&
    typeof entry.route === 'string' &&
    entry.route.length <= 60 &&
    typeof entry.version === 'string' &&
    entry.version.length <= 40 &&
    typeof entry.time === 'string' &&
    entry.time.length <= 40 &&
    Number.isSafeInteger(entry.count) &&
    (entry.count as number) > 0
  );
};
/** The stored log, keeping only well-formed entries (a damaged record reads as empty). */
export function parseEntries(text: string | null): DiagnosticEntry[] {
  if (!text) return [];
  try {
    const value = JSON.parse(text) as unknown;
    return Array.isArray(value) ? value.filter(isEntry).slice(-DIAGNOSTICS_LIMIT) : [];
  } catch {
    return [];
  }
}

type Store = Pick<PlatformAdapter, 'readRecord' | 'writeRecord'>;
type Listener = (entry: DiagnosticEntry) => void;
/** The log of one device: read once, written on every change. */
export function createDiagnostics(store: Store, now: () => Date = () => new Date()) {
  let entries: DiagnosticEntry[] | null = null;
  const changes = new Set<() => void>();
  const recorded = new Set<Listener>();
  /** This page load's entries, so a listener added later still hears about them. */
  const session: DiagnosticEntry[] = [];
  const read = (): DiagnosticEntry[] => (entries ??= parseEntries(store.readRecord('diagnostics')));
  const write = (next: DiagnosticEntry[]) => {
    entries = next;
    store.writeRecord('diagnostics', next.length ? JSON.stringify(next) : null);
    for (const change of changes) change();
  };
  return {
    entries: read,
    record(
      kind: DiagnosticKind,
      error: unknown,
      source: DiagnosticSource,
      pathname = '/',
    ): DiagnosticEntry {
      const entry = {
        kind,
        source,
        message: scrubMessage(errorMessage(error)),
        route: routeOf(pathname),
        version: APP_VERSION,
        time: now().toISOString(),
      };
      const next = addEntry(read(), entry);
      const added = next.at(-1)!;
      session.push({ ...entry, count: 1 });
      write(next);
      for (const listener of recorded) listener({ ...entry, count: 1 });
      return added;
    },
    clear: () => write([]),
    /** Changes to the log (for Settings). */
    subscribe(listener: () => void): () => void {
      changes.add(listener);
      return () => changes.delete(listener);
    },
    /** Every entry recorded from now on, after this page load's earlier ones (analytics). */
    onRecord(listener: Listener): () => void {
      for (const entry of session) listener(entry);
      recorded.add(listener);
      return () => recorded.delete(listener);
    },
  };
}
export type Diagnostics = ReturnType<typeof createDiagnostics>;

/** This device's diagnostics log. */
export const diagnostics: Diagnostics = createDiagnostics(platform);
const here = () => (typeof location === 'undefined' ? '/' : location.pathname);
/** Record a failure the app caught or saw (scrubbed; nothing leaves the device). */
export function recordFailure(
  kind: DiagnosticKind,
  error: unknown,
  source: DiagnosticSource,
): void {
  try {
    diagnostics.record(kind, error, source, here());
  } catch {
    // The log is a convenience: it must never be the next failure.
  }
}

/**
 * Whether an unhandled rejection came from the game's own code rather than a browser extension
 * or an injected script: an error whose stack runs through this origin's scripts and through no
 * extension. A reason without a stack is not claimed.
 */
export function appOriginated(reason: unknown, origin: string): boolean {
  const stack =
    reason && typeof reason === 'object' && 'stack' in reason
      ? String((reason as { stack?: unknown }).stack ?? '')
      : '';
  if (!stack || /(?:chrome|moz|safari(?:-web)?)-extension:\/\//.test(stack)) return false;
  return stack.includes(origin);
}

/** A failure the player should hear about, without blocking play (an unhandled rejection). */
let notice = false;
const noticeListeners = new Set<() => void>();
const setNotice = (open: boolean) => {
  if (notice === open) return;
  notice = open;
  for (const listener of noticeListeners) listener();
};
export const failureNotice = {
  get: () => notice,
  dismiss: () => setNotice(false),
  subscribe(listener: () => void): () => void {
    noticeListeners.add(listener);
    return () => noticeListeners.delete(listener);
  },
};

let installed = false;
/**
 * Listen for what the app does not catch itself: uncaught errors, unhandled rejections and Vite's
 * failed code loads (`vite:preloadError`, which also covers a failed dynamic import). Nothing is
 * prevented, so the browser still reports each one as before.
 */
export function installDiagnostics(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('error', (event: ErrorEvent) =>
    recordFailure('error', event.error ?? event.message, 'window'),
  );
  window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
    recordFailure('unhandledrejection', event.reason, 'window');
    if (appOriginated(event.reason, location.origin)) setNotice(true);
  });
  window.addEventListener('vite:preloadError', (event) =>
    recordFailure('preload', (event as Event & { payload?: unknown }).payload, 'app'),
  );
}
