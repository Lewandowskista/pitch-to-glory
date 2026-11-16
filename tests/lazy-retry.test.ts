import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('virtual:pwa-register', () => ({ registerSW: vi.fn() }));
import { isLoadFailure, loadWithRetry, RETRY_DELAY_MS } from '../src/ui/lazyPage';
import { checkForUpdatesOnReturn, UPDATE_CHECK_MS } from '../src/ui/serviceWorker';

afterEach(() => vi.restoreAllMocks());
const wait = async () => {};
const staying = () => false;

describe('failed code loads', () => {
  it('loads once when the first attempt works', async () => {
    const load = vi.fn(async () => 'page');
    await expect(loadWithRetry(load, wait, staying)).resolves.toBe('page');
    expect(load).toHaveBeenCalledOnce();
  });

  it('tries once more after a pause, and uses the second attempt', async () => {
    const pause = vi.fn(async () => {});
    const load = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new TypeError('Failed to fetch dynamically imported module: x'))
      .mockResolvedValueOnce('page');
    await expect(loadWithRetry(load, pause, staying)).resolves.toBe('page');
    expect(load).toHaveBeenCalledTimes(2);
    expect(pause).toHaveBeenCalledWith(RETRY_DELAY_MS);
  });

  it('gives the second failure to the boundary, and never tries a third time', async () => {
    const second = new TypeError('Importing a module script failed.');
    const load = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new TypeError('first'))
      .mockRejectedValueOnce(second);
    await expect(loadWithRetry(load, wait, staying)).rejects.toBe(second);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('waits quietly while the page is being left', async () => {
    const load = vi.fn(() => Promise.reject(new Error('aborted')));
    let settled = false;
    void loadWithRetry(load, wait, () => true).finally(() => (settled = true));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(settled).toBe(false);
    expect(load).toHaveBeenCalledOnce();
  });

  it('tells a failed download from a fault in the code, in every engine', () => {
    for (const message of [
      'Failed to fetch dynamically imported module: https://x/assets/a.js',
      'error loading dynamically imported module: https://x/assets/a.js',
      'Importing a module script failed.',
      'Unable to preload CSS for /assets/a.css',
    ])
      expect(isLoadFailure(new TypeError(message))).toBe(true);
    expect(isLoadFailure(new TypeError("Cannot read properties of undefined (reading 'x')"))).toBe(
      false,
    );
  });
});

describe('looking for updates when the game is back in view', () => {
  function target() {
    const listeners = new Map<string, Set<() => void>>();
    return {
      addEventListener: (type: string, fn: () => void) =>
        listeners.set(type, (listeners.get(type) ?? new Set()).add(fn)),
      removeEventListener: (type: string, fn: () => void) => listeners.get(type)?.delete(fn),
      fire: (type: string) => listeners.get(type)?.forEach((fn) => fn()),
    };
  }
  it('checks at most once per interval, only while visible, and survives offline', async () => {
    const events = target();
    const update = vi.fn(() => Promise.reject(new Error('offline')));
    let now = 0;
    let visible = true;
    const stop = checkForUpdatesOnReturn(
      { update } as unknown as ServiceWorkerRegistration,
      events as unknown as Window,
      () => visible,
      () => now,
    );
    events.fire('focus');
    expect(update).not.toHaveBeenCalled();
    now = UPDATE_CHECK_MS;
    visible = false;
    events.fire('visibilitychange');
    expect(update).not.toHaveBeenCalled();
    visible = true;
    events.fire('visibilitychange');
    events.fire('focus');
    expect(update).toHaveBeenCalledOnce();
    await Promise.resolve();
    now = 2 * UPDATE_CHECK_MS;
    stop();
    events.fire('focus');
    expect(update).toHaveBeenCalledOnce();
  });
});
