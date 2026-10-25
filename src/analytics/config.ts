/**
 * Analytics configuration (docs/ANALYTICS.md). The PostHog project key, host and environment
 * are read at build time; a build without a key (tests, forks, local work) has analytics off
 * entirely: no client is downloaded, no request is made and no prompt is shown.
 */
export type AnalyticsEnvironment = 'production' | 'preview' | 'ci' | 'development';

export interface AnalyticsConfig {
  key: string;
  /** The capture host, without a trailing slash. */
  host: string;
  environment: AnalyticsEnvironment;
  /** Milliseconds between scheduled flushes. */
  flushMs: number;
}

/** Tunable constants of the client. */
export const ANALYTICS = {
  defaultHost: 'https://eu.i.posthog.com',
  flushMs: 30_000,
  /** A flush starts as soon as this many events wait. */
  batchSize: 20,
  /** The most events held in memory; the oldest are dropped beyond it. */
  queueLimit: 100,
  /** The most events in one request, well inside the 64 KB keep-alive body limit. */
  maxBatch: 50,
  /** Characters kept of an error message, after scrubbing. */
  errorLength: 120,
  /** The most errors reported from one page load, so a failing loop cannot flood the queue. */
  errorLimit: 10,
} as const;

const ENVIRONMENTS: readonly AnalyticsEnvironment[] = [
  'production',
  'preview',
  'ci',
  'development',
];

/**
 * Set by a browser test (`window.__ptgAnalyticsTest`) to turn analytics on under automation,
 * with its own key and a short flush interval. Honoured only when `navigator.webdriver` is
 * true, so it can never change what a player's browser does.
 */
export interface AnalyticsTestOverride {
  key?: string;
  host?: string;
  environment?: AnalyticsEnvironment;
  flushMs?: number;
}

export interface AnalyticsSources {
  env: { VITE_POSTHOG_KEY?: string; VITE_POSTHOG_HOST?: string; VITE_ANALYTICS_ENV?: string };
  /** `navigator.webdriver`: automated browsers (Playwright) never send events by default. */
  webdriver: boolean;
  override?: AnalyticsTestOverride | null;
}

/** The configuration for these sources, or null when analytics is off. */
export function resolveConfig({
  env,
  webdriver,
  override,
}: AnalyticsSources): AnalyticsConfig | null {
  if (webdriver && !override) return null;
  const source = webdriver && override ? override : {};
  const key = (source.key ?? env.VITE_POSTHOG_KEY ?? '').trim();
  if (!key) return null;
  const host = (source.host ?? (env.VITE_POSTHOG_HOST?.trim() || ANALYTICS.defaultHost)).replace(
    /\/+$/,
    '',
  );
  const environment =
    source.environment ??
    (ENVIRONMENTS.find((name) => name === env.VITE_ANALYTICS_ENV) || 'development');
  return { key, host, environment, flushMs: source.flushMs ?? ANALYTICS.flushMs };
}

/** This build's analytics configuration in this browser, or null when it is off. */
export function analyticsConfig(): AnalyticsConfig | null {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return null;
  return resolveConfig({
    env: import.meta.env,
    webdriver: navigator.webdriver === true,
    override: (window as { __ptgAnalyticsTest?: AnalyticsTestOverride }).__ptgAnalyticsTest,
  });
}
