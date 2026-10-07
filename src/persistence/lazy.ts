/**
 * The save system (IndexedDB, validation, migrations and the engine code they use) is not
 * needed to draw the first screen, so the app loads it on first use, or when the browser is
 * idle after startup. Every call shares one import.
 */
type Api = typeof import('./api');
let loading: Promise<Api> | null = null;
let loaded: Api | null = null;
export function persistence(): Promise<Api> {
  loading ??= import('./api').then(
    (api) => (loaded = api),
    (error: unknown) => {
      // Retry on the next call rather than failing for the rest of the session.
      loading = null;
      throw error;
    },
  );
  return loading;
}
/** The save system if it has finished loading, for paths that must act synchronously. */
export function loadedPersistence(): Api | null {
  return loaded;
}
/**
 * Whether this browser may hold saves. Only a browser that can list its databases and has no
 * save database answers false; a first-time visitor then never downloads the save system
 * just to find out there is nothing to continue.
 */
export async function mayHaveSaves(): Promise<boolean> {
  try {
    if (typeof indexedDB === 'undefined' || !('databases' in indexedDB)) return true;
    const databases = await indexedDB.databases();
    return databases.some((database) => database.name === 'pitch-to-glory');
  } catch {
    return true;
  }
}
/**
 * For a returning player, load the save system once the browser is idle after startup, so the
 * first load or autosave is not delayed. A new player gets it when they first need it.
 */
export function preloadPersistence(): void {
  const start = () => void persistence().catch(() => undefined);
  void mayHaveSaves().then((saves) => {
    if (!saves) return;
    if ('requestIdleCallback' in window) window.requestIdleCallback(start, { timeout: 4000 });
    else setTimeout(start, 2000);
  });
}
