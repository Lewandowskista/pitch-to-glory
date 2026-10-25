import { useSyncExternalStore } from 'react';
import type { AnalyticsTestOverride } from './config';
import type { EventName, EventProps } from './events';

/**
 * The always-loaded part of analytics (docs/ANALYTICS.md): a few lines that hold events in
 * memory until the client, loaded when the browser is idle after startup, takes them over. With
 * no project key, or under automation, `track` does nothing and the client is never downloaded.
 * The full configuration (src/analytics/config.ts) is read by the client, off the critical path.
 */
const automated = typeof navigator !== 'undefined' && navigator.webdriver === true;
const on =
  typeof window !== 'undefined' &&
  (automated
    ? Boolean((window as { __ptgAnalyticsTest?: AnalyticsTestOverride }).__ptgAnalyticsTest?.key)
    : Boolean(import.meta.env.VITE_POSTHOG_KEY));
/** The most events held before the client loads; any beyond are dropped. */
const BACKLOG_LIMIT = 100;
type Sink = (event: EventName, properties: Record<string, unknown>, time: number) => void;
export interface Tracked {
  event: EventName;
  properties: Record<string, unknown>;
  time: number;
}
const backlog: Tracked[] = [];
let sink: Sink | null = null;
let started = false;

/** Record an event. Properties are checked against the allow-list before anything is sent. */
export function track<E extends EventName>(event: E, properties: EventProps<E> = {}): void {
  if (!on) return;
  if (sink) sink(event, properties, Date.now());
  else if (backlog.length < BACKLOG_LIMIT) backlog.push({ event, properties, time: Date.now() });
}

/** Start once the app has rendered: capture errors now, load the client when the browser idles. */
export function startAnalytics(): void {
  if (!on || started) return;
  started = true;
  // The message only: the client scrubs it and nothing else about the error is sent.
  const report = (event: ErrorEvent | PromiseRejectionEvent) =>
    track('error', {
      kind: event.type,
      message: String(('reason' in event ? event.reason?.message : event.message) ?? ''),
    });
  addEventListener('error', report);
  addEventListener('unhandledrejection', report);
  const load = () =>
    void import('./runtime').then(
      (runtime) => (sink = runtime.start(backlog.splice(0))),
      () => undefined,
    );
  // Safari has no idle callback: two seconds after the page has loaded instead.
  const idle = () =>
    (window.requestIdleCallback ?? ((callback) => setTimeout(callback, 2000)))(load, {
      timeout: 5000,
    });
  if (document.readyState === 'complete') idle();
  else addEventListener('load', idle, { once: true });
}

/**
 * The one-time invitation to share play over time (tier 2), raised by the client after the
 * first finished match and shown by the app shell.
 */
let invitation = false;
const listeners = new Set<() => void>();
export function setConsentInvitation(open: boolean): void {
  if (invitation === open) return;
  invitation = open;
  for (const listener of listeners) listener();
}
export function useConsentInvitation(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => invitation,
    () => invitation,
  );
}
