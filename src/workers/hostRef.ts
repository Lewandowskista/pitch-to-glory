/**
 * The world worker's client (host.ts) loads with the first job, save or warm-up, not with the
 * screen that may start one, so it stays out of every route's first render.
 */
type Host = typeof import('./host');
let loading: Promise<Host> | null = null;
let loaded: Host | null = null;
export function loadHost(): Promise<Host> {
  loading ??= import('./host').then(
    (host) => (loaded = host),
    (error: unknown) => {
      loading = null;
      throw error;
    },
  );
  return loading;
}
/** The client if it has loaded: with none, there is no world worker to act on. */
export function loadedHost(): Host | null {
  return loaded;
}
