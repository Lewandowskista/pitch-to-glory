# National pyramid revision plan

**Goal:** replace new worlds' uniform compact pyramid with complete real-counterpart national structures, retaining legacy worlds and keeping this work within milestone 2.

**Architecture:** a frozen, source-documented profile catalogue defines divisions, groups, schedules and sporting movement. The pure engine represents postseason group phases and seeded ties as serializable state, progresses them through the existing worker's weekly checkpoint loop, and archives actual resolved movement. UI and persistence consume these domain values rather than reproducing rules in components.

**Stack:** unchanged React 18, strict TypeScript, Zustand slices, Dexie, Vite module workers, Vitest and Playwright. No match viewer, career wizard, new dependencies or external artwork.

## Identity and baseline assumptions

The naming question is still available for user steering. Until answered, retain the AGENTS.md fictional identities and map Aldoria → England, Valmere → France, Solara → Spain, Nordhaven → Germany, Belloria → Italy, Kestrelia → Portugal. Use the six proposed systems as the working selection. Full groups and playoffs and deeper English tiers were explicitly selected by the user. Use 2026/27 where verified; label any regulation reused from an older reference precisely. Confirm unresolved regulatory details before claiming full conformity.

## Engine and model

- [x] Introduce a versioned national-world discriminator and country reference metadata. Extend tier typing to six for England. Missing discriminator continues to mean the saved legacy eight-club format.
- [x] Retain `generateWorld(seed, { format: 'legacy' })` for existing regression fixtures; new generation defaults to national profiles. Preserve the legacy engine's original fixture/calendar/movement behavior.
- [x] Add division/group definitions and variable home/away schedules, including odd participant counts and byes when the published reference demands them. Validate exact per-club match totals and pair/home-away counts.
- [x] Model England's top six tiers including National League North/South; all regional groups within the first four tiers in the other five systems. Geographic club identity survives moves; allocation must preserve valid regional memberships and documented capacity rules.
- [x] Give generated club/city/stadium and person names country-specific catalogues, original identity and professional/semi-pro status. Club crest uniqueness includes the complete recipe, not a 495-pair ceiling. Keep two goalkeepers and balanced 22-player squads.
- [x] Store postseason phases/ties, entrants, source/target divisions, fixture IDs, aggregate/rank/draw rules, standings/reset/bonus points and resolved movement. Never resolve a two-leg aggregate from just its first leg. Keep ordinary league tables separate from promotion/survival phase tables.
- [x] Implement and test every country boundary from its sourced profile, including conditional point-gap rules, reserve eligibility, rotation of German direct regional places, Spanish cross-group draws, Italy's tier-three cup-seeded national bracket, French multi-step barrages, Portuguese phased leagues and feeder replacement below the simulated frontier.
- [x] Make calendar duration a per-world value consumed by simulation, rollover and worker progress. Finish only after all scheduled phases/ties are resolved. Preserve deterministic checkpoint/JSON resume and cancellation.

## Integration and storage

- [x] Version file/database saves for national payloads. Migrate existing slots without changing legacy rules or club/results/history data. Raise bounded graph/file limits from measured new-world sizes; validate national shape, schedules, phases, result conservation, movement and foreign keys before committing.
- [x] Adapt world route selectors to variable tiers and regional groups. Add counterpart/reference information and real automatic/playoff/survival zones with clear rules text. Render actual postseason tables/brackets/results and archived movement.
- [x] Update summaries, navigation, progress, dates and localized strings to derive counts/calendar from the current world. Preserve light/dark, reduced motion, large-font mobile, keyboard and saved URL behavior.
- [x] Test legacy and national save round trips, malformed phase/tie imports, cancellation near phase boundaries, slot restore/export/import and season rollover in the real browser worker.

## Completion

- [x] Review source/profile agreement and final engine/integration code. Run strict typecheck, zero-warning lint, formatting, all unit tests, production build/bundle budget and all three-browser UI checks; inspect expanded world layouts and performance.
- [x] Update architecture, balancing, decisions, README, realism references and verification with exact implemented rules, results and any deliberate adaptations. Stop before milestone 3.

Engine/model changes and UI/save integration have separate file ownership. Research and code reviews remain read-only until implementation ownership is assigned. There is no git repository, so no commits/worktrees are fabricated.
