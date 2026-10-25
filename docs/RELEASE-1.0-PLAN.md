# Release 1.0 implementation plan — 25 October 2026

Status: **approved 25 October 2026**, with the decisions at the end. This plan turns the
[25 October review](APP-REVIEW-2026-10-25.md) into the work for release 1.0.0. Finding IDs (M, C,
W, S, P, U, K, G) refer to that review. Work in reviewable phases, keep the app runnable, stop
with a summary after each phase, and track results in a matching `RELEASE-1.0-PROGRESS.md`.

## What 1.0 means

1.0 is the launch. The bar is not more systems. It is a game a newcomer enjoys within two minutes
and a veteran still enjoys in season fifteen:

1. **The match feels great.** The pitch moves like football, goals are moments, choices decide
   results, ratings are believable.
2. **A career is worth finishing.** Every position can become a legend, the prime years have goals
   of their own, money and fame keep mattering, and the story does not repeat itself.
3. **Time is respected.** A newcomer reaches the first key moment in about 90 seconds; a veteran
   can simulate a dull Tuesday fixture; Continue takes about a second on a desktop.
4. **The world holds over generations.** A child career plays in a world as believable as the
   parent's.
5. **Saves are safe for years.** Nothing bricks a save; a damaged save can always be exported;
   long worlds keep saving.
6. **Launch ready.** Feedback channel, privacy page, legal notice, real-device checks and
   playtests are done.

## Release strategy

Every push to `main` deploys to players, and [RELEASING.md](RELEASING.md) reserves a major version
for breaking saves. A large 1.0 needs both settled first (decisions D1 and D2).

- **Hotfixes ship now.** Phase 1 goes straight to `main` as 0.9.1 (and 0.9.x as needed). Two of
  its defects are P0, and they should not wait for 1.0.
- **1.0 is built on a `release/1.0` branch** with Cloudflare Pages preview deployments. Rebase it
  on `main` after every hotfix. Playtesters use the preview URL; because the preview is a
  different origin, they move careers across with export and import, which exercises that path.
- **One engine and one schema bump for 1.0.** Because intermediate phases do not ship, all match
  rule changes land under a single new engine id, `match-22`, and all persisted-shape changes
  under a single schema bump (23). World and career rule changes adopt through one new flag each,
  at the next season start, following the existing `selectionVersion` pattern.
- **Merge to `main` once, as 1.0.0**, after the exit criteria at the end of this plan pass.

## Ground rules for every phase

- **Saves.** Every new stored field is optional, migrated in `src/persistence/schema.ts`, and
  validated. Add a round-trip test and a migration test from the golden fixtures (2.2).
- **When rules change.** World and career rules change at a season start, never partway through.
  The single exception is the one-time compatibility cut in 2.4, if decision D3 approves it.
- **Saved matches.** Match rule changes go behind the `match-22` setup flag, so an older session
  finishes under its own rules or is discarded with a notice (per D3), never replayed under new
  rules.
- **Balance.** Constants go in `src/engine/config.ts` and are documented in `BALANCING.md`. Every
  balance change runs the relevant gate from 2.3: match profile, career profile, or the world
  drift gate.
- **UI.** Tailwind on the shared tokens, i18n strings using the locale helpers from 2.6, keyboard
  operation and screen-reader labels. Check at 360, 390, 768, 1366 and 1440 px, light and dark,
  and at 130% text, **with a 40-character player name and a long club name** (2.5).
- **Old records.** Never invent past achievements. Where a rule change cannot be applied to old
  data, say so in the UI and in `DECISIONS.md`.
- **Budgets.** No route may exceed the bundle budget, and no change may regress the performance
  budget in Phase 3.

---

## Phase 1 — Hotfixes for 0.9.1 (ship to `main` now)

Small, separate fixes for defects players can hit today. Each gets a regression test.

| Step | Fix                                                                                                                                                                                                                                                                                                                                                                                                                                         | Finding  | Size |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ---- |
| 1.1  | **Settle the shootout when the player is off the pitch.** When a shootout is due but the player was substituted or sent off, call `settleShootout` before `finish`. As a guard, `recordTournamentMatch` refuses a level knockout without penalties, and `fixtureWinner` never returns null for a knockout. Tests: substituted, sent off, tired. Existing sessions replay unchanged up to full time; the fix only adds the missing shootout. | M1       | S    |
| 1.2  | **Clamp save timestamps.** On read, treat `updatedAt < createdAt` as `updatedAt = createdAt` instead of rejecting. On every write path (`write`, `writeWithoutWorld`), store `max(now, createdAt)`. Same for imports from a device whose clock was ahead. Test with a skewed clock.                                                                                                                                                         | S1       | S    |
| 1.3  | **Recovery export.** A raw export of the `saves`, `worlds` and `matches` records without validation, offered on error slots, before Delete, and in the "Export unsaved" banner.                                                                                                                                                                                                                                                             | S3       | S    |
| 1.4  | **Clear international state on retirement**: `careerNationId`, `inSquad`, `starts` and `window` in `retireCareer`.                                                                                                                                                                                                                                                                                                                          | S5       | S    |
| 1.5  | **Unique career ids**: derive the id from the legacy count as well as the name, so a child named after the parent can be created.                                                                                                                                                                                                                                                                                                           | S6       | S    |
| 1.6  | **Pre-contract versus renewal**: an agreed pre-contract closes renewal talks; signing a renewal cancels a pending pre-contract, with a confirmation.                                                                                                                                                                                                                                                                                        | S7       | S    |
| 1.7  | **Choice quality label** reflects the chance only; the owned trait shows as its own chip; each percentage says what it means ("4% to score").                                                                                                                                                                                                                                                                                               | U5       | S    |
| 1.8  | **Scoreboard names**: no breaks inside words; use the three-letter mark or an ellipsis when narrow; give the status text its own grid area.                                                                                                                                                                                                                                                                                                 | U2       | S    |
| 1.9  | **Inbox actions**: route story and selection messages to their pages; otherwise show no button.                                                                                                                                                                                                                                                                                                                                             | U7       | S    |
| 1.10 | **Season review rival line** uses the role-appropriate `rivalOutput`.                                                                                                                                                                                                                                                                                                                                                                       | C15      | S    |
| 1.11 | **Focus ring** in cream or gold on every field-green hero, with an axe/contrast check in the accessibility spec.                                                                                                                                                                                                                                                                                                                            | U6       | S    |
| 1.12 | **"Late winner" headline** only when the goal was the winner.                                                                                                                                                                                                                                                                                                                                                                               | M17      | S    |
| 1.13 | Dev-dependency advisories (`npm audit fix`, Vite 7.3.7) and the missing catch in `useAutosave.ts:22`.                                                                                                                                                                                                                                                                                                                                       | K12, S11 | S    |

**Acceptance:** each fix has a failing-then-passing test; all gates pass; 0.9.1 patch notes.

---

## Phase 2 — Foundations for the 1.0 branch

Measure first and make the test base match the real game, so later phases are judged on evidence.
Nothing in this phase changes gameplay.

### 2.1 A national-format test world (K1) — L

- Build one deterministic "national-mini" world in a Vitest `globalSetup` (a reduced but genuine
  national world: continental cups, AI market, AI injuries) and `structuredClone` it per test.
- Migrate the career, market, honours, social and lifestyle suites and the e2e support helpers to
  it. Keep a small explicit `legacy-compat` suite for the legacy format.
- Put the heavy statistical and soak tests in a `slow` Vitest project that runs on `main`,
  nightly and before release (K10).

### 2.2 Golden save fixtures (K9, S8) — S–M

- Commit compressed real saves (the 0.3.0 and 0.8.0 saves in `artifacts/review-2026-10-25/golden-saves`,
  plus 0.9.x), including mid-match sessions. Each must load, finish its match, simulate a week and
  re-export identically.
- Add a CI check that fails when the persisted shape in `domain.ts` changes without a schema bump.

### 2.3 Gates that encode the 1.0 targets — M

Add these as reported targets now (they will fail), and turn each into an asserted gate in the phase
that meets it.

| Gate                     | Target                                                                                                                                                                                                                                                                                        | Met in phase |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| Choices matter           | Perfect vs worst play ≥ 0.30 goals a match for every position, on two seeds                                                                                                                                                                                                                   | 5            |
| No dominant choice       | No choice is best in more than 60% of its situation's instances                                                                                                                                                                                                                               | 5            |
| Ratings                  | Per-position mean 6.5–6.9, standard deviation 0.7–1.0, ≤ 3% at 9.0+ and ≤ 3% at 5.0 or less                                                                                                                                                                                                   | 5            |
| Match statistics         | Shots on target 30–40%; 11–14 shots a team; possession p10–p90 at least 40–60%; some goals in added time; existing goal, home and upset bands                                                                                                                                                 | 5            |
| Honours fairness         | Median Hall of Fame rank of keeper, centre-back and midfielder careers within an agreed band of striker careers; no line wins more than 50% of Golden Balls over 25 seasons; no award below tier 2 counted at full weight                                                                     | 7            |
| Prime years              | Median age at fame level 10 ≥ 27; fan affection not pinned at ≥ 95 for more than half of seasons from 25                                                                                                                                                                                      | 7            |
| Economy                  | Career wealth by age within a band with a sponsor-accepting policy (C19)                                                                                                                                                                                                                      | 7            |
| World drift (25 seasons) | 85+ and 90+ counts, age buckets and national ratings within ±25% of season 1; champion median 2.1–2.5 points a game; 17th 0.85–1.1; 3–7 champions per 20 seasons a country; median club balance ≤ 2× start, some clubs in debt; keepers ≥ 5% of AI purchases; zero same-squad duplicate names | 8            |
| Save size                | ≤ 0.5 MB growth a season after season 10; no validator cap reachable within 200 seasons                                                                                                                                                                                                       | 3            |

- Run the world drift gate nightly on two seeds (it takes about 20 minutes a run).
- **Honest phone measurements (P2).** Throttle or scale worker time in `e2e/performance.spec.ts`,
  report main thread and workers separately, and record the budget from Phase 3.

### 2.4 Compatibility policy (K2, decision D3) — M

- Write `docs/COMPATIBILITY.md`: the live save schema, engine, rule flags, what each release
  supports, and a test that checks the stated versions against `CONFIG` and `MATCH_ENGINE_VERSION`.
- Per D3, apply the one-time cut on the 1.0 branch:
  - adopt the selection, identity, economy and development flags on load (instead of at rollover);
  - keep `match-21` sessions resumable; discard older in-progress sessions with a notice and
    restart that fixture from kick-off;
  - delete the `match-10` to `match-20` paths, their gates and their snapshot tables;
  - squash old migrations behind the golden fixtures from 2.2;
  - keep legacy fictional-country worlds loadable, frozen in one module.
- Going forward: keep at most one previous engine, for one minor release.

### 2.5 Layout and identity test data — S

- A 40-character player name, a long club name and a long competition name in the layout e2e
  tests; a check that no visible text breaks inside a word at the five widths.

### 2.6 Locale helpers (K6) — S–M

- `src/i18n/locale.ts`: `plural()` on `Intl.PluralRules`, `formatNumber`, `formatMoney`,
  `formatDate`; serve `t` from a registry typed by `typeof en`.
- Replace the 14 hard-coded `en` formatters and the binary plurals; add a lint rule banning literal
  locale arguments. All new copy in later phases uses these helpers.

### 2.7 Tooling (K11, K12, K14, K16) — S

- Type-aware lint with `no-floating-promises` and `no-misused-promises`; ban `Date.now`,
  argument-less `new Date()` and `performance.now` in the engine; `tsconfig.engine.json` without
  the DOM lib.
- Grouped monthly Dependabot, an audit step in CI, rename `npm run audit` to `lighthouse`, `.nvmrc`.
- `knip` in CI, and remove the 17 dead exports.
- An e2e `test.extend` fixture for console and page errors, replacing the copy in 22 specs; replace
  `waitForTimeout` with `expect.poll`.

### 2.8 Bundle headroom (K3, P8) — S–M

- Move the name catalogue and squad-number backfill off the match route; lazy-load the report,
  maps and celebrations; split `i18n/match.ts`.
- Move Dexie and the validators off the main thread (validation runs in the persistence worker);
  set Pixi `manageImports: false` and drop the WebGPU renderer from the precache.
- Budget what a route really loads before it is usable, not only static imports. Warn at 285 KB.

**Acceptance:** MatchBody ≤ 280 KB; most suites run on the national-mini world; golden fixtures pass;
every 2.3 target is reported; the compatibility doc and its version test exist.

---

## Workstream A — Analytics (ships to `main` early, as 0.10.0)

Decided 25 October (D4): product analytics on **PostHog EU** with **two-tier consent**, so balance,
performance and engagement can be seen and analysed. It ships to `main` ahead of 1.0, so real
players' data from 0.10 gives a baseline that the 1.0 retunes are judged against. It does not
depend on Phases 2–9, and every later phase adds its events here.

### A.1 Client and consent — M

- **A tiny client, not the SDK.** `src/analytics/` batches events and sends them to PostHog's EU
  capture endpoint with `fetch(…, { keepalive: true })`, flushing on `visibilitychange` and every
  30 s. Network access goes through a `send` method on the platform adapter, so Android can swap
  it later. The client is lazy-loaded after first paint and stays under 3 KB gzip. Allow the
  PostHog host in `connect-src` in `public/_headers`.
- **Configuration.** The project key and host come from `VITE_POSTHOG_KEY` and
  `VITE_POSTHOG_HOST`, read at build time. The site is built in GitHub Actions, so they are
  GitHub repository variables passed to the build step in `ci.yml` (set on 25 October), and
  `.env.local` locally. Without a key (tests, forks), analytics is off. Preview deployments
  tag events with `environment: preview`.
- **Tier 1, anonymous, on by default with an opt-out in Settings.** No identifier is stored
  anywhere; events are sent personless (`$process_person_profile: false`) with an in-memory,
  per-page-load session id. Covers performance, errors, and match and balance statistics.
- **Tier 2, opt-in.** One friendly prompt after the first match: "Help shape the game: share how
  you play over time." Only with consent does the client store a random install id (behind the
  platform adapter) and send person profiles, which power retention and engagement analysis.
  Withdrawing consent deletes the id; a new consent gets a new one.
- **Never sent:** typed names, seeds, save contents, free text, or anything that identifies a
  person. Players, clubs and nations appear only as ids and bucketed numbers. A unit test checks
  every event's properties against an allow-list.
- **Privacy page** (brought forward from 9.1) explaining both tiers in plain words, linked from
  Settings and the prompt. The "no tracking" copy becomes "no ads, no account, no personal
  tracking without your say-so". A short legal check of the wording before 1.0 (with D7).

### A.2 Events — M

All events carry the app version, save schema, match engine, world format, device class (from
`hardwareConcurrency`, `deviceMemory` and viewport) and the event's own properties.

| Area        | Events                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Funnel      | `landing_viewed`, `wizard_step` (step, quick start), `world_built` (ms), `career_created` (position, archetype, nation, start tier), `first_key_moment`, `match_finished` (count 1, 5, 10), `season_finished`                                                                                                                                                                                                                                       |
| Balance     | `key_moment` (situation, position, choice id, stated chance, success, chosen and best expected value; sampled if volume needs it), `match_result` (tier, competition kind, position, minutes, rating, goals, assists, decisions, sim-only, played or simulated), `level_up`, `skill_unlocked`, `season_summary` (age, tier, club reputation, level, fame band, wealth band, awards, Hall of Fame rank band), `transfer`, `retired` (age, rank band) |
| Performance | `app_loaded` (navigation and TTI timings), `continue_timed` (weeks, ms to matchday and to saved, save size band), `season_simulated` (ms), `save_failed` (kind), `error` (from the diagnostics ring buffer in 4.7, message hashed and truncated, no stack paths with user data), `pitch_fps` (p50 and p95 per match)                                                                                                                                |
| Engagement  | `session_started` and `session_ended` (length, screens visited), `route_viewed`, feature use (`press_answered`, `story_resolved`, `sponsor_decided`, `shared`, `export_done`), `setting_changed` (setting, not value text)                                                                                                                                                                                                                          |

### A.3 Seeing and analysing — S–M

- **Three PostHog dashboards**, defined in `docs/ANALYTICS.md` as HogQL queries and created with
  PostHog's API from a script (`npm run analytics:dashboards`, with a personal API key kept out of
  the repo):
  - **Balance:** stated vs realised success by situation and choice; pick rates and dominant
    choices; rating distribution by position; goals per match by tier; level and fame by age;
    Hall of Fame rank by position.
  - **Performance:** Continue and load times p50/p95 by device class and save size; errors and
    save failures by version; pitch frame rate.
  - **Engagement:** the landing → first key moment → match five → season one funnel; D1, D7 and
    D30 retention (opted-in players); session length; feature use; play vs simulate share.
- **Balance gates meet live data.** `docs/ANALYTICS.md` maps each 2.3 gate to its live query, so
  a gate's headless result can be compared with real players'.
- **Feature flags** for A/B balance tests are available but unused until a phase needs one.

### A.4 Tests — S

- Unit: consent gating (tier 1 off sends nothing; tier 2 off stores no id), the property
  allow-list, batching and flush.
- e2e: with no key, no request leaves the page; with a key and tier 1 off, none reaches the
  PostHog host; the CSP allows the host.

**Acceptance:** events arrive in the PostHog project from a production build; the three
dashboards exist; the consent states behave as above in all three engines; the client adds at
most 3 KB gzip and nothing to the critical path.

**Needs from you:** done — the PostHog EU project exists and its project key is set. For the
dashboard script, a personal API key kept in `.env.local`, never committed.

---

## Phase 3 — Fast saves and long worlds

Rewrites the worker and persistence core that later phases build on, so it comes before the
gameplay work.

| Step | Change                                                                                                                                                                                                                                                                                                                                                                            | Findings    | Size |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ---- |
| 3.1  | **Skip full validation on the app's own writes**; keep it on load and import.                                                                                                                                                                                                                                                                                                     | P1          | S    |
| 3.2  | **A long-lived world worker that holds the world.** Resend only what the main thread changed.                                                                                                                                                                                                                                                                                     | P1          | M    |
| 3.3  | **The worker writes weekly checkpoints itself** (directly to the persistence worker) and publishes the world to the UI once per job.                                                                                                                                                                                                                                              | P1, P9      | M    |
| 3.4  | **UI state that changes often leaves the world**: challenge refresh, press answers and purchases write small per-slot records, not the whole world.                                                                                                                                                                                                                               | P3          | S    |
| 3.5  | **Match sessions saved as setup plus commands**, sent as one message, validated on load and import only.                                                                                                                                                                                                                                                                          | M18, P7     | M    |
| 3.6  | **Retention**: trim `history` and awards to summaries beyond the last N seasons; prune the archive to players still referenced plus the top Hall of Fame scorers, with a precomputed sorted score array so ranks stay exact; stop storing derivable untrained keeper attributes. A migration applies it. A test pins every validator cap against 200 simulated seasons of growth. | P4, S4, W14 | M    |
| 3.7  | **Export size**: gzip export and import through `CompressionStream` (78 → 9 MB); refuse an export larger than the import limit, with an explanation.                                                                                                                                                                                                                              | P12, S4     | S    |
| 3.8  | **Engine caches**: AI attribute targets once a season, `playerAbility` once a week, constant arrays hoisted. Identical results, checked by the soak hash and the 10,000-match test.                                                                                                                                                                                               | P5          | S–M  |
| 3.9  | **Music rendered at build time** to a small self-authored Opus/AAC file (recorded in ASSETS.md), loaded after the first gesture.                                                                                                                                                                                                                                                  | P6          | S    |
| 3.10 | Narrow store selectors where whole-world subscriptions remain; register the service worker after load and idle; trim unreachable chunks from the precache; cap pitch resolution at 1.5 and drop antialiasing on dense or low-memory devices.                                                                                                                                      | P9–P11      | S–M  |

**Performance budget (late save, asserted where the harness allows):**

| Metric                                   | 0.9.0                  | 1.0 target            |
| ---------------------------------------- | ---------------------- | --------------------- |
| Shell + route JS                         | ≤ 298 KB gzip          | ≤ 280 KB              |
| Hub-ready main-thread JS                 | about 416 KB gzip      | ≤ 350 KB              |
| One-week Continue, desktop               | 2.5 s (4.8 s to saved) | ≤ 1.2 s (≤ 2 s saved) |
| One-week Continue, emulated phone        | 11.1 s to saved        | ≤ 5 s saved           |
| Season simulation, desktop               | about 3.5 min          | ≤ 75 s                |
| Longest main-thread task during Continue | 480 ms                 | ≤ 200 ms              |
| Save after 34 seasons                    | 104 MB                 | ≤ 90 MB               |
| Peak memory across threads               | about 500–600 MB       | ≤ 400 MB              |
| First-session audio CPU                  | 3.8 s                  | ≤ 100 ms              |

**Acceptance:** the budget holds; the golden fixtures still load and round-trip; the soak hash is
unchanged by 3.8.

---

## Phase 4 — Saves that survive anything

| Step | Change                                                                                                                                                                                                                                                    | Findings | Size |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ---- |
| 4.1  | **Coordinated updates across tabs.** Before `skipWaiting`, ask every tab over BroadcastChannel to flush; refuse while any tab is busy or holds an unsaved world, and say which. Installed PWAs call `registration.update()` on focus.                     | S2, S11  | M    |
| 4.2  | **Error boundaries per route inside Shell** with Retry, Export unsaved and Reload; a Pitch boundary that falls back to the SVG pitch; one retry for failed lazy imports (`vite:preloadError`); flush the pending autosave before an unmount.              | S2       | M    |
| 4.3  | **Rotating backups** in a `backups` table: one per season end and one per day, two to three generations per slot, after checking `navigator.storage.estimate()`. Offer restore when a load fails.                                                         | —        | M    |
| 4.4  | **Salvage load**: when strict validation fails, try dropping only the failing optional part (match session, feed, statistics) and say what was dropped.                                                                                                   | S3       | S    |
| 4.5  | **Persistence watchdog**: the worker always replies, a per-request timeout restarts it, and the stored revision is checked before reporting a conflict.                                                                                                   | S9       | S    |
| 4.6  | **Storage preflight**: a specific "storage full" message with Export, instead of the generic error.                                                                                                                                                       | —        | S    |
| 4.7  | **Local diagnostics without telemetry**: a ring buffer of caught errors, rejections, preload and worker errors, shown in Settings and included in "Export diagnostics" (with version, seed and revision). This feeds the bug report in 9.1.               | G3       | S    |
| 4.8  | Platform leaks (`sessionStorage` in the wizard draft, `localStorage` in release notices) move behind the adapter; the post-match report survives a refresh; the simulate-window guard checks every busy state; refresh of a locked `/match` offers retry. | K15, S11 | S    |
| 4.9  | Validators: `satisfies Record<keyof T, …>` so a new field fails the typecheck; a round-trip test on a fully populated world.                                                                                                                              | K8       | M    |

**Acceptance:** a two-tab update test passes in all three engines; a forced validator failure still
exports and offers restore from a backup; a killed persistence worker recovers without a false
conflict.

---

## Phase 5 — The match (engine `match-22`)

The core loop. 5.1 is presentation only and can start as soon as 2.8 frees budget; 5.2–5.4 change
rules and share one engine bump. Split `match/index.ts` along the way (`lineup`, `minute`,
`cards`, `extraTime`, `report`, `moments`), after 2.4 removes the old gates (K7).

### 5.1 How the match looks and flows — M

- **Continuous play (M2):** choose each passage's rate so it fills its minute (about 4–5× at 1×).
  No frozen pitch between minutes.
- **Goal moments (M3):** a goal plays at decision pace, then a GOAL banner, a score-aware commentary
  line naming the team, and an optional replay. Reduced-motion mode keeps the banner without
  movement.
- **Simulation-only mode jumps from moment to moment (M15).** The match speed is remembered (M19).
- **Choice value hint (M14):** "best value / even / costly" from the expected values the engine
  already computes, next to the chance; the outcome panel shows only non-zero factors, with the
  rest behind disclosure, and keeps the pitch replay in view (U13).
- **Phone match flow (U3, U4):** the briefing header stacks under 480 px; kick-off scrolls the score
  bar and pitch into view; a sticky mini scoreboard; the bottom nav hides during a live match (U16).
- **Team colours against the background (U19):** extend the clash check to card and pitch contrast.
- **The report (M16, U12):** score, rating and XP first; scorers and team statistics; a "Your
  moments" recap with each choice's odds and the best alternative; one stable layout with one XP
  figure; a sticky action bar; no sideways scroll on phones; the level-up as a real moment.

### 5.2 Choices that decide matches — M–L

- **Rebalance choice values (M4, M5)** so every option wins in some contexts the pitch shows
  (keeper positioning, free-kick distance and wall, corner delivery against marking), and the
  player's choices are worth at least 0.30 goals a match. Meet the "choices matter" and "no
  dominant choice" gates.
- **More situations per position, with context (M9):** for defenders, last-man foul, cross defence,
  2-on-1 and set-piece marking; for keepers, sweeping and back-pass under pressure; for attackers,
  rebound and weaker-foot chance. More framing sentences per situation.
- **Skill-unlocked choices replace the weakest base choice** rather than hiding another (C14);
  capstones become mechanics rather than multipliers, and Clutch gets its late or pressure
  condition (C13, match part).
- **"Marked man" (C17):** when the player clearly outclasses the league, opponents double-mark,
  named as an odds factor.

### 5.3 Believable ratings and statistics — M

- **Compress and centre ratings (M6)** per position; meet the ratings gate. Retune XP from rating
  so levelling pace stays on its current curve (and see 6.2 for the first level-up).
- **Statistics (M10, M11):** possession uses style and home advantage; shot volume and accuracy
  move to real bands; the woodwork is a shot outcome.

### 5.4 The occasions — M–L

- **Coming off the bench (M7):** a benched player can be brought on between 55′ and 80′, with two
  to four moments and impact-substitute headlines; the brief's promise becomes true.
- **A real shootout:** five kicks a side plus sudden death, the player as a taker or as the keeper
  facing every kick, replacing the single nudge to a hidden coin flip.
- **Stoppage time (M12):** a "+N" board; late moments can land in added time.
- **In-match injuries (M12):** a "play on or come off" decision tied to the injury system; AI
  players forced off; keepers can be booked; extra-time substitutions.
- **Touchline decisions with trade-offs (M13):** choose the half-time role with a chance of
  refusal; captain calls after conceding and late on; a substitution response with a real cost.

### 5.5 Commentary and reactions — M

- Routine passes collapse into one summary row; goal lines name team and score; home and away
  crowd lines differ; at least eight variants for the lines a player sees most; manager and fan
  reactions vary with the match story (M8, M21).

**Acceptance:** all match gates from 2.3 pass on two seeds; the 10,000-match distribution holds;
the outcome snapshot is re-baselined once for `match-22`; a `match-21` session from a golden fixture
finishes under its own rules.

---

## Phase 6 — Pacing, first session and navigation

| Step | Change                                                                                                                                                                                                                                                                                                                                                                                                                          | Findings            | Size |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | ---- |
| 6.1  | **Quick start.** Generate the default world in the worker as the wizard opens; the seed moves to Advanced; no red "not saved" warning; trial clubs explained (level, role, minutes); the sign step shows wage and length. A one-tap "Kick off now" (random look, ST or CM, auto-picked trial club) reaches the hub in under 30 s. Split `CareerNew.tsx` into steps with a draft hook.                                           | G1, U14, K7         | M    |
| 6.2  | **A debut that lands.** The first fixture starts the player; a moment comes in the first 15′; match one ends in a level-up and a skill pick; the hub tour can be skipped in one tap; from the hub, one click to the briefing.                                                                                                                                                                                                   | G2, U14             | S    |
| 6.3  | **Simulate this match, and play only the big ones.** "Simulate this match" on every matchday; a preference to play everything, only big matches (cup ties, finals, derbies, title and relegation deciders, internationals, using `career/stakes.ts`), or simulate all. Simulated decisions follow the player's Decisions and Composure, not the optimum; playing yourself keeps a small bonus.                                  | C4, G7              | M    |
| 6.4  | **The hub, rebuilt around the next action.** First screen: the fixture with Play/Simulate, "Needs you", and condition. Zero-state cards hide; stale tasks expire; the rest sits behind sections. Split `HubBody.tsx` into `hub/*`.                                                                                                                                                                                              | U11, K7             | M–L  |
| 6.5  | **Navigation that stays put.** Fixed bottom-nav slots on phones whether or not a career is loaded; Matchday never hides in More; distinct icons. Consolidate the 18 career pages: Agent into Transfers, Wardrobe into Lifestyle, Moments as a Chronicle tab, Legacy shown near or after retirement; Gallery out of the main menu. Esc never leaves a live match; its fallback is the hub. The sidebar fits 900 px at 130% text. | U15, U8, U9, C, G18 | M    |
| 6.6  | **One source per fact.** Shared selectors for position and slot, contract end, availability and role, used by every screen.                                                                                                                                                                                                                                                                                                     | U10                 | M    |
| 6.7  | **Fewer interruptions.** "Not interested in moving this season" (a loyalty stance that suppresses bids for a window and records `declared-loyalty`); press only for big matches, droughts, rumours and the rival, with routine auto-answer on by default; inbox duplicates collapse into the hub agenda and "dropped" becomes a weekly digest.                                                                                  | C18, C10, C20       | S–M  |
| 6.8  | **Names that fit.** A shared display-name component that fits the container, falls back to the surname, and never breaks inside a word, on every identity surface.                                                                                                                                                                                                                                                              | U1                  | M    |
| 6.9  | Saves and World inside a career: no gallery framing, refresh keeps the loaded career; World opens on the player's league with the hub's verbs, without "Save this world". Phone wizard without bottom nav; no horizontal chip strip.                                                                                                                                                                                            | U17, U18, U16       | M    |

**Acceptance:** from the landing page, a new player reaches a key moment in ≤ 10 interactions and
about 90 s (measured in the e2e journey); a season can be played with only big matches; the layout
tests pass with long names in all three engines.

---

## Phase 7 — A career worth finishing

Career rule changes adopt through `career.developmentRules: 4` (and `achievementVersion: 2` for
honours) at the next season start.

### 7.1 Fair honours for every position (C1, C2, W4) — M

- Award points are weighted by tier; league awards below tier 2 are either given in every league
  at that tier or kept out of the Hall of Fame record (decision in this step, documented).
- A per-line award score: midfield counts key passes, chances created, progressive actions and
  tackles; defenders and keepers count prevented goals and clean sheets; each line is normalised
  by its own distribution. A Playmaker of the Season award. A position-balanced Golden Ball
  shortlist that weighs ability and team success more.
- Existing saves: re-score from stored award records where they exist (decision D10); where the
  history is incomplete, say so on the Hall of Fame screen.
- Meet the honours fairness gate with keeper, centre-back, midfielder and striker profiles.

### 7.2 Goals that last a career (G6, C3, C8, C9, C7) — M–L

- **Achievements and a career goals board**, per career and across careers: records within reach,
  trophies not yet won, a dream club, the next Hall of Fame rank, and position-specific goals for
  keepers and defenders. Built on recorded facts so they map onto Play Games achievements later.
- **One season contract** replaces the coaching season goal, the manager's six-week challenge and
  the preseason ambition: one manager target and one personal ambition, with sponsor obligations
  shown inline, reviewed at season end. Attribute targets count trained and passive growth, not
  spent points; selection-dependent targets never write permanent grievances; grievances decay
  after about two seasons or clear with a kept promise.
- **Daily and weekly challenges and style tokens retire** (decision D5): earned tokens convert into
  cosmetics; the goals board takes their place.
- **A status ladder past fame level 10** (National icon → Continental star → World icon) gating late
  unlocks: legacy projects, signature boots, a testimonial. Diminishing returns near 100 on fan
  affection and manager trust, and events that cost standing.

### 7.3 Money that matters (C5, C6, C16) — M

- Sponsor fees scale with league tier and club reputation as well as fame; renewal growth is capped.
- Lifestyle prices are absolute tiers; fewer items with distinct effects (a home near the training
  ground speeds recovery; moving the family lifts morale but makes a move costlier).
- Staff fold into training as one coaching-team choice with real trade-offs.
- Agents offer distinct services (reach abroad and for loans; release-clause expertise; cheap but
  no stretch), and their loyalty rises or falls with outcomes.
- Late money sinks scaled to wealth: an academy, a stand at a former club, a club stake that lets a
  child start there.
- The career harness gains sponsor, story and press-tone policies, and the economy gate (C19).

### 7.4 Skills (C13) — S–M

- One paid respec a season; Evergreen worth its tier; Aerial Dominance useful to outfielders;
  descriptions match effects.

### 7.5 Story content for 18 seasons (C11, C12) — M–L

- Three variants per story scene, press answer and fan post; about eight new mid- and late-career
  stories (contract-year drama, international retirement, losing your place to a youngster, the
  rival joins your club, a homecoming, a media scandal, an injury scare at 31); longer cooldowns
  for charity and night-out.
- Second-generation hooks: a "son or daughter of" press topic, interest from the parent's old
  clubs, the parent's records as explicit targets, and former teammates as managers who remember
  the name.

**Acceptance:** honours, prime-years and economy gates pass; a keeper and a midfielder career each
reach a Hall of Fame rank within the agreed band; a sponsor-accepting career's wealth stays inside
its age band.

---

## Phase 8 — A world that holds for generations

World rule changes adopt through a new `worldRules: 2` flag at the next season start. Meet the
world drift gate on two seeds over 25 seasons.

| Step | Change                                                                                                                                                                                                                                                                   | Findings     | Size |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------ | ---- |
| 8.1  | **Stable talent.** Rank-based target reputations within each tier; intake potential from a percentile per tier, tuned to attrition; a small high-potential lottery at every academy; generate the starting age profile from the lifecycle's own steady state.            | W1, W11, W10 | M    |
| 8.2  | **Competitive balance.** Stature-anchored target reputations, a wider tier-1 band (about 65–92), superlinear finances and a stronger strength gap. Meet the champion, 17th-place and distinct-champion bands.                                                            | W2           | M–L  |
| 8.3  | **Names.** At least 250 first names and 600 surnames per country, compound surnames for Spain and Portugal; reroll on collision within a squad at intake, signing and transfer; a duplicate test. Existing worlds keep their names; new players draw from the new pools. | W3           | S    |
| 8.4  | **A smarter AI market.** Slot deficit judged against the league's typical starter for that position, including keepers; free agents in the market at no fee; top clubs sell surplus before release; AI loans for young players.                                          | W5, W6, W10  | M    |
| 8.5  | **Club finances with sinks.** Facilities, wage growth and spending from surplus; lower continental prize money; strain and debt that actually happen.                                                                                                                    | W7           | M    |
| 8.6  | **Continental access.** About 4/4/4/4/3/2 Champions Cup places plus the holder; the domestic cup winner to the Shield; two-legged knockout ties; documented in REALISM.md.                                                                                               | W8           | M    |
| 8.7  | **A real calendar.** Map game weeks onto August–June with midweek slots; international windows free of league rounds in September, October, November, March and June; finals in May or June; contracts end on 30 June. Applies from the next season.                     | W9           | M    |
| 8.8  | **Managers with a life.** Managers age and retire around 70; an unemployed pool clubs hire from; ability matched to club stature; top-flight sacking rate in the real band.                                                                                              | W12          | M    |
| 8.9  | **Internationals.** Guest nations rated relative to the six simulated nations; international football continues while the world has no career.                                                                                                                           | W13, S10     | M    |
| 8.10 | Dormant clubs get a light seasonal pass and weighted-random readmission.                                                                                                                                                                                                 | W16          | S    |

**Acceptance:** the world drift gate passes on two seeds; the pyramid movement tests still match
REALISM.md exactly; the save-size gate holds.

---

## Phase 9 — Launch

| Step | Change                                                                                                                                                                                                                                                                                                                           | Findings          | Size |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | ---- |
| 9.1  | **Feedback and privacy.** "Report a bug / send feedback" in Settings and the menu: a prefilled issue or email with version, schema, engine and seed, and optionally the diagnostics from 4.7 and an exported save. A short privacy page.                                                                                         | G3                | S    |
| 9.2  | **Analytics review before launch**: the Workstream A dashboards checked against the 2.3 gates and the playtests; any P1 they raise resolved.                                                                                                                                                                                     | G4                | S    |
| 9.3  | **Legal hygiene.** A non-affiliation notice on the landing page and in About; `reference` names stripped from production bundles; descriptive labels instead of real league names in the rules panel; a short legal check of club nicknames (D7).                                                                                | G9                | S    |
| 9.4  | **Landing and install.** A headline that leads with the hook, the key-moment sample animated above the fold, and wide and narrow manifest screenshots.                                                                                                                                                                           | G8                | S    |
| 9.5  | **Share cards** for results with a rating, promotion, trophies, the Golden Ball and the legacy, offered right after the event; Moment links in the path so they get their own preview image (if D6 includes it).                                                                                                                 | G11               | M    |
| 9.6  | **Polish pass, screen by screen**, at the five widths, both themes and 130% text: copy slips, Settings layout, pitch labels, focus shapes, spacing, the AudioContext warning.                                                                                                                                                    | U20–U25           | M    |
| 9.7  | **Docs for 1.0.** About 12 living documents (README, AGENTS, PRODUCT, DESIGN-SYSTEM, ARCHITECTURE at ≤ 400 lines linking to `domain.ts`, COMPATIBILITY, DEVELOPING, RELEASING with DEPLOY, BALANCING with MATCH-BALANCING, REALISM, DECISIONS, QA) and `docs/history/` for the rest. Every stale fact from the review corrected. | K4, M20, C21, W17 | M    |
| 9.8  | **Real devices and people.** Run DEVICE-ACCEPTANCE.md on iPhone Safari, macOS Safari and a mid-range Android with a late-career save; a nightly macOS WebKit job for the persistence, worker and audio specs; five to eight newcomer sessions (first 30 minutes) and two to three veteran sessions with the recall protocol.     | G5, K5            | M    |
| 9.9  | **Release.** Lighthouse as a release gate; the amended version policy in RELEASING.md; 1.0.0 patch notes and a "What's new in 1.0" screen that explains rule changes existing saves will meet at their next season; merge `release/1.0` to `main`.                                                                               | K17, G10          | S    |

---

## Exit criteria for 1.0.0

- Every gate from 2.3 is asserted and passes on two seeds.
- The Phase 3 performance budget holds, including on the honest phone profile.
- Golden fixtures from 0.3.0, 0.8.0, 0.9.x and a 1.0 preview save load, play and round-trip.
- All Playwright specs pass in Chromium, Firefox and WebKit; the device checklist passes on real
  iOS Safari and Android Chrome.
- Lighthouse: desktop > 90, mobile > 85, accessibility > 95 on every route.
- No P0 or P1 finding from the review is open without a recorded decision.
- Playtest results are recorded in PLAYTEST.md, and any P1 they raise is resolved.

## Not in 1.0

Android (milestone 11); manager career; online features, cloud sync and portals; the partitioned,
columnar save format (1.x, after 3.6 removes the urgent growth); React 19, Vite 8 and the other
major upgrades; splitting `motion.ts`; full translations (the locale infrastructure is in 2.6).
Depending on D6: difficulty presets and Ironman (G12), scenario starts (G13) and edit packs v2
(G14).

## Order and parallel work

Phase 1, then Workstream A (released as 0.10.0 so live data accumulates), then Phases 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 is the recommended order for one implementer.

- Phase 3 rewrites the worker and persistence core, so it comes before the gameplay phases.
- Gameplay is ordered by impact: the match first, then pacing, the career, and the world.

With more than one implementer:

- Phase 4 can run alongside Phase 5.
- 5.1 (presentation) can start as soon as 2.8 is done.
- Phase 8 can start once 2.3's drift gate exists.
- 9.1–9.4 and 9.8 can run alongside Phases 6–8.

## Findings to work map

| Finding                    | Step(s)            | Finding                    | Step(s)                                          |
| -------------------------- | ------------------ | -------------------------- | ------------------------------------------------ |
| M1                         | 1.1                | S1                         | 1.2                                              |
| M2, M3, M14, M15, M16, M19 | 5.1                | S2                         | 4.1, 4.2                                         |
| M4, M5, M9                 | 5.2                | S3                         | 1.3, 4.4                                         |
| M6, M10, M11               | 5.3                | S4                         | 3.6, 3.7                                         |
| M7, M12, M13               | 5.4                | S5, S6, S7                 | 1.4–1.6                                          |
| M8, M21                    | 5.5                | S8                         | 2.2                                              |
| M17                        | 1.12               | S9                         | 4.5                                              |
| M18                        | 3.5                | S10                        | 8.9                                              |
| M20                        | 9.7                | S11                        | 1.13, 4.1, 4.8                                   |
| C1, C2                     | 7.1                | P1                         | 3.1–3.3                                          |
| C3, C7, C8, C9             | 7.2                | P2                         | 2.3                                              |
| C4                         | 6.3                | P3                         | 3.4                                              |
| C5, C6, C16, C19           | 7.3                | P4                         | 3.6                                              |
| C10, C18, C20              | 6.7                | P5, P6, P7                 | 3.8, 3.9, 3.5                                    |
| C11, C12                   | 7.5                | P8                         | 2.8                                              |
| C13                        | 5.2, 7.4           | P9–P12                     | 3.3, 3.7, 3.10                                   |
| C14                        | 5.2                | U1                         | 6.8                                              |
| C15                        | 1.10               | U2, U5, U6, U7             | 1.8, 1.7, 1.11, 1.9                              |
| C17                        | 5.2                | U3, U4, U12, U13, U16, U19 | 5.1, 6.9                                         |
| C21                        | 9.7                | U8, U9, U15                | 6.5                                              |
| W1, W10, W11               | 8.1, 8.4           | U10                        | 6.6                                              |
| W2                         | 8.2                | U11                        | 6.4                                              |
| W3                         | 8.3                | U14                        | 6.1, 6.2                                         |
| W4                         | 7.1                | U17, U18                   | 6.9                                              |
| W5, W6                     | 8.4                | U20–U25                    | 9.6                                              |
| W7                         | 8.5                | K1, K10                    | 2.1                                              |
| W8                         | 8.6                | K2                         | 2.4                                              |
| W9                         | 8.7                | K3                         | 2.8                                              |
| W12                        | 8.8                | K4                         | 9.7                                              |
| W13                        | 8.9                | K5                         | 9.8                                              |
| W14                        | 3.6                | K6                         | 2.6                                              |
| W15                        | Not in 1.0         | K7                         | 5, 6.1, 6.4                                      |
| W16                        | 8.10               | K8                         | 4.9                                              |
| W17                        | 9.7                | K9                         | 2.2                                              |
| G1, G2                     | 6.1, 6.2           | K11, K12, K14, K16         | 2.7                                              |
| G3                         | 4.7, A.1, 9.1      | K13                        | When each file is touched                        |
| G4                         | A, 9.2             | K15                        | 4.8                                              |
| G5                         | 9.8                | K17                        | 9.9                                              |
| G6                         | 7.2                | K18                        | 5.2 (record in DECISIONS.md or move to `CONFIG`) |
| G7                         | 6.3                | G12, G13, G14              | Per D6                                           |
| G8, G9, G10, G11           | 9.4, 9.3, 9.9, 9.5 | G15, G16–G19               | 2.6, 7.2, 6.5, 9.1                               |

## Decisions

Confirmed by the user on 25 October 2026 (D1, D3, D4, D5). The others follow the recommendation
unless the user says otherwise.

| #   | Decision                                                | Outcome                                                                                                                                                                                                                                                                                        |
| --- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Staging a big release when every push to `main` deploys | **Confirmed.** Phase 1 hotfixes to `main` as 0.9.x, and Workstream A as 0.10.0; everything else on `release/1.0` with preview deployments; merge once as 1.0.0.                                                                                                                                |
| D2  | Version policy                                          | Recommended: amend RELEASING.md so 1.0.0 marks the launch with saves migrating; after 1.0, a major means saves can no longer load.                                                                                                                                                             |
| D3  | Compatibility cut at 1.0                                | **Confirmed.** Keep every save loadable. Keep `match-21` sessions resumable; discard older in-progress sessions with a notice and replay the fixture from kick-off. Adopt old rule flags on load once, at 1.0. Delete `match-10`–`match-20`. Keep legacy fictional worlds loadable but frozen. |
| D4  | Measurement                                             | **Confirmed, expanded.** Product analytics on PostHog EU with two-tier consent and dashboards for balance, performance and engagement (Workstream A).                                                                                                                                          |
| D5  | Daily and weekly challenges and style tokens            | **Confirmed.** Retire them in favour of the achievements and goals board; convert earned tokens into cosmetics.                                                                                                                                                                                |
| D6  | Which "Should" features are in 1.0                      | Recommended: in, simulate a match and big-matches-only (6.3) and share cards (9.5); out to 1.1, difficulty and Ironman, scenario starts, edit packs v2, translations.                                                                                                                          |
| D7  | Real-name references                                    | Recommended: add the notice, strip `reference` names from production and use descriptive league labels now; a short legal opinion on club nicknames and the privacy wording before launch.                                                                                                     |
| D8  | Existing saves meet the world and career retunes        | Recommended: yes, at their next season start, explained on the "What's new in 1.0" screen.                                                                                                                                                                                                     |
| D9  | Devices and playtests                                   | Recommended: required for the 1.0 exit. These need the user or testers with an iPhone and a mid-range Android, and five to eight new players.                                                                                                                                                  |
| D10 | Hall of Fame scores in existing saves                   | Recommended: re-score from stored award records where they exist; state the limitation where they do not.                                                                                                                                                                                      |
