# Milestone 10: web release

## Scope

AGENTS.md §3 and §12 milestone 10: deployment pipeline, PWA and offline polish, the update prompt, a performance and bundle audit, a cross-browser test pass, and the landing screen with share tags. The Android port belongs to milestone 11 and is not started; Capacitor is not installed.

## Design

**Free deployment** (see `docs/DEPLOY.md`).

- GitHub Actions (public repository, unlimited minutes) verifies and builds on Linux, runs the browser journeys on Windows in three parallel jobs, and deploys `main` to Cloudflare Pages (free plan) with a pinned Wrangler. The project is created on the first deploy; without the two secrets the deploy job skips with a notice.
- Windows runners for the browsers: Linux WebKit runners have no GPU and crash in the WebGL match renderer, and Linux Firefox logs an internal "Navigated away from page" error on ordinary navigations. The latter is filtered in `e2e/support.ts` only when it has no script location.
- The commit message reaches Wrangler through an environment variable, never interpolated into the script.

**Production headers** (`public/_headers`, Cloudflare Pages format).

- A strict Content Security Policy: same-origin scripts with no `eval`; `data:` images for the SVG artwork; `blob:` for generated audio, Chronicle exports and workers; no framing. PixiJS loads its no-`eval` build (`pixi.js/unsafe-eval`, named for environments that forbid eval) so the match renderer runs under it.
- `nosniff`, `X-Frame-Options: DENY`, referrer and permissions policies; immutable caching for fingerprinted assets; `no-cache` for the service worker, Workbox runtime and manifest.
- `vite preview` applies the same file, so every Playwright journey runs under production headers and fails on any policy violation.

**Landing page and share tags.**

- The title screen gains a "whole career in your hands" section (decision-based matches, growth, off-pitch life, legacy) and a plain promise: free, no account, no ads, saves on the device, offline after the first visit. On phones the stadium art now follows the text instead of sitting behind the links.
- Absolute Open Graph and X card tags, a canonical link and a fuller description, from `SITE_URL` (default `https://pitch-to-glory.pages.dev`). The share card is a 1200×630 PNG.
- PNG derivatives (`npm run raster`): the share card, 192 and 512 px icons, a maskable 512 px icon and the 180 px Apple touch icon, rendered from the SVG sources with Playwright's Chromium. Social cards and iOS home screens do not accept SVG; the SVGs remain the source.
- The manifest gains `id`, `lang`, categories, PNG icons beside the SVGs, and shortcuts to the career hub and Matchday. `robots.txt` allows indexing.

**Performance.**

- The save system (Dexie, validation, migrations and the engine code they use, about 90 KB gzip) left the startup bundle: it loads on first use through `persistence/lazy.ts`. Error codes and settings validation moved to light modules (`errors.ts`, `settings.ts`). A returning player's browser preloads it when idle; a first-time visitor (no save database, checked with `indexedDB.databases()`) does not download it until they create or load something.
- The startup bundle fell from 173 KB to 80 KB gzip.
- Framer Motion loads through `LazyMotion`: components use the small `m` element, and the animation features arrive as their own chunk. The page entrance became a CSS animation that starts visible, so the first paint never waits for script.
- Inter is one variable font (Latin, 48 KB) instead of four static weights (97 KB).
- Saves, the one screen that needs the whole save system, renders its heading at once and loads the slot list after the first paint (`afterFirstPaint`: paint timing, then an idle moment; immediate when navigating within the app). Its time to interactive fell from 4.0 s to 2.6 s in Lighthouse's mobile run.
- Starting a world job now counts the save-system load as part of startup, so a cancellation during the load waits for it (this closed a race the lazy loading would otherwise introduce).

**PWA and offline.** The update prompt and offline precache from earlier milestones are unchanged and still covered by the foundation journeys; the precache keeps to code, styles, SVGs and fonts (no PNGs).

## Implementation checklist

- [x] Cloudflare Pages deploy job, Windows browser matrix, deploy guide.
- [x] `_headers` with CSP and caching, applied in preview; Pixi without eval.
- [x] Landing section, phone hero layout, share tags, PNG derivatives, manifest polish, robots.
- [x] Lazy save system, lazy motion features, CSS page entrance, variable Inter.
- [x] Release journey (share tags, PNG card, manifest, headers, no save system on a first visit) and unit-test updates.
- [x] Docs.

## Known limits

- The site address is fixed at build time; a custom domain needs `SITE_URL` set in the workflow.
- Cloudflare assigns a different `pages.dev` address if `pitch-to-glory` is taken; update `SITE_URL` and the deploy job's environment URL then.
- Real-device checks (a mid-range phone, Safari on macOS and iOS) remain manual; Playwright's WebKit is not Safari.
