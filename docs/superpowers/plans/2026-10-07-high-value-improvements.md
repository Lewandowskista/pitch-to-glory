# Pitch to Glory: highest-value improvements

**Goal:** Make careers internally consistent, make the next football decision easy to find and understand, and connect existing football systems into a more rewarding career.

**Architecture:** Keep the pure engine, worker simulation, Zustand slices, versioned saves, platform adapter and lazy routes. Use one finalized fixture outcome for career accounting; keep navigation and agenda data derived from existing records; introduce small pure modules for formation selection, coaching and one story arc.

**Stack:** Existing TypeScript, React 18, Vite, React Router, Zustand, PixiJS, Tailwind, Framer Motion, Dexie, Vitest and Playwright. No new runtime dependency is required by this plan.

**Status:** Phases 1 and 2 complete; Phase 3 not started. The review in [PROJECT-REVIEW.md](../../PROJECT-REVIEW.md) is the evidence base; [AGENTS.md](../../../AGENTS.md) remains the product authority.

## Scope and approach

Use six independently reviewable phases. Stop and summarize after each phase, keep the app runnable, and record verification before continuing. The first four phases form the hardening and usability release; the final two add depth.

| Order | Phase                        | Value                                                                | Completion evidence                                                             |
| ----- | ---------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| 1     | Career and result integrity  | Players can trust saves, reports, awards and legacy                  | Regression coverage for every accounting/workflow finding; old saves load       |
| 2     | Match decision experience    | Pitch context and choices remain understandable on desktop and phone | Keyboard/touch flows, screenshots and accessible layout checks                  |
| 3     | Career navigation and agenda | The next useful action is obvious                                    | Focused navigation, prioritized hub and a working personal agenda               |
| 4     | Endurance and performance    | Long careers and real play states are validated                      | Multi-generation soak, populated performance evidence and release gates         |
| 5     | Formations and coaching      | Clubs feel different and development choices have purpose            | Shared selection logic, explained decisions and actionable training advice      |
| 6     | One sustained story arc      | Existing systems create a memorable personal narrative               | A manager development promise survives saves and reaches a Chronicle conclusion |

This sequence is recommended because later coaching and stories depend on trustworthy outcomes. A UI-first sequence would improve first impressions sooner but leave misleading records underneath it. A formation-first sequence would add football depth sooner but expand the engine changes before fixing its accounting boundaries.

Keep the green/gold identity, existing country profiles and browser-first architecture. Interactive internationals, difficulty presets and Android belong after these phases. Do not broaden this work into a replacement management game or introduce new currencies.

## Common execution rules

- Inspect the working tree before each task. Existing uncommitted match-motion work is part of the baseline; preserve it and avoid staging it incidentally.
- For engine and persistence changes, add a focused failing regression before implementation, verify the failure, implement the smallest coherent correction, and verify the regression passes. Test domain behavior rather than internal function structure.
- Add new copy to `src/i18n/`; use shared tokens and Tailwind for substantially reworked UI.
- Keep heavy work in workers and platform-specific functionality in `src/platform/`.
- Increment the save schema only when stored contracts change; update migrations and validators together. Increment the match-engine version when replayed state changes. Read the current versions during execution rather than assuming the review's versions remain current.
- Preserve country sporting rules and prior archives. Never invent missing historical assists, participation or match outcomes during migration.
- Create one focused change set per task. Commit only reviewed task files if committing is part of the implementation session. Do not deploy during this plan's execution without deployment authorization.
- Fetch current library documentation through the AGENTS.md `ctx7` workflow when implementation needs library/API-specific guidance. This planning task uses repository contracts and does not require library lookups.

## Phase 1 — Career and result integrity

### 1.1 Isolate careers and restore the legacy wizard

**Modify:** `src/store/index.ts`, `src/screens/Match.tsx`, `src/screens/career/CareerLegacy.tsx`, `src/screens/career/CareerNew.tsx`, `src/screens/career/shared.tsx`.

**Tests:** create `tests/store-session.test.ts`; extend `e2e/career.spec.ts`, `e2e/honours.spec.ts` and `e2e/foundation.spec.ts`.

- [x] Add a regression where a completed report from slot 1 remains in memory, then slot 2 is loaded. Assert no slot-1 report or outcome appears in slot 2.
- [x] Clear transient report state when replacing a save/world with a different career. Preserve the deliberate report transition during match commit; detaching a save must not erase the player's world.
- [x] Carry `save` through child/new-career links and wizard steps. Restore the saved world before evaluating trial offers, parent identity or reachable steps; show loading or a recoverable storage/lock error instead of generating a replacement world.
- [x] Exercise refresh at appearance, trial and confirmation, browser back/forward, a locked parent save, and signing a child. Assert the world seed, parent legacy and selected save remain the same.

**Accept:** save switching never displays another player's report; a child wizard survives refresh and resumes the existing world without duplicate signing.

**Done (2026-10-07):** the store keeps a retained report only while the loaded career's latest match record is that report's match (`applySave` and `setWorld`), so `Match.tsx` needed no change. Child/new-career links carry `save`; the wizard waits for the saved world (or shows a retry/lock error) before choosing a step, and its step links keep `save` and `parent`. Covered by `tests/store-session.test.ts`, a slot-switch journey in `e2e/career.spec.ts` (confirmed failing without the fix) and the child-wizard journey in `e2e/honours.spec.ts`; `e2e/foundation.spec.ts` needed no change.

### 1.2 Finalize a fixture once and reconcile all career rewards

**Create:** `src/engine/world/finalize.ts`, `tests/match-accounting.test.ts`.

**Modify:** `src/model/domain.ts`, `src/engine/world/simulate.ts`, `src/engine/career/matches.ts`, `src/engine/match/types.ts`, `src/screens/match/Report.tsx`, `src/screens/Match.tsx`, `src/workers/protocol.ts`, `src/workers/run.ts`, `src/persistence/worldValidation.ts`, `src/persistence/careerValidation.ts`.

- [x] Reproduce the reviewed assist mismatch as an automated test. Add an explicit unassisted goal, an assisted goal, a regulation draw requiring extra time, and a player substituted before extra time.
- [x] Introduce a finalized outcome containing final score, deciding method, goal/assist attribution and per-player minutes/contributions. Both background and played-fixture resolution return that outcome before updating totals.
- [x] Treat an absent assist on an interactive goal as unassisted. Assign background assists once and retain their identity in the outcome.
- [x] Keep extra time simulated in this first correction, using only players on the pitch at minute 90. Define extra-time minutes and contribution records explicitly; penalties decide the winner but do not become player goals.
- [x] Derive the career record, contract bonuses, goal-related fame, objective results and performance XP from the finalized contributions. Reuse the engine's configured formulas and extract them into a pure helper if needed; document how simulated extra-time contributions affect rating and XP.
- [x] Show the finalized score and contributions in the post-match report. Preserve the regulation replay session as replay evidence; do not mutate it into a state its command log cannot reproduce. Show simulated extra time as a summary and create Moments only from recorded keyframes.
- [x] Assert that report totals, career records, cumulative player deltas and bonuses agree; repeated commit attempts must be rejected without applying any additional rewards.

**Accept:** the same goal/assist/minute is credited exactly once everywhere; substituted players cannot score in extra time; saving at full time and reloading cannot duplicate rewards.

**Done (2026-10-07):** `finalizeFixture`/`applyFinalizedFixture` decide and store every fixture once; `commitCareerMatch` derives the record, bonuses, fame, objectives and XP from the finalized participant, and the report shows `CareerMatchOutcome.final`. Deviation from the plan: an interactive goal without an assist is not left unassisted; it receives a background assister on the pitch at that minute, never the interactively played player. Treating all of them as unassisted would have removed nearly every assist from the career club's other players. Assisters are fixed once in the outcome but not added to stored results, so the save contract and schema are unchanged. Simulated background seasons are byte-identical to the previous build (legacy and national digests). Covered by `tests/match-accounting.test.ts` (the season invariant failed before the change: 9 cumulative assists against 7 recorded).

### 1.3 Track competition statistics for correct awards

**Create:** `src/engine/world/statistics.ts`, `tests/competition-stats.test.ts`.

**Modify:** `src/model/domain.ts`, `src/engine/world/simulate.ts`, `src/engine/career/honours/awards.ts`, `src/engine/career/social/rival.ts`, `src/screens/career/selectors.ts`, `src/persistence/schema.ts`, `src/persistence/worldValidation.ts`, `src/persistence/honoursValidation.ts`, `src/engine/config.ts`.

- [x] Add tests where the best league scorer differs from the best all-competition scorer; a player moves between leagues; a player leaves a league before awards are selected; and a loan separates two club stints.
- [x] Maintain current-season aggregates keyed by player, competition and club. Derive these from finalized outcomes, including appearances, minutes, goals, assists, clean sheets and rating totals. Do not retain another lifetime copy of every participant event.
- [x] Use league-specific records and participation eligibility for monthly and season league awards, while retaining all-competition criteria for the Golden Ball. A departed player remains eligible for a league award earned there. Keep simulation coverage limited to the existing award scope.
- [x] Label UI totals by scope so league and all-competition numbers are easy to distinguish. Store compact season summaries needed by history, and clear current aggregates on rollover.
- [x] Give new worlds complete accounting immediately. For existing mid-season saves lacking full attribution, retain the prior award mode for that season and activate complete competition accounting at the next rollover. Preserve already-issued awards and disclose the transition in migration notes.
- [x] Validate identities, non-negative finite values, rating bounds and season references. Cover schema migration, export/import and a transfer followed by season rollover.

**Accept:** cup goals never decide a league Golden Boot under the new accounting mode; goals stay with the league/club where they were earned; old saves retain their historical results.

**Done (2026-10-07):** `World.seasonStats` (schema 14) holds one line per competition, club and player, recorded by `applyFinalizedFixture` and cleared at rollover (about 1 MB for a full national season). League awards read their league's lines; the young player award, Golden Ball and season-goals record use all-competition totals. Schema-13 worlds keep the earlier baselines until their next season. Validation bounds every line and checks each club's goals per competition against the results. The hub, profile, rival and trophy screens label their scope. `rival.ts` needed no change: both sides of the comparison already count all club competitions. Play-off ties and second phases are separate competitions and do not count for league awards (recorded in `docs/REALISM.md`). History keeps awards, records and career match records rather than a new per-season copy.

### 1.4 Award earned trophies and compare legacies fairly

**Modify:** `src/engine/career/honours/awards.ts`, `src/engine/career/honours/retirement.ts`, `src/engine/world/simulate.ts`, `src/engine/world/france-portugal.ts`, `src/model/domain.ts`, `src/persistence/honoursValidation.ts`, `src/persistence/nationalWorldSchema.ts`.

**Tests:** extend `tests/honours.test.ts`, `tests/pyramid.test.ts`, `tests/national-save.test.ts`; use the competition-statistics tests for participation.

- [x] Record trophies when the competition resolves, independently of the club at season end. Proposed policy: award the career player a club trophy if they made a competitive appearance for that club in that competition during the winning campaign, including if they later moved.
- [x] Snapshot eligible player IDs with the trophy; prevent duplication when week completion or awards run again. Joining after the victory never grants that trophy.
- [x] Prefer each previous career's saved honour-inclusive Hall of Fame score, and deduplicate retained players, archives and legacies by player ID. Reproduce the reviewed 10,000-versus-1,000 comparison.
- [x] Separate initial-group winners from division champions in Portuguese multi-phase competitions. Resolve the actual champion from the deciding phase/final without changing promotion/relegation rules or rewriting previous archived seasons.
- [x] Cover moving before and after a final, zero-appearance signings, two retired generations, and a Portuguese champion that did not win its first-phase group.

**Accept:** earned trophies survive transfers, late arrivals receive no retroactive title, and all generations use the same ranking criteria.

**Done (2026-10-07):** `engine/world/titles.ts` lists titles as they are decided; `recordCareerTrophies` runs each week after competitions advance and records a trophy once if the career player appeared for the winning club in the campaign (from Phase 1.3 statistics). Worlds without complete statistics keep the season-end rule for that season. `Trophy.playerIds` holds the eligible career player only. A squad snapshot would name people who are later pruned to the archive, which trophy validation does not accept. `Trophy.name` keeps the decided title's name. `SeasonSummary.divisionChampions` archives Portugal's Liga 3 (promotion league) and Campeonato (final) champions; `champions` still holds group table winners, which history labels as first-phase winners. Earlier seasons are untouched. `hallOfFameRank` counts each person once and uses a legacy's saved score. `nationalWorldSchema.ts` accepts trophies naming archived phases and ties, and validates division champions.

### 1.5 Make domain configuration testable

**Modify:** `vite.config.ts`, `e2e/release.spec.ts`, `.github/workflows/ci.yml`, `docs/DEPLOY.md`.

- [x] Obtain the expected canonical URL from build metadata or the served canonical tag and independently assert that all share URLs use it. Avoid simply comparing a tag with itself.
- [x] Run the release journey for both the default URL and a separately built custom-domain URL; the custom build must not deploy or replace the default artifact used by other checks.
- [x] Keep production security-header and real-PNG assertions.

**Accept:** following the documented `SITE_URL` instructions passes release checks.

**Done (2026-10-07):** `site.ts` is the single `SITE_URL` normalizer for Vite and the release journey, so the expected address comes from configuration, not from the served tags. `scripts/release-custom.mjs` (`npm run test:release:custom`) builds `dist-custom` and runs the journey on port 4174 via `PREVIEW_DIR`/`PREVIEW_PORT` in `playwright.config.ts`. CI shares the repository variable `SITE_URL` across jobs, runs a `custom-domain` job before deploy and derives the environment URL from it. The listed `vite.config.ts` change was only to use the shared normalizer.

**Phase gate:** targeted regressions, complete engine/save suites, typecheck, lint, production build, and affected Chromium/Firefox/WebKit journeys pass. Update `docs/ARCHITECTURE.md`, `docs/BALANCING.md`, `docs/MATCH-BALANCING.md` and `docs/VERIFICATION.md` with the new accounting and compatibility rules.

## Phase 2 — Make key moments easy to read and play

**Create:** `src/screens/match/DecisionPanel.tsx`.

**Modify:** `src/screens/Match.tsx`, `src/screens/match/Pitch.tsx`, `src/ui/Tutorial.tsx`, `src/styles/match.css`, `src/styles/responsive.css`, `src/i18n/match.ts`, `src/i18n/tutorial.ts`.

**Tests:** extend `e2e/match.spec.ts`, `e2e/onboarding.spec.ts`, `e2e/accessibility.spec.ts`.

- [x] Extract the current decision UI into a focused panel; retain choices, transparent probabilities, factors and number-key support.
- [x] On desktop, put pitch/situation and choices in adjacent columns with independently bounded commentary. Use focus with `preventScroll` and explicit positioning so automatic focus does not hide the football context.
- [x] On narrow screens, show a compact situation preview with the active decision. Keep action, probability and likely consequence visible; move detailed factors into the existing disclosure. Allow intentional scrolling for long text without trapping touch or keyboard users.
- [x] Make action-step tutorial instructions inline on phones. Preserve desktop guidance, skip/replay behavior and announcements. Prevent tutorial and offline/update notices from covering the selected choice.
- [x] Test mouse, touch, Space, 1–4, arrows, Escape, reduced motion and simulation-only mode. Test 390×844 and 360×640 at normal and 130% font scale, plus a 1366×768 desktop viewport.

**Accept:** a key moment reveals both pitch context and the first action at normal phone sizes; focused actions are never covered by overlays; all choices and explanations remain reachable with large text; commentary and score remain accessible. Capture before/after desktop and phone screenshots.

**Done (2026-10-07):** `DecisionPanel` holds the key moment (choices, chances, consequences, factor disclosure, number keys) and renders once: beside the pitch at the top of the right column from 951 px, after the pitch below it. Opening a moment focuses the first choice with `preventScroll`, then scrolls the pitch and decision (wide) or the decision (phones) to the top. On phones the panel opens with a cropped SVG drawing of the moment (`SvgPitch`, shared with the accessible pitch fallback) and a shorter headline; the score joins the key-moment label. Commentary keeps its own bounded scroll. Action steps of the tour render inline in `data-tour-slot` elements on phones; on wider screens the card avoids the focused element (below, above, then beside the target, low first), scrolls only as needed and at once, and focus within the card never moves it. The update/offline notice waits while a key moment is open. Arrow-key focus reveals the whole choice, clear of the phone tab bar; Escape closes an open breakdown before meaning "back". Deviations: the attribute line ("Uses …") stays visible on phones because AGENTS.md §7 requires the attribute-based quality hint; it fits at 360×640 with large text. Tests live in a new `e2e/decision-layout.spec.ts` rather than extending `match.spec.ts`; `onboarding.spec.ts` and `accessibility.spec.ts` were unchanged (key-moment axe checks are in the new spec).

## Phase 3 — Focus career navigation and the next action

### 3.1 Group navigation while keeping deep links

**Create:** `src/screens/career/navigation.ts`.

**Modify:** `src/ui/Shell.tsx`, `src/screens/career/shared.tsx`, `src/styles/shell.css`, `src/styles/responsive.css`, `src/i18n/en.ts`, `src/i18n/career.ts`.

**Tests:** extend `e2e/foundation.spec.ts`, `e2e/career.spec.ts`, `e2e/accessibility.spec.ts`.

- [x] Use five career groups: Overview, Player, Club, Life and History. On desktop, show grouped destinations in the persistent sidebar and relevant local links within the active group.
- [x] On phones, use Overview, Player, Club, Life and More as the five bottom destinations; More gives History and utilities. Put inbox urgency in Overview and the hub instead of creating a sixth persistent tab.
- [x] Keep every existing route working, including bookmarks, `save` parameters and browser back/forward. Use a URL-backed, keyboard-accessible More dialog so browser back closes it.
- [x] Keep World accessible from Club and More; retain Gallery, Edit, Saves and Settings in utilities. The no-career landing flow keeps straightforward discovery links.

**Done** in the UI/UX pass (see `docs/VERIFICATION.md`, Phase 3.1); tests live in `e2e/navigation.spec.ts` rather than the files listed above.

**Accept:** players can reach every old destination without a long horizontal career-tab search; current-page naming, keyboard focus and unread indicators remain clear.

### 3.2 Prioritize the hub and add a personal agenda

**Create:** `src/screens/career/agenda.ts`, `src/screens/career/CareerCalendar.tsx`, `src/screens/career/HubPriorities.tsx`, `tests/career-agenda.test.ts`.

**Modify:** `src/screens/career/CareerHub.tsx`, `src/screens/career/actions.ts`, `src/App.tsx`, `src/i18n/career.ts`, `src/i18n/en.ts`, `scripts/check-bundle.mjs`, `e2e/accessibility.spec.ts`.

- [ ] Derive a priority queue from existing state: recovery decisions first, playable/resumable fixtures next, expiring negotiations/press actions next, then unspent progression points. Use existing deadlines; label actions with no deadline accurately.
- [ ] Keep the next-action hero, player summary and condition near the top. Reduce inactive sections to compact links or summaries; expand secondary summaries through URL state rather than a new saved preference system.
- [ ] Add `/career/calendar` as a lazy route, combining confirmed fixtures, training, recovery and actionable deadlines. Use season/week/day as the game's date model; do not map 60 abstract weeks to misleading real calendar dates.
- [ ] Show a short preview of the pending advance action and a digest from actual completed world events afterwards. Clarify whether continuing advances one week or runs until the next matchday. Never predict or reveal unrevealed random outcomes.
- [ ] Test priority conflicts, same-week cup/league fixtures, a completed season, an injured player, an expired offer and an empty inbox. Add Calendar to route-budget and accessibility coverage.

**Accept:** the main hub action is visible at 390×844 with normal text; urgent actions take precedence consistently; agenda links restore after refresh; the digest reports what actually happened.

## Phase 4 — Validate long careers and populated performance

### 4.1 Add a multi-generation endurance harness

**Create:** `scripts/soak-career.ts`, `tests/career-invariants.test.ts`.

**Modify:** `package.json`, `.github/workflows/ci.yml`, `docs/VERIFICATION.md`, `docs/BALANCING.md`.

- [ ] Use deterministic seeded national worlds and headless career play. Run one national season as a pull-request smoke check, five seasons in the nightly job, and at least two natural retirements/child careers in a weekly/manual endurance job; do not age players artificially in the long run.
- [ ] Include transfers, a loan, injuries, retirement, the child wizard's domain path, save parsing and export/import checkpoints. Repeat a seed to prove reproducibility; store seed, season and last completed action on failure.
- [ ] Check single fixture commit, non-negative finances, valid references, result/statistics agreement, competition progression, deduplicated trophies and consistent legacy ranking. Protect Chronicle/Moments/legacy references across pruning.
- [ ] Measure compact export size, simulation/checkpoint time and peak memory per season. Require every tested generation's export to import within the configured limit. Investigate growth before changing limits; any compaction must preserve historical people and achievements and ship with migration tests.
- [ ] Keep slow soak work out of ordinary interactive development tests and retain its structured artifacts in CI.

**Accept:** two generations complete reproducibly, load/export/import successfully, and satisfy accounting/reference invariants at every checkpoint.

### 4.2 Gate performance on real play states

**Create:** `scripts/performance-fixtures.ts`, `e2e/performance.spec.ts`, `docs/DEVICE-ACCEPTANCE.md`.

**Modify:** `scripts/audit.mjs`, `package.json`, `.github/workflows/ci.yml`, `playwright.config.ts`, `docs/VERIFICATION.md`.

- [ ] Add deterministic populated national-career and late-career fixtures. Make the audit load the save before measurement using a dedicated local test harness; avoid putting benchmark-only controls in the shipped game.
- [ ] Measure loaded hub, agenda, large inbox, live Pixi pitch, save/checkpoint and season advance. Keep the existing entry-page Lighthouse checks and route JavaScript budgets.
- [ ] Record Lighthouse performance/accessibility, interactive readiness, input-to-next-paint, long tasks, renderer frame pacing and browser memory where available. Run audits without concurrent browser/season jobs.
- [ ] Use release targets from AGENTS.md: desktop Lighthouse >90, mobile >85, accessibility >95, initial JavaScript <300 KB gzip and interactive readiness <3 seconds on the agreed phone/4G profile. Aim for 60 fps on the target laptop and phone; persist the hardware/profile used so comparisons are meaningful.
- [ ] Run the fast route budget on each change, populated audits on a serialized scheduled/release job, and upload results. Fail gates rather than hiding regressions through repeated averaging.
- [ ] Add manual acceptance for Safari macOS/iOS and a mid-range Android browser: IndexedDB storage pressure, install/offline, audio gesture unlock, background/resume, large text, touch decisions and sustained rendering. Manual results require a real device run, not an automated tick.
- [ ] Cover an old build receiving a new service worker while a saved career is active, checkpointing safely, reloading and continuing offline. Reuse the existing update manager; add an actual two-build journey.

**Accept:** representative play states meet recorded budgets; two-build updates preserve careers; physical-device evidence is documented. Address measured bottlenecks within the affected modules before passing the phase.

## Phase 5 — Connect formations, positions and coaching

### 5.1 Share formation-aware selection

**Create:** `src/engine/selection/formations.ts`, `src/engine/selection/lineup.ts`, `tests/selection.test.ts`.

**Modify:** `src/engine/strength.ts`, `src/engine/match/index.ts`, `src/engine/match/motion.ts`, `src/engine/career/market/rules.ts`, `src/engine/world/simulate.ts`, `src/screens/match/Preview.tsx`, `src/screens/career/CareerClub.tsx`, `src/engine/config.ts`, relevant model and persistence validators.

- [ ] Support the four manager formations already generated: 4-3-3, 4-4-2, 4-2-3-1 and 3-5-2. Define ordered slot positions and pitch geometry in one catalogue.
- [ ] Unify positional fit, secondary familiarity, availability, ability and deterministic tie-breaking across background selection, career selection and interactive setup. The interactive selector already considers secondary familiarity; retain that behavior and extend it consistently.
- [ ] Preserve current role/form/trust selection policy while incorporating the formation's actual available slots. An explicitly selected career player can occupy an appropriate slot without silently moving another goalkeeper into an outfield role.
- [ ] Return reason codes and numbers for the selection explanation: role promise, positional fit, competition for the slot, form, fatigue, registration and trust. Display them in briefing and Club life without exposing hidden attributes.
- [ ] Make match-motion shapes follow the selected formation. Verify highlights and replay setup use the same slot ordering.
- [ ] Version the selection model. New worlds use it immediately; existing worlds adopt it at a documented season boundary, preserving in-progress sessions and saved national profiles.
- [ ] Test eleven unique starters, one keeper, injury/retirement exclusion, deterministic ties, familiarity improvements, all four formations, replay/save compatibility and the existing 10,000-match statistical calibration.

**Accept:** the displayed formation matches selection and pitch shape; learning a suitable secondary position has a measurable effect; selection explanations match the actual calculation.

### 5.2 Turn performance into coaching and development goals

**Create:** `src/engine/career/coaching.ts`, `src/screens/career/CoachAdvice.tsx`, `src/i18n/coaching.ts`, `tests/coaching.test.ts`.

**Modify:** `src/screens/match/Report.tsx`, `src/screens/career/CareerTraining.tsx`, `src/screens/career/CareerHub.tsx`, `src/engine/config.ts`, relevant career model and save validators.

- [ ] Generate up to two recommendations from recent finalized decisions, the player's position, trainable attributes and condition. Use recovery as the priority while injured or heavily fatigued; never recommend keeper-inappropriate or capped attributes.
- [ ] Explain the evidence in plain copy, such as unsuccessful passes or poor defensive decisions. When there is insufficient data, offer a neutral position-based plan and say what it is based on; never imply certainty from one failed roll.
- [ ] Link advice to a prefilled training draft. Applying it requires the existing save action and preserves the previous plan until then; block changes during active matches and simulation.
- [ ] Offer one explicit season development goal with a measurable target and visible progress. Start with role-appropriate appearances, passing, defensive contributions or attribute development, using finalized records and configured values.
- [ ] Store accepted goals and their season/version; derive temporary advice. Cover deterministic recommendations, keeper/outfield suitability, capped attributes, insufficient data, fatigue, injury, rejection, completion and migration.

**Accept:** feedback produces a useful, safe training choice; players can understand why it was recommended; accepted goals survive saves and never change silently.

**Phase gate:** rerun selection, coaching, engine, migration, worker and statistical tests; affected browser journeys; route budgets and populated live-match measurements.

## Phase 6 — One sustained manager development promise

**Create:** `src/engine/career/stories/promise.ts`, `src/i18n/stories.ts`, `tests/stories.test.ts`.

**Modify:** `src/engine/career/social/week.ts`, `src/engine/career/honours/chronicle.ts`, `src/engine/career/market/records.ts`, `src/screens/career/CareerClub.tsx`, `src/screens/career/CareerHub.tsx`, `src/model/domain.ts`, `src/persistence/schema.ts`, `src/persistence/socialValidation.ts`, `src/engine/config.ts`.

- [ ] Build one arc around the accepted development goal: the manager proposes a quantified six-week milestone toward that goal, the player accepts or declines, weekly progress updates, and the outcome follows actual progress. Offer it only when at least six weeks remain in the season; use a trainable attribute milestone if the fixture schedule cannot support an appearance/performance milestone.
- [ ] Persist a finite state machine with offered, active, achieved, missed and cancelled states; only one active promise is allowed. Offer and outcome events use stable IDs so loading/retrying cannot duplicate rewards or Chronicle entries.
- [ ] Cancel without punishment if transfer, manager replacement, retirement or injury makes the promise unavailable. Reuse configured manager-trust/morale rewards; do not introduce a new currency or routine daily obligation.
- [ ] Surface the promise in Club life, urgent hub actions and inbox. Record one meaningful Chronicle conclusion. Keep rival and comeback arcs as later extensions after this first arc is playtested.
- [ ] Test every transition, save/load in the middle, duplicate processing, injury/transfer cancellation, deterministic outcomes and a browser journey from acceptance to conclusion.

**Accept:** one coherent story spans several weeks, responds to real football events and leaves a lasting record without becoming repetitive busywork.

## Verification commands and handoff

During implementation, run the focused tests for the task first. Example commands use the existing package scripts; Windows may require the `.cmd` shims.

```powershell
# Phase 1 examples, after the planned regression files exist
npm.cmd test -- tests/store-session.test.ts tests/match-accounting.test.ts tests/competition-stats.test.ts
npm.cmd test -- tests/honours.test.ts tests/pyramid.test.ts tests/national-save.test.ts tests/saves.test.ts

# Phase 2 and 3 browser regressions, against a fresh production build
npm.cmd run build
npm.cmd run test:e2e -- e2e/match.spec.ts e2e/onboarding.spec.ts e2e/career.spec.ts e2e/honours.spec.ts e2e/accessibility.spec.ts

# Phase 5 examples, after selection and coaching tests exist
npm.cmd test -- tests/selection.test.ts tests/coaching.test.ts tests/strength.test.ts tests/match-engine.test.ts tests/match-persistence.test.ts

# Phase/release gate
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run format:check
npm.cmd test
npm.cmd run build
npm.cmd run test:e2e

# Run performance separately, after all other workloads finish
npm.cmd run audit
```

Expected results: zero type/lint/format errors; all tests pass with only explicitly documented existing skips; every route stays below its bundle budget; audited states meet their stated thresholds. New soak and populated-performance commands are added with their harnesses in Phase 4, with reproducible seeds and retained output.

For each phase, report completed tasks, observable behavior, commands and results, migrations/compatibility effects, screenshots where relevant, and remaining acceptance gaps. The prior review's 258 unit tests, 104 browser passes and Lighthouse figures are a historical baseline, not acceptance evidence for future changes.

**Recommended first implementation batch:** Task 1.1 only. It fixes two player-visible workflows with limited engine risk and provides a small reviewable starting point. Follow with 1.2 before competition-statistics and honours changes.
