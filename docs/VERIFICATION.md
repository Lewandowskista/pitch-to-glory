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

## Real-world identities (before milestone 5)

Verified on 6 October 2026:

| Check             | Result                                                   |
| ----------------- | -------------------------------------------------------- |
| Strict TypeScript | Passed                                                   |
| ESLint, Prettier  | Passed                                                   |
| Vitest            | 157 tests across 24 files passed                         |
| Production build  | Passed; every route 190.7–227.1 KB gzip (budget 300 KB)  |
| Playwright        | 66 tests passed, 22 each in Chromium, Firefox and WebKit |
| Identity checker  | All six countries pass `scripts/check-identity.ts`       |

- **Initial counts unchanged:** 52 league groups, 959 clubs and 21,098 players.
- **Bundle:** identity data ships only in the world worker (87 KB gzip including the engine), not in any route chunk.
- **Unit tests** cover:
  - consistency between identities and profiles;
  - referenced clubs in order, with their colours, kit pattern, stadium and coordinates;
  - real towns in lower tiers;
  - cup and division names, and the reference recorded in the profile;
  - feeder clubs in unused real towns, while older worlds stay fictional;
  - older fictional profile names still validating;
  - real reserve counts and the reserve demotion target.
- **Browser journeys** check real country names, "Real-world model" rule lines, group names (Nord, Nordost, Girone I), the Terza Serie Cup and derived postseason labels.

## Milestone 5 verification

Verified on 6 October 2026:

| Check             | Result                                                                                                |
| ----------------- | ----------------------------------------------------------------------------------------------------- |
| Strict TypeScript | Passed                                                                                                |
| ESLint, Prettier  | Passed                                                                                                |
| Vitest            | 176 tests across 25 files passed (19 new market tests)                                                |
| Production build  | Passed; all fourteen routes 198.6–239.8 KB gzip (budget 300 KB)                                       |
| Playwright        | 69 tests passed, 23 each in Chromium, Firefox and WebKit                                              |
| axe-core          | No serious or critical WCAG A/AA violations on Transfers, talks, Agent, Inbox and hub, light and dark |

**Unit coverage:**

- windows, value, wages;
- seeded and registered selection;
- an unpicked player left out of the background XI and counted;
- asking price, rejected bids and release clauses;
- counter-offers met halfway, then the walk-away;
- a completed transfer: fee, sell-on, registration, structural sharing, valid world;
- the agent's estimate and stretched limits;
- transfer requests and withdrawal;
- loans, from start to the rollover return;
- refused and opened renewal asks, and renewal with the loyalty bonus;
- the club option and an agreed pre-contract at rollover;
- pay day and commission;
- agent standing and cooldown;
- deterministic interest, with offers only in windows;
- save round trip, forgery rejection and the schema 8 migration.

**The market browser journey:** a save built with the engine and imported through the Saves screen.

- The inbox's unread badge, and opening a message.
- The link to the talks; a counter-offer met halfway, with its reason.
- Browser back and forward.
- Accepting, and the moved contract and career moves.
- The transfer-request dialog closed with Escape.
- Hiring an agent; autosave, and a refresh restoring both.
- axe checks in both themes; 390 px overflow checks of every market page and the hub.

The career journey was updated: a level-up can now land in a week with a second fixture.

**Measured (Node):**

| Measurement                                             | Result                                                            |
| ------------------------------------------------------- | ----------------------------------------------------------------- |
| Market actions on a national world (structural sharing) | read 0.1 ms; counter and completed transfer about 15 ms           |
| Career week with an auto-played match                   | about 284 ms, against 239 ms for a plain week on the same machine |

**Defects found and fixed during the milestone:**

- offers made in a window's last week expired before the player saw them;
- the opening wage could fall below the wage floor;
- the trial contract was priced from pre-career attributes, so every new career started underpaid;
- the release-clause input's `step` made the browser block the counter-offer form silently;
- the unread badge's hidden text escaped the nav scroller and widened the page at phone width;
- a long inbox subject overflowed the hub card;
- the career-moves table's scroll region was not keyboard focusable (axe).

**Not done:** Lighthouse still audits empty-state career routes only. Physical-device and Safari release checks remain outstanding, as before.

## Milestone 6 verification

Verified on 6 October 2026:

| Check                                             | Result                                                                                                     |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Strict TypeScript, ESLint, Prettier               | Passed                                                                                                     |
| Vitest                                            | 190 tests across 26 files passed (14 new social tests)                                                     |
| 10,000-match calibration (with the morale factor) | 2.744 goals per match; home 1.509, away 1.226; away upsets 26.2% at a 15-point and 17.7% at a 45-point gap |
| Production build                                  | Passed; all seventeen routes 203.3–248.1 KB gzip (budget 300 KB)                                           |
| Playwright                                        | 72 tests passed, 24 each in Chromium, Firefox and WebKit                                                   |
| axe-core                                          | No serious or critical violations on Club life, Media, Rival and hub, light and dark                       |

**Unit coverage:**

- **Rival:** its choice, lifecycle protection, a consistent transfer, meetings and the season comparison.
- **Dressing room:** cliques with valid leaders through squad changes; teammate chemistry over weeks.
- **Morale and culture fit:** fit parts; morale parts, bounds and weekly history; the morale match factor.
- **Media:** match coverage; answering once with the stated effects; lapses; determinism.
- **Saves:** round trip, forgery rejection and the schema 9 migration.

The analytic match test now pins neutral morale, as its reference conditions intend. A legacy lifecycle test gained the 120 s timeout its neighbours use; it timed out under parallel load, unrelated to the career code.

**The social browser journey:** an engine-built save, imported through Saves.

- The hub press room, and answering the rival question with the 2 key.
- The effect chips and the rival's reply; feed filters through the URL.
- Club life: chart, breakdown, groups, fit and table. The rival comparison.
- Autosave and refresh.
- axe in both themes, and 390 px overflow checks.

**Not done:** Lighthouse still audits empty-state career routes only. Physical-device and Safari release checks remain outstanding.

## Milestone 7 verification

Verified on 6 October 2026:

| Check                               | Result                                                                           |
| ----------------------------------- | -------------------------------------------------------------------------------- |
| Strict TypeScript, ESLint, Prettier | Passed                                                                           |
| Vitest                              | 205 tests across 27 files passed (15 new lifestyle tests)                        |
| Production build                    | Passed; all nineteen routes 206.5–254.0 KB gzip (budget 300 KB)                  |
| Playwright                          | 75 tests passed, 25 each in Chromium, Firefox and WebKit                         |
| axe-core                            | No serious or critical violations on Lifestyle, Wardrobe and hub, light and dark |

**Unit coverage:**

- **Fame:** levels and progress; signature-celebration fame only in big matches.
- **Wardrobe:** the starting look kept; fame and token gating; sponsor boots and breaking a deal by taking them off.
- **Sponsors:** position-based obligations, weekly fees, judging at season end, deal limits.
- **Lifestyle:** purchases within fame and savings; upkeep sales; deterministic investments and resale; the lifestyle morale part.
- **Challenges:** ISO weeks; seeded sets and per-period replacement; progress from issue; claims once only; clean sheets for keepers.
- **Saves:** round trip, forgery rejection, the schema 10 migration, and a full season rollover.

**The lifestyle browser journey:** an engine-built save at fame level 4, imported through Saves.

- Signing the sponsor and buying, then selling, a car.
- Today's challenges arriving.
- A free hairstyle, long sleeves and the knee slide as signature, with a preview.
- Autosave and refresh.
- axe in both themes; 390 px overflow checks.

Desktop captures go to `artifacts/career-lifestyle.png` and `artifacts/career-wardrobe.png`.

**Not done:**

- Lighthouse still audits empty-state career routes only.
- The pitch celebration has no automated visual check. Its motions are deterministic, it is skipped under reduced motion, and the commentary line is covered by type checks.
- Physical-device and Safari release checks remain outstanding.

## Milestone 8 verification

Verified on 7 October 2026:

| Check                               | Result                                                                                                                                                          |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Strict TypeScript, ESLint, Prettier | Passed                                                                                                                                                          |
| Vitest                              | 224 tests across 28 files passed (19 new honours tests)                                                                                                         |
| Production build                    | Passed; all twenty-five routes 212.0–263.2 KB gzip (budget 300 KB); the public `/moment` replay 214.1 KB                                                        |
| Playwright                          | 78 tests passed, 26 each in Chromium, Firefox and WebKit                                                                                                        |
| axe-core                            | No serious or critical violations on Trophies, the ceremony, Chronicle, Moments, National team, hub, Legacy, the empty-career hub and `/moment`, light and dark |
| National career season (Node)       | 60 weeks in 16.5 s, median 274 ms per week with an auto-played match (284 ms after milestone 5); rollover 392 ms                                                |

**Unit coverage:**

- **Continental cups:** the draw (eight groups of four, countries apart, 64 different clubs), 96 group fixtures, progression through the round of 16 to the final, qualification from the final tables at rollover, and rejection of a forged group.
- **Moments:** clip round trip within quantisation, link round trip, rejection of truncated links, bad colours, impossible minutes and bad scorer indexes.
- **Chronicle:** written from the start; unique ids; trimmed to the limit with routine entries first, and the start kept even when only landmarks remain.
- **International football:** squads of 23 in every window, eligible by nationality and age; 16-nation tournaments in even years only, continental and world alternating, deterministic.
- **Awards:** monthly awards, the Golden Ball shortlist (ten, ranked, winner first), Golden Boot, MVP, Team of the Season (eleven) and Young Player (age limit), world records.
- **Retirement and legacy:** states by age and season phase; refusal before 32 or mid-season; the legacy's numbers, Hall of Fame score and rank; the kept retired player; validation, save round trip and a season rollover without a career.
- **Child career:** inheritance, the parent link, the Chronicle start, one child per legacy and the nationality rule.
- **Former teammates as managers:** retired and old enough only, and not when already employed.
- **Saves:** forgery rejection and the schema 11 migration. Determinism over ten weeks.

**The honours browser journey:** an engine-built save after a full season with the player at 34, imported through Saves.

- The hub offers retirement.
- The Golden Ball ceremony opens through the URL: nine places are shown, the winner is revealed, and back closes it.
- The Chronicle reads as a biography and exports a PNG (downloaded, because the system share sheet is disabled in tests).
- A moment replays, and its link is copied. The link replays in a fresh tab without the save; a damaged link shows an error.
- Retirement through the confirmation dialog lands on the legacy, which survives autosave and a refresh.
- "Play as Robin Vale's child" opens the wizard with the surname and the parent's nationality as the only choice.
- axe in both themes; 390 px overflow checks on Legacy, the empty-career hub and `/moment`.

Desktop captures go to `artifacts/career-trophies.png`, `career-chronicle.png`, `career-moments.png`, `career-national.png` and `career-legacy.png`.

**Found and fixed during verification:**

- Dark-mode pages painted the light theme first and animated into dark, because the theme was applied in an effect after paint. This was caught by axe sampling mid-transition. The dark tokens now apply under `prefers-color-scheme: dark` before the setting is known, and the theme is set in a layout effect. In a 25-load loop, failures went from 9 to 0.
- The Chronicle could exceed its limit when no routine entries were left to drop.
- A pre-existing world test ran close to the default 5 s timeout under the heavier parallel load (3.3 s alone) and now has the 120 s timeout its neighbours use.
- One run showed a WebKit timing flake in the career wizard spec (a click right after browser forward). It passed 3 of 3 in isolation and in the final full run.

**Not done:**

- Lighthouse still audits empty-state career routes only.
- The exported poster is checked for its download, not pixel by pixel.
- Physical-device and Safari release checks remain outstanding.

## Milestone 9 verification

Verified on 7 October 2026:

| Check                                                                    | Result                                                                                                                                                                                                           |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Strict TypeScript, ESLint (engine now forbids browser globals), Prettier | Passed                                                                                                                                                                                                           |
| Vitest                                                                   | 245 tests across 30 files passed (21 new: kit clash, edits, settings and schema 13, procedural audio)                                                                                                            |
| Production build                                                         | Passed; all twenty-six routes 215.3–270.1 KB gzip (budget 300 KB); Howler and the synthesiser in their own lazy chunks                                                                                           |
| Playwright                                                               | 92 passed and 1 skipped: 31 tests each in Chromium and Firefox, 30 in WebKit (its keyboard-order check is skipped)                                                                                               |
| Accessibility sweep                                                      | All 26 routes pass axe (WCAG 2.1 AA, serious and critical) in light and dark on a career eight weeks in; none overflows at 390 px; keyboard focus is always visible on the hub, Edit mode, Settings and Trophies |

**Unit coverage:**

- **Kit clash:** red and green clash for protanopia but not typical vision; blue and teal for tritanopia; away-kit choice (away, then third, then a flagged clash); fewer than 5% of generated clubs lack a distinct second kit.
- **Edits:** renames with originals, structural sharing, reverting, renaming back; rejection of empty, long and malformed values; recolouring through crest and kits; reproducible new crests; record and legacy names; export and import into the same world and, by original name, into another; malformed packs; validation and forgery rejection; edits surviving simulated weeks in a national world and a new career.
- **Settings and saves:** defaults for older preferences, volume and flag validation, round trip of an edited world, the schema 12 migration.
- **Audio:** every sound renders deterministically, finite, audible and below clipping; interface sounds short and quiet; one-shots start and end silent; the crowd loop joins seamlessly at a steady level; the roar builds and fades; WAV encoding.

**Browser journeys:**

- **Edit mode:** search, rename, recolour (including an invalid hex code), a new crest, league rename by keyboard tabs, "Edited only", export, revert, re-import, rejection of a bad file, autosave and refresh, the World screen showing the edited league; axe in both themes and phone width.
- **Onboarding:** the week tour (focus on the heading, highlights, Back, Escape skipping without navigating), replay from Settings, the full week tour, then the match tour through kick-off, a key moment chosen with the 1 key, and the outcome; completion stored per device.
- **Sound settings:** volume by keyboard, a preview loading Howler after the first gesture, mute disabling the controls, and the settings persisting through a reload.
- **Accessibility:** the sweep above, in Chromium; Firefox and WebKit render every route without errors. Keyboard order is checked in Chromium and Firefox; WebKit is skipped because Safari's Tab order depends on a user setting.

**Found and fixed during verification:**

- Menu styles leaked pale "eyebrow" labels onto the World screen (all CSS ships in one bundle).
- Gallery index numbers, unavailable skills and skill costs were below contrast minimums.
- Invalid definition lists on Skills and Training.
- The profile's match history widened the page on phones: screen-reader-only labels escaped a scroll container that was not positioned. Five scroll containers are now positioned.
- Disabled-looking import labels on Saves and Edit mode now say they are disabled.
- Colour inputs had text-field styling that hid the hex fields.
- Match shortcuts and playback paused for any `role="dialog"`, which would have frozen the match under the tutorial; they now pause only for modal dialogs.
- Edit-mode filters lagged because the URL updates in a transition; they now keep local state mirrored to the URL.
- A large-backup import in the world journey waited only 5 s for its notice under the heavier parallel load; it now waits up to 60 s.

**Not done:**

- How the synthesised sounds sound is a human judgement; tests cover rendering, levels and loading.
- Lighthouse was not re-run this milestone; it belongs to the milestone 10 performance audit.
- Physical-device and Safari release checks remain outstanding.

## Milestone 10 verification

Verified on 7 October 2026, on Windows with Node 24, against the production build served with the production headers (`public/_headers`, applied by `vite preview`):

| Check                               | Result                                                                                                                                                                 |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Strict TypeScript, ESLint, Prettier | Passed                                                                                                                                                                 |
| Vitest                              | 245 tests across 30 files passed                                                                                                                                       |
| Production build                    | Passed; startup bundle 80 KB gzip (173 KB before); all twenty-six routes 91.7–186.7 KB gzip including the shell (budget 300 KB)                                        |
| Playwright                          | 104 passed and 1 skipped across Chromium, Firefox and WebKit, under the strict Content Security Policy (the WebKit keyboard-order check is skipped, as in milestone 9) |
| Lighthouse, mobile                  | Performance 86–95 on all eleven audited pages (was 82–89); accessibility 100                                                                                           |
| Lighthouse, desktop (title page)    | Performance 100; accessibility 100                                                                                                                                     |

**Lighthouse, mobile preset** (simulated slow 4G at 1.6 Mbps, 4× CPU slowdown):

| Page                      | Performance | First paint | Largest paint and interactive |
| ------------------------- | ----------- | ----------- | ----------------------------- |
| Title (`/`)               | 95          | 1.9 s       | 2.8 s (was 3.6 s)             |
| Gallery, Settings, Moment | 94–95       | 1.8–1.9 s   | 2.8 s                         |
| Saves                     | 95          | 1.8 s       | 2.6 s (was 3.5 s)             |
| World, Edit mode          | 92–93       | 1.8–2.0 s   | 3.1 s                         |
| Career wizard             | 91          | 2.1 s       | 3.2 s                         |
| Career (no career yet)    | 88          | 2.3 s       | 3.6 s                         |
| Matchday (no world)       | 86          | 2.3 s       | 3.7 s                         |

The title page now transfers 216 KB on a first visit (326 KB before). Pages that need engine code (career, Matchday) stay above 3 s to interactive under this harsh preset; typical 4G is several times faster.

**Release journey** (`e2e/release.spec.ts`): absolute Open Graph and X card tags and canonical link; `share.png` is a real 1200×630 PNG; the Apple touch icon is PNG; `robots.txt` is served; the manifest has SVG and PNG icons (including maskable) and shortcuts, all served; pages carry the CSP, `nosniff` and `X-Frame-Options`, and `sw.js` is `no-cache`; a first visit to the title page downloads none of the save system, which loads when Saves opens.

**Found and fixed during verification:**

- A preview server left running from an earlier session was serving the old configuration, so the first CSP check passed without the headers. With a fresh server the policy blocked PixiJS (it generates code with `new Function`) and the tests' inline axe injection. Pixi now loads its no-eval build, and the tests evaluate axe instead of injecting a script tag.
- Making the save system lazy opened a race: a world job cancelled while the save system was still loading could resume after a new job started. The load is now part of the job's startup promise, which cancellation waits for.
- The first GitHub Actions run (Linux) failed in Firefox and WebKit: Firefox logs an internal navigation error with no script location, and WebKit crashed in WebGL without a GPU. Browser journeys now run on Windows runners, and the Firefox message is filtered only when it has no location.
- On phones, the title page's links sat over the stadium artwork; the artwork now follows the text.
- A world checkpoint test ran past its 15 s timeout under parallel load (it passes alone); it now has the 120 s timeout its neighbours use.

**Not done:** the first deploy waits for the two Cloudflare secrets. Real-device checks (a mid-range phone; Safari on macOS and iOS for IndexedDB, workers, audio and installation) remain manual.

## Phase 1 verification (career and result integrity)

Phase 1 of the [high-value improvements plan](superpowers/plans/2026-10-07-high-value-improvements.md), 7 October 2026.

- **1.1 Careers and the legacy wizard.** `tests/store-session.test.ts`; a slot-switch journey in `e2e/career.spec.ts` (fails without the store rule); the child wizard journey in `e2e/honours.spec.ts` (refresh at appearance, trial and confirmation, back/forward, a second tab holding the save, signing once).
- **1.2 Finalized fixtures.** `tests/match-accounting.test.ts`: a season's cumulative goals, assists, appearances and minutes equal the career records (failed before: 9 assists against 7); explicit and background assists; extra time with a substitute; every reward through extra time; a repeated commit, also after a save round trip, is rejected. Full background seasons (legacy and national) were byte-identical to the previous build.
- **1.3 Competition statistics.** `tests/competition-stats.test.ts`: cup goals and goals for other leagues never decide the league Golden Boot, and a departed leader keeps it (both failed before); lines agree with every result and every player's totals over a national season; a loan keeps separate club lines; tampered lines are rejected and export/import keeps them; a schema-13 save keeps its award mode until rollover, then starts complete statistics with its issued awards kept; a transfer followed by rollover clears the lines.
- **1.4 Trophies and legacies.** `tests/honours.test.ts`: a cup trophy earned before moving on is recorded once (repeated weeks and the season-end award run add nothing); a zero-appearance signing and a move to the winners after the final earn nothing; a played season records exactly the titles whose campaign the player appeared in; a retained former career is ranked by its saved score (10,000 against 1,000; failed before) and two retired generations are ranked by the same criteria, each person once. `tests/pyramid.test.ts`: Portugal's Liga 3 and Campeonato champions come from the promotion league and the final, at least one differing from every first-phase group winner; forged division champions are rejected; a trophy for an archived phase stays valid after rollover.
- **1.5 Site address.** `site.ts` normalizes `SITE_URL` for both the build and `e2e/release.spec.ts`, which compares every absolute share tag and the canonical link with the configured address (a default build checked against a custom `SITE_URL` fails). `npm run test:release:custom` builds `dist-custom` with a custom address and passes the release journey on port 4174; CI runs it as the `custom-domain` job before deploy, and all jobs share the repository variable `SITE_URL`. Security headers and the real PNG card checks are unchanged.
