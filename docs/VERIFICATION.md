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

## Hardening pass verification

Verified on 6 October 2026 on Windows with Node 24 after the post-milestone-3 hardening pass (see the hardening sections of DECISIONS.md). No milestone-4 features were added.

| Check                                               | Result                                                                                                                                           |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Strict TypeScript, ESLint (zero warnings), Prettier | Passed                                                                                                                                           |
| Vitest                                              | 124 tests across 20 files passed (previously 92 across 17)                                                                                       |
| Production build and bundle gate                    | Passed; initial route JavaScript 183.9–195.3 KB gzip (Matchday 195.3 KB), all below 300 KB                                                       |
| Playwright full suite                               | 63 passed, 21 each in Chromium, Firefox and WebKit; no skips                                                                                     |
| 10,000-match calibration                            | 2.686 goals per match; equal-team home/away goals 1.441/1.230; draws 26.5%; away wins 27.3% at a 15-point and 18.5% at a 45-point reputation gap |

New unit coverage:

- **Saves:**
  - per-slot listing with damaged and newer-version slots;
  - deleting and replacing a damaged slot;
  - splitting a real v5 database without validating it;
  - discarding forged, stale or outdated-engine match sessions while keeping the world;
  - strict rejection when writing an invalid session;
  - world-free match checkpoints with ownership, revision and world-id checks;
  - a v4 database upgraded through the v6 split.
- **Lifecycle:**
  - retirement curve;
  - contract renewal and release;
  - free-agent signing;
  - free-agent retirement;
  - archiving and pruning at rollover;
  - dormant-club reuse without double hand-out;
  - in-place simulation identical to a copied world resumed from JSON mid-season;
  - a bounded, valid national world across two seasons.
- **Identity:** crest pair spread, symbol contrast at least 3:1, and rare duplicate names within a squad.
- **Match engine:**
  - shared strength model reproduces the background resolver's results;
  - per-situation expected-value fairness and attribute sensitivity;
  - independent rolls per choice;
  - outdated-engine rejection;
  - each edge-case regression from the audit.

Long-run world measurement (Node, seed `long-run`, ten national seasons) is recorded in BALANCING.md. A completed world holds at 59–67 MiB of compact JSON and grows about 1.3 MiB per season. A simulated week takes 72–97 ms, down from about 500 ms. Before the pass, a season-3 backup (134.4 MB pretty-printed) exceeded the 128 MiB import limit.

Browser-test fixes made during this pass:

- The Saves screen opened a replace-confirmation dialog when a backup was imported into an empty slot while the slot list was still loading. This was a regression from the per-slot listing, now fixed.
- The conflicting-autosave journey edits IndexedDB directly; it now uses the v6 metadata layout.
- That journey also had a pre-existing WebKit race under parallel load, where a seed fill was occasionally lost before "Apply seed". It reproduced 1 in 20 on the original code. The step now retries until the applied seed sticks, and it passed 30 of 30 repeated WebKit runs.

Not re-measured in this pass: Lighthouse scores, and physical-device frame rate, Safari, offline and installation checks. The earlier entry-screen Lighthouse results above predate the larger bundles (+5–10 KB gzip per route) and should be re-run before release.

## Milestone 4 verification

Verified on 6 October 2026 on Windows with Node 24 and the production build.

| Check                                               | Result                                                                                                                                  |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Strict TypeScript, ESLint (zero warnings), Prettier | Passed                                                                                                                                  |
| Vitest                                              | 153 tests across 23 files passed                                                                                                        |
| Production build and bundle gate                    | Passed. Initial route JavaScript 190.5–221.7 KB gzip: Matchday 221.7 KB, career routes 204.3–210.4 KB, all below 300 KB                 |
| Playwright full suite                               | 66 passed, 22 each in Chromium, Firefox and WebKit, including the career journey                                                        |
| 10,000-match calibration (after generation changed) | 2.758 goals per match; equal-team home/away goals 1.521/1.225; draws 25.1%; away upsets 26.1% at a 15-point and 17.7% at a 45-point gap |

**Lighthouse** (idle local production preview, simulated mobile throttling):

| Screen           | Device  | Performance | Accessibility | Interactive |
| ---------------- | ------- | ----------- | ------------- | ----------- |
| Main menu        | Mobile  | 89          | 100           | 3.4 s       |
| Main menu        | Desktop | 100         | 100           | 0.8 s       |
| Asset gallery    | Mobile  | 93          | 100           | 2.9 s       |
| Settings         | Mobile  | 90          | 100           | 3.2 s       |
| Matchday entry   | Mobile  | 89          | 100           | 3.4 s       |
| Save slots       | Mobile  | 89          | 100           | 3.2 s       |
| World entry      | Mobile  | 89          | 100           | 3.4 s       |
| Career hub entry | Mobile  | 88          | 100           | 3.4 s       |
| Career wizard    | Mobile  | 90          | 100           | 3.4 s       |

All scores meet the specified thresholds. The first Milestone 4 audit measured Matchday accessibility at 96 and two issues were fixed:

- the live-update region carried an `aria-label` on a plain element;
- the narrow bottom navigation used full names as accessible names while showing short labels.

Cold mobile entries take 2.9–3.4 seconds to become interactive, still above the strict under-three-second target, and slightly slower than before because the shared shell grew. This remains release performance work.

**New unit coverage:**

- **Ageing:** curves; stable per-player profiles; development toward targets; one-time recalibration; tier ability stable over four legacy seasons.
- **Career creation:** trial offers; creation validity and rejection rules; keeper careers.
- **Progression:** XP and levels; soft-cap costs including the physical surcharge; allocation with structural sharing; skill gating and bonuses; every skill has a real effect.
- **Training, injuries and ageing:** training progress, familiarity and fatigue; injuries, recovery choice and healing; mentor replacement; ageing decline.
- **Commit path:** the pending-fixture guard; one commit with conserved standings, goals and appearances; a mid-week save in legacy and national worlds; rejected forged sessions; extra time and penalties after an interactive draw; a full auto-played season.
- **Lifecycle and saves:** exclusion from the AI lifecycle; relocation when the career club leaves the simulated leagues; career save round trip and rejected forgeries.
- **Match engine:** unlocked choices are fair; skill boosts and big-game bonus apply; assists are tagged on goal events.

**The career browser journey (three engines):**

- wizard steps with browser back/forward, a new world built in the worker, a trial club, and saving into slot 1;
- the hub, continuing to a matchday, and playing to full time with skip and number keys;
- XP on the report and playing on until a level-up;
- raising an attribute, keyboard navigation of the skill tree and unlocking a skill;
- changing the training plan;
- autosaving after each recorded match (mid-week), and the save card and refresh restoring the hub and training plan;
- dark-theme, 390 px captures of every career page with a horizontal-overflow check (Chromium).

No console errors or page errors were observed.

The UI worker found a real defect during this milestone, now fixed: the validators rejected the save made right after a career match, because that week's other fixtures were still unplayed.

**Not done:** physical device frame-rate checks and Safari release-device checks remain outstanding, as before.
