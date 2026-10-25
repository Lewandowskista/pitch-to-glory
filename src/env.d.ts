/** `package.json`'s version, replaced at build time (vite.config.ts and vitest.config.ts). */
declare const __APP_VERSION__: string;
/** Analytics, read at build time (src/analytics/config.ts, docs/ANALYTICS.md). */
interface ImportMetaEnv {
  readonly VITE_POSTHOG_KEY?: string;
  readonly VITE_POSTHOG_HOST?: string;
  readonly VITE_ANALYTICS_ENV?: string;
}
