import { useEffect, useRef, useSyncExternalStore } from 'react';
import { registerSW } from 'virtual:pwa-register';

/**
 * Service-worker registration, deferred until the page has loaded and the browser is idle
 * (release 1.0 step 3.10, review P10). Registering installs the worker, which downloads the
 * whole precache (about 3.4 MB); doing that while the landing page is still loading competes
 * with what the player is waiting for. The update prompt and offline play are unchanged: they
 * follow registration, which now simply happens a moment later.
 *
 * The same contract as vite-plugin-pwa's `useRegisterSW`, which registers on mount.
 */
export interface ServiceWorkerOptions {
  /** A new worker took control after an update: the page should reload safely. */
  onNeedReload?: () => void;
  onRegisterError?: (error: unknown) => void;
}
interface State {
  offlineReady: boolean;
  needRefresh: boolean;
}
let state: State = { offlineReady: false, needRefresh: false };
const listeners = new Set<() => void>();
const set = (patch: Partial<State>) => {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
};
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
let options: ServiceWorkerOptions = {};
let update: ((reload?: boolean) => Promise<void>) | null = null;

/** Run `start` once the page has loaded and the main thread is idle (bounded by `timeout`). */
export function afterLoadAndIdle(start: () => void, timeout = 3000): () => void {
  let cancelled = false;
  let idle: number | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const run = () => {
    if (!cancelled) start();
  };
  const schedule = () => {
    if (cancelled) return;
    // Safari has no requestIdleCallback: a macrotask after load is the next best thing.
    if (typeof requestIdleCallback === 'function') idle = requestIdleCallback(run, { timeout });
    else timer = setTimeout(run, 200);
  };
  if (document.readyState === 'complete') schedule();
  else window.addEventListener('load', schedule, { once: true });
  return () => {
    cancelled = true;
    window.removeEventListener('load', schedule);
    if (idle !== undefined) cancelIdleCallback(idle);
    clearTimeout(timer);
  };
}

function register(): void {
  if (update) return;
  update = registerSW({
    immediate: true,
    onNeedReload: () => options.onNeedReload?.(),
    onNeedRefresh: () => set({ needRefresh: true }),
    onOfflineReady: () => set({ offlineReady: true }),
    onRegisterError: (error) => options.onRegisterError?.(error),
  });
}

export function useServiceWorker(next: ServiceWorkerOptions) {
  const latest = useRef(next);
  useEffect(() => {
    latest.current = next;
  });
  useEffect(() => {
    options = {
      onNeedReload: () => latest.current.onNeedReload?.(),
      onRegisterError: (error) => latest.current.onRegisterError?.(error),
    };
    return afterLoadAndIdle(register);
  }, []);
  const current = useSyncExternalStore(
    subscribe,
    () => state,
    () => state,
  );
  return {
    offlineReady: [current.offlineReady, (offlineReady: boolean) => set({ offlineReady })],
    needRefresh: [current.needRefresh, (needRefresh: boolean) => set({ needRefresh })],
    /** Activate the waiting worker; resolves at once if nothing is registered yet. */
    updateServiceWorker: async (reload?: boolean) => {
      await update?.(reload);
    },
  } as const;
}
