# Decisions and historical milestones

- The repository AGENTS.md supersedes the earlier pasted version: browser-first, React Router, no Capacitor until milestone 11, export/import, tab ownership, platform adapter and CI included now.
- The explicit instruction to make reasonable decisions and continue authorizes implementing the supplied design without an additional design approval gate. Work proceeds inline in this empty, non-git workspace; no commits or worktrees are fabricated.
- Milestone 1 saves are labelled **Gallery collections**: seed plus preferences. No career creation, world simulation or disabled future navigation appears in the interface. The complete future domain is documented and typed, but future behaviour is absent.
- Milestone 1 used file schema v2 (historical; current file schema is v5). A deliberately supported v1 foundation format provides a real tested migration; Dexie database schema versions are independent.
- Local fonts use Inter and Bebas Neue under their bundled SIL Open Font Licenses. All illustrations/icons are authored SVG; no raster generation or external image download is used.
- Minimums are interpreted as eight distinct options for each avatar category, including skin and hair color; fifteen visibly distinct crest silhouettes and thirty distinct symbols; all eight kit patterns. None is a blank substitute for variety.
- Ageing changes hairline, gray hair and wrinkles while preserving face recipe and skin identity. Age previews are visual only; attribute ageing is milestone 4.
- Theme defaults to system. Reduced motion is effective if either the OS or the user requests it. Font scaling is bounded to 85–130%.
- Web Locks are the preferred per-slot ownership mechanism. The fallback is an atomic IndexedDB heartbeat lease with revision checks, never an unreliable localStorage-only lock.
- Native leases record their mode. Acquiring a new exclusive Web Lock proves a closed native owner is gone, allowing immediate lease recovery even when unload-time IndexedDB cleanup was interrupted. Fallback leases cannot be stolen by this recovery.
- Save conflict recovery offers export of the unsaved local snapshot without flushing, followed by an explicitly confirmed reload. Destructive dialogs pin the name and revision reviewed when opened, so concurrent changes cause a conflict instead of affecting unseen data.
- Windows Playwright WebKit exposes service-worker installation and CacheStorage, but its offline navigation emulation fails before dispatching the worker. WebKit verifies the installed shell and all four actual route responses while offline; Chromium and Firefox additionally navigate to previously unvisited routes offline. Real macOS/iOS Safari offline navigation remains a device release check. No browser test is skipped.
- The SVG-only PWA manifest passes Chrome's `Page.getInstallabilityErrors` with no errors. Safari installation artwork still needs a release-device check; no raster app art was added.
- Open Graph/Twitter tags use a locally authored SVG source to honour the SVG-only art rule. Social platforms that require raster preview images will need a derived image exception and absolute deployment URL in Milestone 10; this is not claimed as cross-platform social-preview support.
- Save slots reserve their layout while IndexedDB loads. The first full-screen mobile audit measured CLS 0.263 before this fix; the corrected screen must pass the same audit rather than accepting the initial performance failure.
- Node 24 is the CI/runtime recommendation; Node 22.19 is the minimum because the installed Lighthouse audit tooling requires it. Display and body font preloads point to bundled WOFF2 sources; Vite rewrites them to local hashed build assets.
- Procedural recipes, schema validation and pure RNG are tested with Vitest; IndexedDB uses fake-indexeddb in unit tests and real storage in three-browser Playwright tests.
- Current documentation is fetched with Context7. Windows commands use npm.cmd/npx.cmd because this machine blocks PowerShell npm.ps1 shims; no execution policy is changed.

## Original milestone 2 compact format (legacy)

- The user's “Proceed” authorizes the next milestone only. The original compact milestone delivered world generation, league/cup background simulation and browsing; no interactive match viewer or career-player screens are introduced.
- Six countries have four eight-club divisions each. Quadruple round robin provides 28 league weeks; a 34-week season fits five domestic cup rounds and offseason activity. Two clubs move each way at adjacent tier boundaries. The complete rules are in [the milestone plan](MILESTONE-2.md) and [balancing](BALANCING.md).
- The crest catalogue actually contains 33 symbols, including the symbol at index 32. The gallery copy and world validation use the real catalogue count rather than the earlier 32-symbol description.
- World saves use file schema v3 and Dexie schema v3; v1/v2 collections migrate without losing their seed, settings or revision. A world also carries its gallery preferences. Complete JSON backups are about 9 MB; the historical file limit was 32 MiB; the national revision raises it to 128 MiB.
- World generation and all week/season work execute in the module worker. A season pauses after every checkpoint until the UI commits it and finishes any active-slot autosave. Cancellation waits for startup/in-flight storage work; no cancelled job can start a later week or replace a loaded world during lock cleanup. A retained active slot is reacquired after an aborted handoff.
- A new world detaches the previous active save instead of overwriting it. Creation over an in-memory world requires a URL-backed confirmation. Slot mutation is blocked during jobs. A saved world URL includes its slot, enabling refresh to restore data and view selections; an unsaved world warns before unload.
- The background score resolver uses fixture-scoped Poisson draws and records scorers, goals, appearances and ratings. It is a foundation for weekly world play; the interactive match engine and its 10,000-match statistical gate remain milestone 3.
- Background transfer windows currently make same-position, zero-fee exchanges, preserving balanced squads. User offers, agent/contract negotiation and loans remain milestone 5. Basic wages are simulated now; paid player bonuses remain with that system.
- Each academy intake replaces at least two departures. Older surplus outfield players become free agents when too few genuinely retire. Retired/free players stay available to historical references, with no active contract/club; free agents still develop/decline and can retire. Keeper departures receive keeper replacements.
- Current-season detailed fixtures/results are replaced on rollover; final tables, champions, movements, people, club identities and world events persist. The original 32 MiB backup/entity limits were guarded import limits; current bounded imports allow 128 MiB. Before milestone 8's multi-generation legacy world, archive paging/compaction or a larger versioned limit needs deliberate validation rather than silently dropping people.
- Mobile standings retain every statistic through an explicit full-table toggle and contained horizontal scrolling. The compact view prioritizes club, played, goal difference and points.
- The Windows WebKit offline driver also fails when importing a new cached module. Its test validates nonempty successful cached world-route and worker responses without initiating that driver path. Chromium and Firefox generate and advance a world offline. Physical Safari remains a release-device check.
- Lighthouse must run without concurrent browser-test/season workloads. The first concurrent audit scored 75 on mobile; after those workloads stopped, the unchanged entry screen scored 93. Final audit evidence is recorded in verification, including the save-screen cold deep-link timing.

## App updates preserve active worlds

Installing a PWA update flushes saves before reloading. An unsaved world must first be assigned to a slot, and an active or cancelling simulation prevents reload. Both guards are checked again after the save transaction so a job or new world created during that transaction cannot be lost. The same guard controls the plugin's actual `onNeedReload` activation callback, including activation caused by another tab; a deferred activation retains a working update/retry action.

## National pyramid revision (current new-world format)

- The user selected every regional group/playoff within the first four counterpart tiers and a deeper semi-professional English route. New generation defaults to `national-v1`: Aldoria/England, Valmere/France, Solara/Spain, Nordhaven/Germany, Belloria/Italy and Kestrelia/Portugal. Fictional names/assets remain the default.
- Initial generation has 52 league groups, 959 clubs, 21,098 players and seven domestic cups, including Italy's tier-three cup. Home/away schedules replace quadruple round robin. England extends through tier six with National League North/South.
- Country profiles name 2026/27 as baseline and record sources. National League and Italian Serie A/B details explicitly reuse the last published 2025/26 rules. Future fictional seasons retain the saved profile rather than silently adopting later real-world reforms.
- The 60-week calendar is abstract game time. Domestic cups use all-club single-leg knockout fields, rather than exact real qualifying/admission formats. Feeder clubs represent the boundary below simulated leagues; lower pyramids are not fully simulated. These choices and Portugal Liga 3's exactly-ten-points interpretation are documented in [realism](REALISM.md).
- Missing world `format` identifies a legacy compact world. Schema v4 and 128 MiB backups support national payloads without converting existing worlds or replacing their identities/results. Initial counts are not lifetime graph limits: feeder admissions, academy intakes and historical people can expand the graph.
- Promotion/survival phases and ties are engine state, including entrants, aggregate scores, leg counts, point bonuses and draw rules. Rollover applies resolved movements and regional allocations together. UI/storage consume that state; they do not independently decide sporting movement.
- This revision stays within milestone 2. Latest validation is recorded separately in [verification](VERIFICATION.md); the original compact-world timings and browser results do not validate the larger format.

## Large-world persistence and transport

The expanded world initially caused an 810 ms main-thread task during season autosaving. Pure simulation already ran in a worker; cloning whole graphs and validating saves on the UI thread caused the stall. Both worker directions now transfer bounded entity batches with scheduled yields. A persistent persistence worker owns validation, JSON parsing/formatting and IndexedDB operations. It retains the same atomic lease/revision checks; imports have no trusted shortcut. Save receipts avoid echoing the submitted world. Cancelling simulation waits for outstanding saves instead of terminating persistence. Dexie's tracked count keeps save cards reactive to worker writes. Final measurements are recorded in verification.

A completed-season formatted backup measured 102,778,856 bytes (about 98 MiB), explaining the 128 MiB bounded import limit. Browser tests import the downloaded file through the actual picker, rather than Playwright's 50 MB inline-buffer shortcut. Multi-generation storage compaction remains a deliberate later milestone requirement.

Supported browsers load WOFF2 fonts. The service worker precaches those fonts and excludes unused WOFF fallbacks, reducing first-visit cache traffic by about 133 KiB while retaining offline typography. The fallback files remain deployable static assets.

## Milestone 3 match experience

- The user's next Proceed authorizes milestone 3. The existing match specification supplies the approved design. Before career creation in milestone 4, Matchday runs friendlies using generated clubs and any available footballer. Reports calculate XP/fame but leave player progression and sporting tables unchanged. This avoids double-counting background fixtures and keeps career features in their own milestone.
- Match sessions are versioned, compact snapshots plus ordered sporting commands. File and database schema v5 preserve v1–v4 worlds unchanged. Imported state must exactly reproduce the command log and originate from the saved world; fabricated scores, players and reports are rejected.
- Normal minute checkpoints send only match data to the persistence worker. Atomic revisions/leases still govern each commit. The worker retains and validates the full world instead of making the UI transfer it every minute. Full-time forces an autosave.
- The match engine remains pure TypeScript. The UI schedules minute commands; wall-clock speed, visibility and render frame rate never affect sporting RNG. Explicit key moments, half-time, substitutions and captain prompts stop advancing until answered. Playback pauses on visibility loss and does not auto-resume after navigation or refresh.
- PixiJS 8.21 is lazy-loaded from the pitch route. Reusable vector tokens interpolate engine positions. Kit selection compares brightness/blue separation; solid home outlines and dashed away rings preserve identity without relying on red/green distinctions. A double gold ring marks the selected player. WebGL loss falls back to a complete SVG pitch. Simulation-only mode keeps all decisions available without constructing a renderer.
- Friendly matches use 90 regulation minutes and accept draws. Cup extra time/penalties continue through the existing national competition engine; linking career fixtures to interactive knockout matches is an integration task for the career milestone.
- Reward entrance animation is implemented now; level-up allocation awaits the career progression system. Tutorial, audio and signature celebration systems retain their later milestone scope.

## Hardening pass after milestone 3

An audit of milestones 1–3 (6 October 2026) found that saves could become permanently unloadable, worlds outgrew the backup limit by season 3, and match decisions had a dominant strategy. The user approved a hardening pass before milestone 4. No milestone-4 features were added.

### Saves survive code changes

- Compatibility no longer depends on byte-identical code. A saved match session carries its match-engine version. On load, a session from another engine version, or one that no longer replays or no longer matches the saved world, is **discarded while the world is kept**, and the player is told why (`recovery: 'match-discarded'`). Our own writes stay strict: writing a session that fails validation is rejected rather than silently dropped.
- National profiles are frozen by **rule fingerprint and profile version**, not by the full profile text. Citations, adaptation notes, names and rule descriptions can be corrected without invalidating saves; league display fields are checked against the profile stored in the save. A sporting rule change requires a new profile version registered beside the old one.
- `engineVersion` now records the build that last wrote the save (it previously kept the creator's value). It is informational; compatibility is decided by file schema, match-engine version and profile rule version.
- File schema is **6**. It adds optional `World.archive`, `Player.releasedSeason`, the `release`/`signing` event kinds and versioned match sessions. Schema 1–5 files migrate unchanged.

### Storage layout (IndexedDB v6)

- Each slot is stored as a small metadata record (`saves`), the world graph (`worlds`) and the match session (`matches`). Match checkpoints and preference changes write only metadata and the session; previously every match minute re-validated and rewrote the whole 40–100 MB world (~1.5 s each).
- The slot list reads metadata only and reports each slot independently (`ready`, `empty`, or `error` with `invalid`/`future`). One damaged or newer slot no longer hides or disables the other two, and it can still be deleted, replaced or imported over.
- Database upgrades never validate. Versions 1–5 records are migrated lazily on read; the v6 upgrade only moves data between tables and leaves malformed records untouched. A single bad record can no longer abort an upgrade and lock the player out of every slot.
- Backups are exported as compact JSON. Pretty-printing roughly doubled file size against the 128 MiB import limit.
- "Export unsaved copy" validates and serializes in the persistence worker instead of on the UI thread.
- Concurrent lock requests for a slot within one tab share one acquisition, and a page restored from the back/forward cache re-acquires its slot lock.

### World lifecycle

- Squads are no longer fixed at 22 with the two oldest outfield players released every year (which drove the mean age from 27 to 24 in three seasons while released players never played again). At the intake week each club in a simulated league: retires players on an age curve (6% at 33 rising to 70% at 38, forced at 41); renews expiring contracts for players inside the top 17 by squad value (ability, youthful upside, age) or aged 21 and under, up to age 34, and releases the rest as free agents; adds two academy players; and trims the weakest surplus above 26 while keeping positional minimums (2 GK, 7 DEF, 5 MID, 5 ATT).
- Free agents sign for clubs below target (23) or below a positional minimum at the intake week and the transfer windows. Stronger clubs choose first, and a club only attracts players up to its own level plus a margin. When nobody suitable exists for a minimum, a trialist is generated so every club can always field a valid squad. Free agents unsigned for a season at 30+, or for two seasons at any age, leave professional football.
- Clubs that drop below the simulated frontier are **dormant**: their squads are not developed, paid or reviewed. Feeder admissions reuse a dormant club from the same region before creating a new one, and a returning club refreshes ageing players and expired contracts. Previously every departure created a new 22-player club and kept the old one fully simulated.
- At rollover, retired players become compact archive records (`World.archive.players`), events older than the previous season are dropped (season summaries keep the sporting history), and managers no club employs are removed.
- Background exchanges now pair clubs at most one tier apart, and they skip clubs with no outfield position in common. Manager dismissals use the displayed national ranking and ignore tables with no games played.
- Name pools grew from 16 × 16 to roughly 60 × 80 per country; duplicate names within a generated squad fell from 527 of 959 squads to 50.
- New national worlds number crest shape/symbol pairs across countries (every one of the 495 pairs is used before any repeats; 959 clubs means at most two clubs share a pair, distinguished by colours). The hashed symbol colour is nudged towards black or white until it has at least 3:1 contrast with the crest base; 274 of 959 symbols were previously almost invisible. Legacy generation is unchanged.
- These lifecycle rules apply to legacy and national worlds alike. They are background AI behaviour, not sporting rules, so existing saves adopt them from their next simulated week; league structures and movement rules are unchanged.

### Performance

- The world worker simulates in place. Each checkpoint is fully posted before the next week mutates the world, and the deep copy had been about two thirds of every simulated week. Pure callers still receive a copy by default.
- Dormant squads are skipped by development, finances and the annual review.

### Styling: Tailwind for new UI, existing component CSS retained

The audit found Tailwind imported but essentially unused: the screens are styled with about 3,200 lines of component CSS. The user chose a hybrid over converting everything or dropping Tailwind, and AGENTS.md was updated accordingly.

- New UI from milestone 4 onward uses Tailwind utilities. Small component classes are allowed only where utilities become unwieldy (for example, pitch or crest rendering).
- Screens built before milestone 4 keep their component classes until a later milestone substantially reworks them. No restyling-only churn.
- There is one token source. `tokens.css` exposes the theme colours to Tailwind through `@theme inline` (`bg-surface`, `text-muted`, `border-line`, `bg-accent-soft`, `text-on-accent`, …), so utilities follow the same light/dark values as component CSS. Use `shadow-surface` rather than `shadow-panel` for the theme-aware panel shadow; Tailwind inlines `shadow-panel` with its light value.
- The former single `app.css` is split into ordered partials (`base`, `shell`, `menu`, `gallery`, `saves`, `settings`, `feedback`, `responsive`, `world`). They are contiguous ranges of the original file imported in the original order, so the cascade is unchanged. `match.css` stays route-scoped.
