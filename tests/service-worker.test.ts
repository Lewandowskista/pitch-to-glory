import { afterEach, expect, it, vi } from 'vitest';

vi.mock('virtual:pwa-register', () => ({ registerSW: vi.fn() }));
import { afterLoadAndIdle } from '../src/ui/serviceWorker';

function page(readyState: 'loading' | 'complete', idle: boolean) {
  const load = new Set<() => void>();
  const idleCallbacks: (() => void)[] = [];
  vi.stubGlobal('document', { readyState });
  vi.stubGlobal('window', {
    addEventListener: (_: string, fn: () => void) => load.add(fn),
    removeEventListener: (_: string, fn: () => void) => load.delete(fn),
  });
  if (idle) {
    vi.stubGlobal('requestIdleCallback', (fn: () => void) => idleCallbacks.push(fn));
    vi.stubGlobal('cancelIdleCallback', vi.fn());
  } else vi.stubGlobal('requestIdleCallback', undefined);
  return {
    fireLoad: () => [...load].forEach((fn) => fn()),
    fireIdle: () => idleCallbacks.splice(0).forEach((fn) => fn()),
  };
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it('registers the service worker only after load, once the browser is idle', () => {
  const browser = page('loading', true);
  const start = vi.fn();
  afterLoadAndIdle(start);
  browser.fireIdle();
  expect(start).not.toHaveBeenCalled();
  browser.fireLoad();
  expect(start).not.toHaveBeenCalled();
  browser.fireIdle();
  expect(start).toHaveBeenCalledOnce();
});

it('waits for a macrotask after load where there is no idle callback (Safari)', () => {
  vi.useFakeTimers();
  page('complete', false);
  const start = vi.fn();
  afterLoadAndIdle(start);
  expect(start).not.toHaveBeenCalled();
  vi.advanceTimersByTime(250);
  expect(start).toHaveBeenCalledOnce();
});

it('does nothing once cancelled, such as when the prompt unmounts first', () => {
  const browser = page('loading', true);
  const start = vi.fn();
  const cancel = afterLoadAndIdle(start);
  browser.fireLoad();
  cancel();
  browser.fireIdle();
  expect(start).not.toHaveBeenCalled();
});
