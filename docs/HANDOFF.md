# Pitch to Glory: implementation handoff

Prepared on **6 October 2026** and updated the same day after the post-milestone-3 hardening pass, for continuing development in Claude Code or another coding agent. This document indexes every implementation document and records the state at handoff. It is a navigation and continuity aid; [AGENTS.md](../AGENTS.md) remains the complete product specification and source of truth.

## Start here

1. Read [AGENTS.md](../AGENTS.md) in full before changing anything.
2. Read this handoff, then [README.md](../README.md), [DECISIONS.md](DECISIONS.md) and [ARCHITECTURE.md](ARCHITECTURE.md).
3. Read [REALISM.md](REALISM.md) before touching world generation, league sizes, schedules or sporting movement.
4. Read the **Hardening pass verification** section of [VERIFICATION.md](VERIFICATION.md) and the hardening sections at the end of [DECISIONS.md](DECISIONS.md). Earlier verification sections are historical.
5. Inspect `git status`, the latest commits and the actual implementation. Documented test results are a recorded baseline, not proof that a later checkout still passes.
6. Follow the user's current requested scope. The next product milestone is **Milestone 4**, but this handoff itself does not authorize starting it. Work one milestone at a time and stop with a summary before advancing.

## Complete document index

Paths below are relative to this document. All documents under `docs/` at handoff are listed, together with the root product spec, README and asset provenance.

| Document                                 | Purpose and when to read it                                                                                                                                                       | Status at handoff                                                                                                                                                                          |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [AGENTS.md](../AGENTS.md)                | Full product specification: mandatory stack, art direction, browser requirements, simulation systems, quality bar and milestones.                                                 | Authority for requirements; supplied by the user, not an implementation substitute.                                                                                                        |
| [README.md](../README.md)                | Installation, development commands, implemented screen usage, save behavior, hosting/CI setup and next milestone.                                                                 | Updated through milestones 1–3.                                                                                                                                                            |
| [ASSETS.md](../ASSETS.md)                | Original SVG provenance, self-hosted font licenses, audio scope and installation-icon limitations.                                                                                | Current provenance; audio remains a later milestone.                                                                                                                                       |
| [ARCHITECTURE.md](ARCHITECTURE.md)       | Folder boundaries, full TypeScript domain model, engine/store/UI/worker interactions, platform adapter, persistence and interactive match session contracts.                      | Updated through milestone 3; compare types with `src/model/domain.ts` and `src/engine/match/types.ts` when editing.                                                                        |
| [DECISIONS.md](DECISIONS.md)             | Ambiguities, adaptations and implementation choices: legacy compatibility, national profiles, worker transport/persistence, PWA update safety and friendly match scope.           | Append-only decision history; later national/match sections supersede earlier compact-world assumptions.                                                                                   |
| [PLAN.md](PLAN.md)                       | Completed milestone-1 implementation checklist for the foundation, SVG assets, shell and saves.                                                                                   | Historical completed plan.                                                                                                                                                                 |
| [MILESTONE-2.md](MILESTONE-2.md)         | Original world-engine design, worker checkpoint flow, UI/save integration and completed implementation checklist.                                                                 | Historical compact-world plan; uniform eight-club rules and older schema/limits are preserved for legacy worlds, not new generation.                                                       |
| [REALISM-PLAN.md](REALISM-PLAN.md)       | Completed plan for replacing new-world generation with national counterpart structures while retaining legacy saves.                                                              | Historical revision plan; statements about awaiting naming input or having no Git repo describe the time it was written.                                                                   |
| [REALISM.md](REALISM.md)                 | Named counterpart seasons, national tiers/group sizes, match counts, promotion/relegation/playoffs, official source links, naming and deliberate cup/calendar/feeder adaptations. | Current national-v1 sporting reference. Its schema-v4 and future-interactive-match statements describe the milestone-2 revision; current saves are v5 and the match viewer is implemented. |
| [BALANCING.md](BALANCING.md)             | RNG, procedural ageing, foundation/save constants, shared background simulation formulas, preserved legacy rules, national calendar and transport tuning.                         | Updated with national and interactive-match references; some introductory milestone/schema wording is historical.                                                                          |
| [MILESTONE-3.md](MILESTONE-3.md)         | Match design/scope, deterministic command sessions, renderer/UI requirements, persistence and completed implementation checklist.                                                 | Implemented; its “No Git repository exists” sentence predates repository initialization.                                                                                                   |
| [MATCH-BALANCING.md](MATCH-BALANCING.md) | Interactive scoring/probability/fatigue/report formulas and exact 10,000-match calibration results and cohort limits.                                                             | Current friendly-engine calibration.                                                                                                                                                       |
| [VERIFICATION.md](VERIFICATION.md)       | Required checks, browser flows, performance/storage measurements, screenshot locations and unresolved release/device checks.                                                      | Milestone-2 history followed by the current milestone-3 evidence.                                                                                                                          |
| [HANDOFF.md](HANDOFF.md)                 | This document: reading order, full index, current state, integration risks and a reusable continuation prompt.                                                                    | Handoff snapshot; update it when implementation or verification changes.                                                                                                                   |

When a historical plan differs from the current state, use AGENTS.md for requirements and the later recorded decisions/current code for what is implemented. Record any newly discovered discrepancy rather than silently changing a saved world's rules.

## Implemented state

**Milestones 1–3 are implemented and hardened; milestone 4 has not started.** Release acceptance still has the explicit gaps listed below.

- Foundation: Vite, React 18, strict TypeScript, route splitting, Zustand slices, Tailwind/design tokens, Framer Motion, Dexie, Vitest, Playwright, lint/format tooling, PWA/update handling, web platform adapter and CI/static-host configuration.
- Art and shell: seeded SVG crests, home/away/third kits and ageing avatars; asset gallery; title/menu, settings and three save slots; responsive sidebar/bottom navigation; light/dark themes, font scaling and reduced motion.
- World: new generation uses six fictional national counterparts, **52 league groups, 959 initial clubs, 21,098 initial players and seven domestic cups**. Counters can change over subsequent seasons. Weekly/full-season simulation, competitions, regional groups, playoffs, squads, history and rollover run through the worker architecture.
- Matches: pre-match teams/footballer/tactics, keeper and outfield moments, transparent probabilities, lazy PixiJS pitch with SVG fallback, commentary, live statistics, speed/skip controls, keyboard support, visibility pause, half-time/captain/substitution responses and rating/objective/heat/pass/shot reports. Simulation-only mode avoids constructing the renderer.
- Persistence: three slots, export/import (compact JSON), revision/ownership checks, tab locks, migration, weekly/match autosave and saved-session restoration. Current file schema is **6** and the IndexedDB layout is **v6**: each slot is split into a metadata record, the world graph and the match session. Existing v1–v5 saves migrate without replacing world identities or sporting rules.
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

Implemented routes are `/`, `/gallery`, `/saves`, `/settings`, `/world` and `/match`. No future screen placeholders should be added.

### User-confirmed realism requirement

The user requested real-life-inspired nations, league sizes, promotion rules and naming, and explicitly chose **every regional group and playoff in the first four real tiers, with deeper tiers for semi-professional starts**. Do not replace this with a uniform small league model.

| Fictional country | Real counterpart |
| ----------------- | ---------------- |
| Aldoria           | England          |
| Valmere           | France           |
| Solara            | Spain            |
| Nordhaven         | Germany          |
| Belloria          | Italy            |
| Kestrelia         | Portugal         |

England extends through tier six, including National League North/South. Reference profiles generally use 2026/27, with explicitly documented older published regulations where applicable. Fictional identities remain the default. These are frozen saved profiles, not rules to update automatically each real-world season. Read REALISM.md for exact rules and adaptations; this handoff does not replace its source research.

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

### Friendly matches and milestone-4 integration

There is no career-creation wizard or career progression yet. Matchday currently lets the user select an available footballer from a saved world and play a **90-minute friendly**. Its expected goals come from `src/engine/strength.ts`, the same model the background resolver uses, so a fixture played interactively and one simulated in the background have matching expectations. Key moments come from the situation catalogue in `src/engine/match/situations.ts`; choices already carry `traitId`/`requiredTraitId` hooks for milestone 4's skill tree. Match sessions carry `engine: 'match-4'`; bump `MATCH_ENGINE_VERSION` whenever sporting logic changes, so older sessions are discarded rather than mis-replayed. XP and fame are calculated but not granted; league standings/results and player progression remain unchanged. Draws are valid.

The background world resolver and interactive command engine are separate. When milestone 4 links the career player to a scheduled fixture, ensure the background simulation does not also resolve that fixture or apply its statistics/rewards. Define a single commit path for the result and progression, with save/replay coverage. Interactive cup extra-time/penalty integration also remains future work; the world engine already handles its own competition ties.

An unfinished match blocks world advancement/replacement. Preserve that protection and saved decision restoration. Playback pauses on hidden tabs/navigation/dialogs and requires explicit resumption.

### Legacy saves and storage

Missing world `format` identifies the preserved compact world: 24 eight-club leagues, 192 initial clubs, 4,224 initial players, quadruple round robin and 34 weeks. New worlds use `national-v1`, home/away schedules and **60 abstract game weeks**. Never regenerate legacy worlds during migration.

The national calendar changes yearly finance/development/recovery totals relative to the compact calendar; later career balancing must account for that.

**Mean ability still drifts upward** over many seasons: the top tier goes from 66 to 72 over ten seasons. Generated adults start below their potential, and development runs 60 times a season. Milestone 4 owns ageing and development and should recalibrate both, including generation (see BALANCING.md).

Detailed current fixtures and results are replaced on rollover. Retired players move to the compact `World.archive`, and events older than the previous season are pruned. Over ten seasons a world holds at 59–67 MiB of compact JSON, against the **128 MiB** import limit, growing about 1.3 MiB per season (mostly archive records). The career player and their family must never be pruned; when milestone 4 adds the career player, exclude it from the lifecycle's release, retirement and archive rules.

## Verification baseline and remaining gaps

Recorded on 6 October 2026 after the hardening pass; see VERIFICATION.md for full evidence:

| Check                                            | Recorded result                                                                                               |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| Typecheck, lint, formatting and production build | Passed                                                                                                        |
| Vitest                                           | 124 tests across 20 files passed                                                                              |
| Playwright full suite                            | 63 passed, 21 each in Chromium, Firefox and WebKit; no skips                                                  |
| 10,000-match benchmark                           | 2.686 goals per match; home advantage; away upsets 27.3% at a 15-point and 18.5% at a 45-point gap            |
| Initial-route JavaScript                         | 183.9–195.3 KB gzip; all six routes below 300 KB; PixiJS deferred                                             |
| Lighthouse                                       | Last measured before the hardening pass (mobile 89–93, desktop 100, accessibility 100); re-run before release |
| Simulated national week (Node)                   | 72–97 ms, down from about 500 ms                                                                              |

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
  - large screen components (World, Match);
  - no touch long-press equivalent for hover tooltips;
  - the engine lint scope still allows browser globals.
- No site has been deployed; CI has not run remotely. Continental competitions, career systems, tutorial, audio and later off-pitch/release features retain their milestone scope.
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
- Git was initialized after milestones 1–3. Branch: **main**. Initial implementation commit: **`d1c1be7` — Build Pitch to Glory through milestone 3**. The hardening pass is commit **`2f71752` — Harden saves, world lifecycle and match decisions after milestone 3**.
- No remote or hosting deployment is configured at this snapshot. Do not infer that the local commit exists on GitHub. The new handoff document is subsequent work; inspect `git status` and newer commits when continuing.
- `.gitignore` excludes dependencies, builds, local test reports/artifacts, logs and environment files. Never stage generated large backup fixtures or credentials.
- `netlify.toml` supplies the static-host configuration. `.github/workflows/ci.yml` contains checks and optional deployment; publishing requires the configured Netlify production secrets and explicit deployment scope.

Historical plans stating that there is no repository are time-specific records. This Git section supersedes those statements.

## Next milestone and continuation prompt

The next milestone is **4: career creation/player attributes, XP and level-up allocation, training, the skill tree and attribute ageing**. It must include goalkeeper support and connect the completed match report/engine to career persistence without double-counting background fixtures. No further product input is needed under the existing spec unless the user wants to change it. Do not begin contracts/agents/transfers, media or other milestone-5+ work at the same time.

Paste this into Claude Code when you want it to continue milestone 4:

```text
You are continuing Pitch to Glory in this repository.

Read AGENTS.md in full before doing anything, then read docs/HANDOFF.md
and follow its reading order. AGENTS.md is the product source of truth.
Inspect git status and the current code before modifying files.

Milestones 1–3 are implemented. Implement Milestone 4 only, following
the mandatory stack, SVG art direction, accessibility, save compatibility
and quality requirements. Do not start Milestone 5 or add future UI stubs.

Preserve the source-documented national pyramids and legacy world rules.
Current saves are schema 6 (IndexedDB layout v6). Bump MATCH_ENGINE_VERSION
when match logic changes. New UI uses Tailwind utilities with shared tokens.
Recalibrate development/ageing so mean ability no longer drifts upward, and
keep the career player out of the AI squad lifecycle. Matchday currently runs friendlies; connect
career fixtures/rewards carefully so the background worker does not resolve
the same player match twice. Keep the engine deterministic and framework-free.

Make reasonable decisions for ambiguities, record them in docs/DECISIONS.md,
and continue. Update architecture, balancing, verification, README and the
handoff as appropriate. Run typecheck, lint, formatting, unit tests, build
and critical flows in Chromium, Firefox and WebKit before finishing.
Report measured limitations candidly and stop with a Milestone 4 summary.
```

If handing off a different task, replace the milestone-4 instructions with the actual authorized scope; keep the reading order and compatibility safeguards.
