import { platform } from '../platform';
import { CONFIG } from '../engine/config';
import { APP_VERSION } from '../release/version';
import { useAppStore } from '../store';
import { ANALYTICS, analyticsConfig } from './config';
import { createClient } from './client';
import { randomId } from './consent';
import type { EventName, PropertyValue } from './events';
import type { Tracked } from '.';

/**
 * The lazily loaded half of analytics: the client, the properties every event carries, page
 * lifecycle events and the events derived from the store. Loaded by `startAnalytics` when the
 * browser is idle, so none of it is on the critical path.
 */

/** The app's routes; anything else (a mistyped address) is reported as `other`. */
const ROUTES = new Set([
  '/',
  '/gallery',
  '/saves',
  '/settings',
  '/privacy',
  '/world',
  '/edit',
  '/match',
  '/moment',
  '/whats-new',
  '/career',
  '/career/new',
  ...[
    'profile',
    'skills',
    'training',
    'transfers',
    'agent',
    'inbox',
    'calendar',
    'club',
    'media',
    'rival',
    'lifestyle',
    'wardrobe',
    'national',
    'preseason',
    'trophies',
    'chronicle',
    'moments',
    'legacy',
  ].map((page) => `/career/${page}`),
]);
export const routePattern = (pathname: string): string => {
  const path = pathname.replace(/\/+$/, '') || '/';
  return ROUTES.has(path) ? path : 'other';
};

/** Coarse device facts: enough to compare phones with desktops, too coarse to single one out. */
export function deviceContext(): Record<string, PropertyValue> {
  const cores = navigator.hardwareConcurrency || 0;
  const memory = (navigator as { deviceMemory?: number }).deviceMemory;
  const width = window.innerWidth;
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const low = cores <= 2 || (memory !== undefined && memory <= 2);
  const high = cores >= 8 && (memory === undefined || memory >= 8);
  return {
    device_class: low ? 'low' : high ? 'high' : 'mid',
    cores: cores <= 2 ? 2 : cores <= 4 ? 4 : cores <= 8 ? 8 : 16,
    ...(memory !== undefined ? { memory: Math.min(memory, 8) } : {}),
    viewport:
      width < 480 ? 'xs' : width < 768 ? 'sm' : width < 1024 ? 'md' : width < 1440 ? 'lg' : 'xl',
    input: coarse ? 'touch' : 'pointer',
  };
}

/** Navigation timings of this page load, in milliseconds from its start. */
function loadTimings(): Record<string, number> {
  const [navigation] = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
  const paint = performance
    .getEntriesByType('paint')
    .find((entry) => entry.name === 'first-contentful-paint');
  const result: Record<string, number> = { idle_ms: Math.round(performance.now()) };
  if (navigation) {
    result.ttfb_ms = Math.round(navigation.responseStart);
    result.dcl_ms = Math.round(navigation.domContentLoadedEventEnd);
    if (navigation.loadEventEnd > 0) result.load_ms = Math.round(navigation.loadEventEnd);
  }
  if (paint) result.fcp_ms = Math.round(paint.startTime);
  return result;
}

/**
 * Start the client with the events tracked so far, returning where later events go. Without a
 * usable configuration (an automated test that supplied no key) every event is dropped.
 */
export function start(
  backlog: Tracked[],
): (event: EventName, properties: Record<string, unknown>, time: number) => void {
  const config = analyticsConfig();
  if (!config) return () => undefined;
  let route = routePattern(location.pathname);
  let device = deviceContext();
  let errors = 0;
  let segment = { start: Date.now() - performance.now(), screens: new Set([route]) };
  const client = createClient({
    config,
    platform,
    pageId: randomId(),
    context: (store = useAppStore.getState()) => ({
      ...device,
      app_version: APP_VERSION,
      schema: CONFIG.saves.schemaVersion,
      // The engine of the match in hand, so a session saved under older rules reports those.
      engine: store.careerResult?.session.engine ?? store.matchSession?.engine,
      world_format: store.world ? (store.world.format ?? 'legacy') : undefined,
      route,
    }),
  });
  const capture = (event: EventName, properties: Record<string, unknown>, time = Date.now()) => {
    if (event === 'error' && ++errors > ANALYTICS.errorLimit) return;
    if (event === 'route_viewed') {
      route = routePattern(String(properties.route ?? ''));
      segment.screens.add(route);
      properties = { route };
    }
    client.capture(event, properties, time);
  };
  capture('session_started', { resumed: false }, segment.start);
  capture('app_loaded', loadTimings());
  for (const item of backlog) capture(item.event, item.properties, item.time);

  addEventListener('resize', () => (device = deviceContext()), { passive: true });
  let hidden = false;
  const hide = () => {
    if (hidden) return;
    hidden = true;
    capture('session_ended', {
      seconds: Math.round((Date.now() - segment.start) / 1000),
      screens: segment.screens.size,
    });
    client.flush(true);
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') hide();
    else if (hidden) {
      // Coming back to the tab starts a new stretch of play.
      hidden = false;
      segment = { start: Date.now(), screens: new Set([route]) };
      capture('session_started', { resumed: true });
    }
  });
  addEventListener('pagehide', hide);
  // The events derived from play load separately: the client alone stays small.
  void import('./observe').then(
    (observer) => observer.observeStore(capture),
    () => undefined,
  );
  return capture;
}
