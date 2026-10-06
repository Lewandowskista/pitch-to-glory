# Pitch to Glory: implementation handoff

Prepared on **6 October 2026** and updated the same day after the post-milestone-3 hardening pass, for continuing development in Claude Code or another coding agent. This document indexes every implementation document and records the state at handoff. It is a navigation and continuity aid; [AGENTS.md](../AGENTS.md) remains the complete product specification and source of truth.

## Start here

1. Read [AGENTS.md](../AGENTS.md) in full before changing anything.
2. Read this handoff, then [README.md](../README.md), [DECISIONS.md](DECISIONS.md) and [ARCHITECTURE.md](ARCHITECTURE.md).
3. Read [REALISM.md](REALISM.md) before touching world generation, league sizes, schedules or sporting movement.
4. Read the **Milestone 9 verification** section of [VERIFICATION.md](VERIFICATION.md), [MILESTONE-9.md](MILESTONE-9.md), [MILESTONE-8.md](MILESTONE-8.md), [MILESTONE-7.md](MILESTONE-7.md), [MILESTONE-6.md](MILESTONE-6.md), [MILESTONE-5.md](MILESTONE-5.md) and [MILESTONE-4.md](MILESTONE-4.md), and the later sections of [DECISIONS.md](DECISIONS.md) (hardening, milestone 4, real identities, milestones 5–9). Earlier verification sections are historical.
5. Inspect `git status`, the latest commits and the actual implementation. Documented test results are a recorded baseline, not proof that a later checkout still passes.
6. Follow the user's current requested scope. The next product milestone is **Milestone 10**, but this handoff itself does not authorize starting it. Work one milestone at a time and stop with a summary before advancing.

## Complete document index

Paths below are relative to this document. All documents under `docs/` at handoff are listed, together with the root product spec, README and asset provenance.

| Document                                 | Purpose and when to read it                                                                                                                                                       | Status at handoff                                                                                                                                                                          |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [AGENTS.md](../AGENTS.md)                | Full product specification: mandatory stack, art direction, browser requirements, simulation systems, quality bar and milestones.                                                 | Authority for requirements; supplied by the user, not an implementation substitute.                                                                                                        |
| [README.md](../README.md)                | Installation, development commands, implemented screen usage, save behavior, hosting/CI setup and next milestone.                                                                 | Updated through milestone 9.                                                                                                                                                               |
| [ASSETS.md](../ASSETS.md)                | Original SVG provenance, self-hosted font licenses, audio scope and installation-icon limitations.                                                                                | Current provenance; audio remains a later milestone.                                                                                                                                       |
| [ARCHITECTURE.md](ARCHITECTURE.md)       | Folder boundaries, full TypeScript domain model, engine/store/UI/worker interactions, platform adapter, persistence and interactive match session contracts.                      | Updated through milestone 9; domain types synced with `src/model/domain.ts`; compare with `src/engine/match/types.ts` too.                                                                 |
| [DECISIONS.md](DECISIONS.md)             | Ambiguities, adaptations and implementation choices: legacy compatibility, national profiles, worker transport/persistence, PWA update safety and friendly match scope.           | Append-only decision history; later national/match sections supersede earlier compact-world assumptions.                                                                                   |
| [PLAN.md](PLAN.md)                       | Completed milestone-1 implementation checklist for the foundation, SVG assets, shell and saves.                                                                                   | Historical completed plan.                                                                                                                                                                 |
| [MILESTONE-2.md](MILESTONE-2.md)         | Original world-engine design, worker checkpoint flow, UI/save integration and completed implementation checklist.                                                                 | Historical compact-world plan; uniform eight-club rules and older schema/limits are preserved for legacy worlds, not new generation.                                                       |
| [REALISM-PLAN.md](REALISM-PLAN.md)       | Completed plan for replacing new-world generation with national counterpart structures while retaining legacy saves.                                                              | Historical revision plan; statements about awaiting naming input or having no Git repo describe the time it was written.                                                                   |
| [REALISM.md](REALISM.md)                 | Named counterpart seasons, national tiers/group sizes, match counts, promotion/relegation/playoffs, official source links, naming and deliberate cup/calendar/feeder adaptations. | Current national-v1 sporting reference. Its schema-v4 and future-interactive-match statements describe the milestone-2 revision; current saves are v5 and the match viewer is implemented. |
| [BALANCING.md](BALANCING.md)             | RNG, procedural ageing, foundation/save constants, shared background simulation formulas, preserved legacy rules, national calendar and transport tuning.                         | Updated with national and interactive-match references; some introductory milestone/schema wording is historical.                                                                          |
| [MILESTONE-3.md](MILESTONE-3.md)         | Match design/scope, deterministic command sessions, renderer/UI requirements, persistence and completed implementation checklist.                                                 | Implemented; its “No Git repository exists” sentence predates repository initialization.                                                                                                   |
| [MILESTONE-4.md](MILESTONE-4.md)         | Career player design: creation, XP, soft caps, training, skills, injuries, ageing and the single commit path.                                                                     | Implemented.                                                                                                                                                                               |
| [MILESTONE-5.md](MILESTONE-5.md)         | Career market design: contracts, selection by role promise, scouting, windows, negotiation, loans, agents, inbox and known limits.                                                | Implemented; formulas in BALANCING.md.                                                                                                                                                     |
| [MILESTONE-6.md](MILESTONE-6.md)         | Social design: morale and form, dressing room, teammates, culture fit, rival, media, and known limits.                                                                            | Implemented; formulas in BALANCING.md.                                                                                                                                                     |
| [MILESTONE-7.md](MILESTONE-7.md)         | Lifestyle design: fame levels, sponsorships, lifestyle items, wardrobe, celebrations, challenges, and known limits.                                                               | Implemented; formulas in BALANCING.md.                                                                                                                                                     |
| [MILESTONE-8.md](MILESTONE-8.md)         | Honours design: continental cups, national team, awards, retirement, legacy, Chronicle, Moments, and known limits.                                                                | Implemented; formulas in BALANCING.md.                                                                                                                                                     |
| [MILESTONE-9.md](MILESTONE-9.md)         | Edit mode, colour-blind kit clash check, tutorial, procedural audio, accessibility sweep and known limits.                                                                        | Implemented; formulas in BALANCING.md.                                                                                                                                                     |
| [MATCH-BALANCING.md](MATCH-BALANCING.md) | Interactive scoring/probability/fatigue/report formulas and exact 10,000-match calibration results and cohort limits.                                                             | Current friendly-engine calibration.                                                                                                                                                       |
| [VERIFICATION.md](VERIFICATION.md)       | Required checks, browser flows, performance/storage measurements, screenshot locations and unresolved release/device checks.                                                      | Milestone-2 history followed by the current milestone-3 evidence.                                                                                                                          |
| [HANDOFF.md](HANDOFF.md)                 | This document: reading order, full index, current state, integration risks and a reusable continuation prompt.                                                                    | Handoff snapshot; update it when implementation or verification changes.                                                                                                                   |

When a historical plan differs from the current state, use AGENTS.md for requirements and the later recorded decisions/current code for what is implemented. Record any newly discovered discrepancy rather than silently changing a saved world's rules.

## Implemented state

**Milestones 1–9 are implemented (with the post-milestone-3 hardening pass and the real-identity rework); milestone 10 has not started.** Release acceptance still has the explicit gaps listed below.

- Foundation: Vite, React 18, strict TypeScript, route splitting, Zustand slices, Tailwind/design tokens, Framer Motion, Dexie, Vitest, Playwright, lint/format tooling, PWA/update handling, web platform adapter and CI/static-host configuration.
- Art and shell: seeded SVG crests, home/away/third kits and ageing avatars; asset gallery; title/menu, settings and three save slots; responsive sidebar/bottom navigation; light/dark themes, font scaling and reduced motion.
- World: new generation uses the six real countries with fictional, referenced clubs and competitions (identity version 2), **52 league groups, 959 initial clubs, 21,098 initial players and seven domestic cups**. Counters can change over subsequent seasons. Weekly/full-season simulation, competitions, regional groups, playoffs, squads, history and rollover run through the worker architecture.
- Matches: pre-match teams/footballer/tactics, keeper and outfield moments, transparent probabilities, lazy PixiJS pitch with SVG fallback, commentary, live statistics, speed/skip controls, keyboard support, visibility pause, half-time/captain/substitution responses and rating/objective/heat/pass/shot reports. Simulation-only mode avoids constructing the renderer.
- Persistence: three slots, export/import (compact JSON), revision/ownership checks, tab locks, migration, weekly/match autosave and saved-session restoration. Current file schema is **13** and the IndexedDB layout is **v6**: each slot is split into a metadata record, the world graph and the match session. Existing v1–v12 saves migrate without replacing world identities or sporting rules.
- Hardening pass, after milestone 3:
  - A save survives code changes. A stale match session is discarded and the world kept; country profiles are frozen by rule fingerprint and version.
  - Each slot is listed and loaded independently.
  - Match checkpoints no longer rewrite the world.
  - Bounded world lifecycle: retirement curve, contract renewal and release, free-agent signings, dormant-club reuse, and a retiree archive with event pruning.
  - About 5× faster weekly simulation.
  - Situation-based key moments with no dominant choice, and one shared strength model for interactive and background matches.
  - Expanded name pools and distinct, visible crests.
  - CI hardening.
  - Tailwind hybrid styling rule.

Implemented routes are `/`, `/gallery`, `/saves`, `/settings`, `/world`, `/edit`, `/match`, `/career`, `/career/new`, `/career/profile`, `/career/skills`, `/career/training`, `/career/transfers`, `/career/agent`, `/career/inbox`, `/career/club`, `/career/media`, `/career/rival`, `/career/lifestyle`, `/career/wardrobe`, `/career/national`, `/career/trophies`, `/career/chronicle`, `/career/moments`, `/career/legacy` and the public `/moment` replay. No future screen placeholders should be added.

### User-confirmed realism requirement

The user requested real-life-inspired nations, league sizes, promotion rules and naming, and explicitly chose **every regional group and playoff in the first four real tiers, with deeper tiers for semi-professional starts**. Do not replace this with a uniform small league model.

New worlds use the real country names. Worlds generated before identity version 2 keep these fictional names:

| Fictional country | Real counterpart |
| ----------------- | ---------------- |
| Aldoria           | England          |
| Valmere           | France           |
| Solara            | Spain            |
| Nordhaven         | Germany          |
| Belloria          | Italy            |
| Kestrelia         | Portugal         |

England extends through tier six, including National League North/South. Reference profiles generally use 2026/27, with explicitly documented older published regulations where applicable. Before milestone 5, the user chose **real countries and towns, with fictional clubs and competitions that clearly reference their real counterparts**: professional tiers map one to one (302 clubs), names are city + nickname, competitions are descriptive parodies, and older saves keep their fictional names. See REALISM.md "Identities" and `src/engine/world/identities/`. These are frozen saved profiles, not rules to update automatically each real-world season. Read REALISM.md for exact rules and adaptations; this handoff does not replace its source research.

## Important implementation boundaries

- `src/engine/` stays pure, framework-free and deterministic. All sporting randomness uses `src/engine/rng.ts`; browser time/render speed must never alter outcomes.
- `src/model/domain.ts` holds the shared entity contracts. `src/engine/config.ts` holds tuning; match tuning aliases `CONFIG.match`.
- `src/engine/world/` owns generation, calendar, ranking, background results, postseason and movement. Country profiles/rule modules own national competition behavior.
- `src/workers/` owns simulation orchestration, checkpoint acknowledgements, bounded graph transport and the persistent persistence worker. Keep validation/IndexedDB/JSON work out of the main-thread season path.
- `src/persistence/` owns schema validation/migrations, atomic slot/revision/lease handling, session restoration and worker-backed writes. Untrusted match imports must replay exactly; never trust a supplied score/report without validation.
- `src/store/` connects UI state to committed world/match snapshots. `src/hooks/useAutosave.ts` drives autosave, including forced full-time saves and compact match checkpoints.
- `src/screens/Match.tsx` and `src/screens/match/` own match presentation. `pitchScene.ts` owns PixiJS rendering; it draws/interpolates engine state without deciding outcomes.
- `src/platform/` owns browser-specific save/share/storage and other platform capabilities. Do not install Capacitor before milestone 11.
- All UI copy belongs in `src/i18n/`; styling uses the shared tokens and existing flat vector direction. No external image downloads or hotlinks.

### Career player (milestone 4)

- `World.career` holds the career; the player is a normal squad member.
- The career player's fixtures are played on Matchday (or auto-played during season simulation) and committed once by the world worker through `commitPlayedFixture`, the same resolver path as background games. `simulateWeek` refuses a week with an unplayed career fixture.
- Worlds without a career keep the friendly flow.
- Skills are trait ids read by the match engine (`TRAIT_BOOSTS`, `requiredTraitId`).
- Development version 2 places AI players on age curves, which fixed the ability drift. Older worlds are recalibrated once.
- The AI lifecycle excludes the career player.
- Milestone 5 added the career market in `src/engine/career/market/` (see MILESTONE-5.md and ARCHITECTURE.md):
  - contracts with role promises and clauses;
  - selection by the role promise;
  - scouting interest, window bids, and negotiation with deterministic counter-offers;
  - loans, renewals, pre-contracts and the club option;
  - agents, pay days and the inbox.
- UI market actions go through `applyMarketAction`, which uses structural sharing; the weekly step (`marketWeek`) and rollover (`marketRollover`) mutate the worker's world.
- Manager trust and fan affection per club are `Relationship` records with kind `manager` and `fans`. Milestone 6 should extend these records (teammates, media, performance), not replace them; trust already feeds selection.
- AI clubs still use like-for-like exchanges; only the career player has the full market.
- Milestone 6 added `src/engine/career/social/` (see MILESTONE-6.md):
  - morale with an explained weekly target, and a "Morale" key-moment factor (`match-6`);
  - cliques and key-teammate chemistry for the player's club;
  - culture fit;
  - a protected rival chosen from existing players;
  - press, social feed and headlines.
- Fame now changes through media too.
- Milestone 7 added `src/engine/career/lifestyle/` (see MILESTONE-7.md):
  - fame levels on `career.fame`;
  - sponsorships with obligations;
  - cars, homes and investments, with a lifestyle morale part;
  - the wardrobe and cosmetic unlocks;
  - celebrations, drawn by the match screen with fame added on the commit path;
  - real-calendar challenges paying cosmetic-only style tokens.
- Milestone 8 added `src/engine/career/honours/` and `src/engine/world/continental.ts` (see MILESTONE-8.md):
  - continental cups (Champions Cup and Shield) in national worlds only;
  - national squads, simulated internationals and biennial tournaments;
  - monthly, season and Golden Ball awards, with the rival in the Golden Ball pool and records;
  - retirement into a legacy with a Hall of Fame rank; new careers and child careers in the same world; former teammates as managers;
  - the Chronicle (with PNG export) and Moments (with self-contained replay links).
- Milestone 9 added edit mode (`src/engine/world/edits.ts`, `World.edits`), the colour-blind kit clash check (`src/engine/assets/clash.ts`), procedural audio (`src/audio/`, Howler loaded after the first gesture), the tutorial (`src/ui/Tutorial.tsx`, completion in device settings) and the shared `Tooltip` (see MILESTONE-9.md). Interface sounds are delegated in the shell; new controls get them automatically.
- `e2e/accessibility.spec.ts` checks every route with axe in both themes, at phone width and by keyboard. Add new routes to its list. Other specs call `skipTutorial` from `e2e/support.ts`.
- `world.career` can now be absent in a world with legacies. Career pages show the legacy and ways to continue; the Legacy page works without a career.
- Bump `MATCH_ENGINE_VERSION` (currently `match-6`) whenever match logic changes. File schema is 13.

### Legacy saves and storage

Missing world `format` identifies the preserved compact world: 24 eight-club leagues, 192 initial clubs, 4,224 initial players, quadruple round robin and 34 weeks. New worlds use `national-v1`, home/away schedules and **60 abstract game weeks**. Never regenerate legacy worlds during migration.

The national calendar changes yearly finance/development/recovery totals relative to the compact calendar; later career balancing must account for that.

Ability drift is fixed by development version 2: tier means now stay within about 3 points over many seasons (see BALANCING.md).

Detailed current fixtures and results are replaced on rollover. Retired players move to the compact `World.archive`, and events older than the previous season are pruned. Over ten seasons a world holds at 59–67 MiB of compact JSON, against the **128 MiB** import limit, growing about 1.3 MiB per season (mostly archive records). The career player is excluded from the lifecycle's release, retirement and trimming. Legacy players and their children are never pruned (`keptPlayerIds`).

## Verification baseline and remaining gaps

Recorded on 7 October 2026 after milestone 9; see VERIFICATION.md for full evidence:

| Check                                            | Recorded result                                                                                                        |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Typecheck, lint, formatting and production build | Passed                                                                                                                 |
| Vitest                                           | 245 tests across 30 files passed                                                                                       |
| Playwright full suite                            | 92 passed, 1 skipped (WebKit keyboard order); an axe sweep of all 26 routes in both themes                             |
| 10,000-match benchmark                           | 2.744 goals per match; home advantage; away upsets 26.2% at a 15-point and 17.7% at a 45-point gap                     |
| Initial-route JavaScript                         | 215.3–270.1 KB gzip; all twenty-six routes below 300 KB; PixiJS and audio deferred                                     |
| Lighthouse (milestone 4 run)                     | Mobile performance 88–93, desktop 100, accessibility 100 on all nine configurations; cold mobile interactive 2.9–3.4 s |
| Simulated national week (Node)                   | About 80–100 ms; a fully auto-played national career season is 16.5 s (274 ms median week)                             |

Remaining checks and scope limits:

- Some cold mobile entry screens take **3.1–3.2 seconds**, exceeding the strict under-three-second interactive target even though score thresholds pass.
- Physical mid-range laptop/phone 60fps certification and macOS/iOS Safari IndexedDB, offline and installation checks have not been completed.
- Windows Playwright WebKit has an offline module-navigation driver limitation. Its offline tests verify actual cached responses; Chromium and Firefox exercise offline navigation/world simulation. Do not describe that as physical Safari certification.
- Styling rule (AGENTS.md, updated with the user): new UI uses Tailwind utilities with the shared tokens (`bg-surface`, `text-muted`, `shadow-surface`, …). Screens built before milestone 4 keep their component CSS partials in `src/styles/` until a later milestone reworks them.
- Known audit items not addressed in the hardening pass:
  - finances clamp balances at zero, and transfer budgets only ever fall;
  - the social preview image is SVG with a relative URL;
  - some engine-built display names are not localized;
  - avatars have no "no accessory" or bald options;
  - large screen components (World, Match).
- Fixed in milestone 9: touch long-press tooltips and the engine lint scope (browser globals are now forbidden in `src/engine/`).
- No site has been deployed; CI has not run remotely. Release features (milestone 10) and the Android port (milestone 11) retain their milestone scope.
- `artifacts/` contains local screenshots, Lighthouse reports and generated test saves, but is Git-ignored. A new checkout may not have those files; regenerate evidence with the scripts rather than assuming it travelled with the source.

## Run and verify

Node **22.19+** is required; Node 24 was used for verification. Start from the repository root:

```sh
npm ci
npm run dev
```

Vite normally serves `http://127.0.0.1:5173`. Generate/load a world and open Matchday to review the implemented match experience. Save the world to a slot before closing if you want refresh restoration.

```sh
npm run typecheck
npm run lint
npm run format:check
npm test
npm run build
npx playwright install chromium firefox webkit
npm run test:e2e
npm run audit
```

On this Windows PowerShell installation, use `npm.cmd`/`npx.cmd` if script shims are blocked. Browser tests start a production preview on **4173**; Lighthouse uses **4180**. Build before browser tests, avoid unrelated servers occupying those ports, and run Lighthouse after browser/season workloads finish. The full browser suite includes large real national-world saves and takes several minutes. PWA registration is production-only; offline review requires one connected visit using `npm run preview`.

Optional inspection scripts are `scripts/capture.mjs` (screen captures) and `scripts/inspect-pwa.mjs` (Chrome installability). `scripts/check-bundle.mjs` runs with the build and must keep covering every initial route.

## Git and delivery state

- Repository root on the original machine: `C:\Users\Stefan\Game Mod`.
- Git was initialized after milestones 1–3. Branch: **main**. Initial implementation commit: **`d1c1be7` — Build Pitch to Glory through milestone 3**. The hardening pass is commit **`2f71752`**, milestone 4 is **`dfc06a0`** and the real-identity rework is **`d1b8358`**. Milestone 5 is **`c14601f`**, milestone 6 is **`5fe762b`** and milestone 7 is **`56eab5f`** and milestone 8 is **`1e55fd3`**; milestone 9 follows. Check `git log` for later commits.
- No remote or hosting deployment is configured at this snapshot. Do not infer that the local commit exists on GitHub. The new handoff document is subsequent work; inspect `git status` and newer commits when continuing.
- `.gitignore` excludes dependencies, builds, local test reports/artifacts, logs and environment files. Never stage generated large backup fixtures or credentials.
- `netlify.toml` supplies the static-host configuration. `.github/workflows/ci.yml` contains checks and optional deployment; publishing requires the configured Netlify production secrets and explicit deployment scope.

Historical plans stating that there is no repository are time-specific records. This Git section supersedes those statements.

## Next milestone and continuation prompt

The next milestone is **10: the web release**. It should:

- finish the deployment pipeline (CI typecheck, lint, tests and deploy to the configured static host);
- polish the PWA and offline behaviour and the "Update available" prompt;
- audit performance and bundles against the 300 KB and Lighthouse targets, including the cold mobile time to interactive (some screens measured 3.1–3.2 s);
- run the cross-browser pass, including real Safari checks for IndexedDB, workers and audio;
- make the title screen a landing page with Open Graph and Twitter card tags (the share image must become an absolute URL).

Do not begin the Android port (milestone 11) at the same time.

```text
You are continuing Pitch to Glory in this repository.

Read AGENTS.md in full before doing anything, then read docs/HANDOFF.md
and follow its reading order. AGENTS.md is the product source of truth.
Inspect git status and the current code before modifying files.

Milestones 1–9 are implemented. Implement Milestone 10 only, following
the mandatory stack, SVG art direction, accessibility, save compatibility
and quality requirements. New UI uses Tailwind utilities with the shared
tokens. Do not start Milestone 11 or install Capacitor.

Preserve the source-documented national pyramids and legacy world rules.
Current saves are schema 13; bump MATCH_ENGINE_VERSION when match logic
changes. Keep the single career commit path (commitPlayedFixture), the
pure engine (no browser globals or imports), audio loading only after the
first user gesture, and the accessibility sweep passing for every route.

Make reasonable decisions for ambiguities, record them in docs/DECISIONS.md,
and continue. Update architecture, balancing, verification, README and the
handoff as appropriate. Run typecheck, lint, formatting, unit tests, build
and critical flows in Chromium, Firefox and WebKit before finishing.
Report measured limitations candidly and stop with a Milestone 10 summary.
```
