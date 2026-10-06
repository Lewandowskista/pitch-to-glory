# Milestones 1–3 verification

Verified on 6 October 2026 on Windows with Node 24 and the production Vite build. The sections below retain the milestone 2 baseline; the milestone 3 section records the current match implementation. Career creation and progression remain milestone 4.

## Required checks

| Check                      | Result                                                                                     |
| -------------------------- | ------------------------------------------------------------------------------------------ |
| Strict TypeScript          | Passed                                                                                     |
| ESLint, zero warnings      | Passed                                                                                     |
| Prettier                   | Passed                                                                                     |
| Vitest                     | 76 tests across 14 files passed                                                            |
| Production build           | Passed; both workers and service worker generated                                          |
| Playwright                 | 51 tests passed, 17 each in Chromium, Firefox and WebKit; no skips                         |
| Final regional-label check | Three further browser passes after distinguishing German direct places from playoff routes |
| Final offline cache check  | Six further browser passes after excluding unused WOFF fallbacks                           |

Unit coverage includes reference RNG streams, snapshot/fork determinism, all asset catalogues and ageing, real Dexie migrations, save round trips/import rejection, revision conflicts, leases, autosave ordering, app-update safety and worker cancellation. National tests cover the six country structures, complete home/away schedules and odd-group byes, reserve eligibility/demotion, extra time/penalties/rank advantage, Italian deciding ties, Portuguese bonus points and separate phases, country-specific ranking, German conditional capacity and rotating promotion routes. Two full national seasons conserve memberships and prepare the third season. Save validation checks every weekly checkpoint and rejects forged rules, membership, fixture overlap, truncated calendars, progress markers, capacities, bonuses and archived tie references.

The persistence service tests preserve full untrusted-import validation, normalized write receipts, atomic ownership/revision checks and failed-import recovery. Transport tests reassemble interleaved graphs without publishing partial snapshots, retain inert prototype-named keys and cancel incomplete transfers safely.

Browser journeys cover real worker generation and weekly/full-season simulation, regional group URLs/back/forward, rapid filter input, Italy's auxiliary cup, archived Portuguese tables, whole-world backup/import/refresh/rollover, tab ownership/conflicts, settings, SVG galleries, keyboard/dialog behavior, mobile overflow and offline resources. No application console errors, page errors or unhandled rejections were observed.

## Loaded-world responsiveness and storage

The expanded graph initially caused a maximum 816.7 ms frame gap and 179 long tasks during Chromium season autosaving. Moving validation/IndexedDB/JSON work into a persistent worker and transferring graphs in bounded batches reduced the isolated full-season run to **49.9 ms maximum frame gap and zero long tasks**. The three-browser concurrent run measured 50.1 ms and zero long tasks. These are measured season/checkpoint paths on this machine, not a universal latency guarantee for every device or action.

The completed-season formatted backup measured **102,778,856 bytes** (about 98 MiB), below the 128 MiB import limit. Browser tests use the actual downloaded file, avoiding Playwright's 50 MB inline-buffer limit. Existing schema-v3 compact worlds migrate to v4 without changing identities, results, rules or history. Longer multi-generation worlds will require deliberate archive/storage sizing before milestone 8.

Initial route JavaScript is **169.4–177.0 KB gzip**, below the 300 KB budget enforced by the build. The separately loaded simulation worker is 83.43 KB and persistence worker 151.84 KB before compression. The PWA precaches 26 entries (935.51 KiB), including both workers and the WOFF2 fonts used by supported browsers. Unused WOFF fallbacks remain in the static build but are excluded from first-visit caching.

## Production performance

Lighthouse runs against an idle local production preview using simulated mobile throttling. Fresh audit measurements overwrite `artifacts/lighthouse-summary.json`; scores and timings are machine-specific. Entry-screen audits and loaded-world worker responsiveness are separate measurements.

| Screen        | Device  | Performance | Accessibility | Interactive |
| ------------- | ------- | ----------- | ------------- | ----------- |
| Main menu     | Mobile  | 91          | 100           | 3.1 s       |
| Main menu     | Desktop | 100         | 100           | 0.8 s       |
| Asset gallery | Mobile  | 94          | 100           | 3.0 s       |
| Settings      | Mobile  | 91          | 100           | 3.1 s       |
| Save slots    | Mobile  | 90          | 100           | 3.2 s       |
| World entry   | Mobile  | 91          | 100           | 3.1 s       |

Performance and accessibility scores meet the specified thresholds. Cold mobile entry timings of 3.0–3.2 seconds still exceed the strict under-three-second interactive target; this remains a release performance task. The world-entry audit does not represent a loaded season: its worker responsiveness is measured separately above.

## Browser and release limits

Chromium and Firefox generate and advance worlds with the network disabled after one connected visit. Playwright WebKit on Windows fails offline module navigation inside its driver before service-worker dispatch; its tests verify actual nonempty cached shell/route/worker responses while offline. Physical macOS/iOS Safari offline navigation and installation remain device checks.

Desktop and 390px mobile screenshots were visually inspected in light/dark themes, including large font scale, full regional tables/rules, SVG kits/crests/avatars and squads. Artifacts are `artifacts/world-national-desktop.png` and `artifacts/world-national-mobile.png`.

No site was deployed and the GitHub workflow has not run remotely. Deployment needs host credentials only when publishing is requested. No Capacitor dependencies were installed.

## Milestone 3: current match verification

The pure interactive engine, lazy PixiJS pitch, pre-match tactics, live commentary/decisions and post-match report are implemented. Matchday uses friendly matches from the saved world. XP/fame are calculated in the report; career progression and integration with scheduled league fixtures remain milestone 4.

The full Playwright suite passed **63 tests**, 21 each in Chromium, Firefox and WebKit, with no skips. The season journeys include actual 102,778,856-byte backup downloads, imports, refresh and rollover. No application console errors or page errors were observed. The concurrent Chromium season measurement was **33.4 ms maximum frame gap and zero long tasks** on this machine.

Three further saved-match browser runs passed after adding an explicit check that animated report totals reach full opacity. Settled desktop report screenshots were visually inspected.

The final idle production Lighthouse audit passed its performance/accessibility gates on all seven configurations:

| Screen        | Device  | Performance | Accessibility | Interactive |
| ------------- | ------- | ----------- | ------------- | ----------- |
| Main menu     | Mobile  | 90          | 100           | 3.2 s       |
| Main menu     | Desktop | 100         | 100           | 0.7 s       |
| Asset gallery | Mobile  | 93          | 100           | 2.9 s       |
| Settings      | Mobile  | 91          | 100           | 3.1 s       |
| Match entry   | Mobile  | 93          | 100           | 2.9 s       |
| Save slots    | Mobile  | 89          | 100           | 3.2 s       |
| World entry   | Mobile  | 92          | 100           | 3.1 s       |

These are entry-screen measurements, not a loaded-match GPU/frame-rate certification. The menu, settings, saves and world cold mobile entries still exceed the strict under-three-second target. That performance gap remains explicit release work; score thresholds pass. Current raw reports and the summary are in `artifacts/lighthouse-*.json`.

The final unit run passed **92 tests across 17 files**. Coverage adds immutable command replay, keeper/outfield choices, positional lineups, probability-factor sums, goals/shots/report conservation, half-time recovery, substitution/captain gates, action geometry, strict session import validation, schema 4-to-5 migration and compact persistence-worker checkpoints. The 10,000-match calibration measured **2.7545 goals per match**, equal-team home/away scoring of 1.5138/1.2305, and away-underdog win rates of 21.35% at a 15-point reputation gap and 7.05% at a 45-point gap. See `MATCH-BALANCING.md` for cohort assumptions and formulas.

The production build passes the initial-route budget for all six screens: **177.0–185.0 KB gzipped**. The Matchday route is 184.4 KB. The bundle gate traverses imported chunks and verifies that PixiJS renderer chunks are deferred. The world and persistence workers are 83.43 KB and 174.87 KB before compression. The service worker precaches 39 entries (1,565.77 KiB), including deferred renderer code, workers and WOFF2 fonts.

Save schema 5 preserves earlier world rules/results and adds optional replay-validated match sessions. Refresh restores a match at its saved decision; full-time autosave retains the report. Match checkpoints transfer the compact session to the persistence worker, avoiding repeated transfer of the entire world. An unfinished match prevents world simulation or replacement.

Desktop live/report and 390px dark mobile screenshots are recorded as `artifacts/match-live-*.png`, `artifacts/match-report-*.png` and `artifacts/match-mobile-*.png`. Mobile journeys use 130% font scale and simulation-only keeper decisions. Browser coverage also exercises keyboard choices, saved-session refresh, half-time, captain and substitution responses, visibility pause, resize and Chromium WebGL context-loss fallback.

Physical mid-range phone/laptop 60fps certification and macOS/iOS Safari installation, IndexedDB and offline checks remain release-device work. Playwright WebKit on Windows is useful coverage but does not substitute for those devices. No milestone 4 features, Android dependencies or deployment were added.

## Reproduce current checks

```sh
npm ci
npm run typecheck
npm run lint
npm run format:check
npm test
npm run build
npx playwright install chromium firefox webkit
npm run test:e2e
npm run audit
```

Use `npm.cmd`/`npx.cmd` when PowerShell blocks script shims. Browser tests use port 4173; Lighthouse uses 4180. Run Lighthouse after other tests finish. Reports/screenshots are ignored artifacts, not shipped raster art.
