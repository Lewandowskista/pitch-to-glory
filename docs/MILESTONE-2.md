# Milestone 2 design and implementation plan

**Goal:** generate and persist a complete fictional football world, browse its competitions and squads, and advance weeks or a whole season without blocking the browser.

**Architecture:** pure engine modules create and advance serializable `World` values. A module Web Worker owns each simulation job, emits progress and weekly checkpoints, and waits for checkpoint acknowledgement so IndexedDB autosave finishes before advancing. Zustand holds the last committed world and the job state. Route chunks and the worker are precached for offline use.

**Tech stack:** existing strict TypeScript, React 18, Zustand slices, Vite module workers, Dexie, Vitest and Playwright. No new dependencies are needed. Implementation follows the supplied product specification and the user's authorization to choose/document ambiguities; no additional approval gate or fabricated git history.

## Chosen rules

- Six fictional countries, four divisions per country, eight clubs per division, 22 players per initial squad. Club recipes remain unique across all 192 clubs. Squads include two keepers and balanced outfield positions.
- Quadruple round robin: 28 league rounds, two home and two away meetings per opponent. Three points for a win, one for a draw. Tie-breaks: points, goal difference, goals scored, stable club ID. Two clubs move between adjacent tiers after the completed season is reviewed and the next season is started.
- A 34-week calendar includes 28 league weeks, domestic cup rounds in weeks 4/10/16/22/30 and offseason weeks. Each country's 32 clubs contest a seeded single-leg knockout cup; drawn ties use penalties. Cups use a separate day from league fixtures. Continental participation and tournament play are milestone 8.
- Milestone 2 resolves background scores and scorer/stat totals using fixture-scoped RNG. This resolver is intentionally independent of milestone 3's interactive match engine. No interactive match UI is introduced.
- AI attributes develop/decline each week. Background club-to-club squad exchanges, poor-results manager changes, retirements and youth intakes produce typed world events. Player transfer negotiations and player progression UI remain later milestones.
- A completed season archives final tables, movement and champions. Starting the next season applies movement, renews fixtures/cup draws and preserves players, contracts, finances and history. Only current-season fixture/result detail is retained; historical tables and summaries remain available.
- Save file schema v3 adds a `world` payload beside migrated foundation collections. World saves include gallery/preferences too. Imported worlds require bounded entity values and referential/competition integrity. Backup limit becomes 32 MB for full world data. No executable values are loaded.
- Cancellation terminates the worker and retains the last acknowledged weekly checkpoint. Busy jobs prevent conflicting load/import/overwrite/new-world actions. Generation replaces a loaded world only after a URL-backed confirmation.

## Visual and interaction direction

Visual thesis: a calm football almanac with bold green headings, crisp league tables, club badges and a useful squad inspector, continuing the existing rounded vector art system.

Content plan: world creation/seed form when empty; season and simulation controls when loaded; country/tier selectors; league tables/fixtures/cup/history views; selected club's kits, manager, finances and squad; readable recent world events. Every visible control operates on implemented data.

Interaction thesis: restrained existing route entrance, selected badge/row affordances, and live worker progress with cancel. Reduced motion and large-text layouts use the existing preferences. Country, tier, tab and club selection live in the URL and survive refresh/back. An unsaved world must be assigned to a slot before closing the browser or installing a PWA update; saved worlds restore through the save screen or their slot-linked URL.

## Execution checklist

- [x] Extend model/config contracts: `BackgroundResult`, `SeasonSummary`, `WorldState`, world phase/history/results and schema v3.
- [x] Test-first engine in `tests/world.test.ts` and `src/engine/world/`: seed reproduction, foreign keys, unique crests, balanced squads, pair/home-away fixture counts, standings conservation, cups, development and offseason, deterministic resume and season rollover.
- [x] Implement/checkpoint worker protocol, `src/workers/world.worker.ts`, pure async runner and browser job client. Tests cover ack, cancellation, failure and resume; browser tests exercise the real module worker.
- [x] Extend persistence validators/migrations and store/session payload handling. Test v1/v2 preservation, v3 world round trips, malformed graphs and atomic rejection. Avoid importing generation/simulation code into the initial shell.
- [x] Build lazy `/world` screen and URL-backed inspector/views, progress/error/retry/cancel states and next-season review; update menu/navigation/save summaries and localized strings. Add no future screen stubs.
- [x] Add critical world Playwright flows for generation, URL state, week/season results, cancellation, save/reload/import and offline worker use in three browser engines.
- [x] Review spec compliance and then code quality; fix findings. Run typecheck, lint, formatting, all unit/browser tests, build, bundle and Lighthouse audits; inspect desktop/mobile light/dark layouts.
- [x] Update architecture, balancing, decisions, README and verification with actual results; summarize milestone 2 and stop.

Engine and integration are separate responsibilities; an engine implementer works in isolated file ownership while the primary agent handles worker/persistence/UI integration. Reviews remain read-only until findings are assigned.
