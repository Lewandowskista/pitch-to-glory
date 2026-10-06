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

- The user selected every regional group/playoff within the first four counterpart tiers and a deeper semi-professional English route. New generation defaults to `national-v1`: Aldoria/England, Valmere/France, Solara/Spain, Nordhaven/Germany, Belloria/Italy and Kestrelia/Portugal. Fictional names/assets remain the default. (Superseded for new worlds by identity version 2; see below.)
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

## Milestone 4: the career player

The user's "Proceed with Milestone 4" authorizes this milestone only. The design and checklist are in [MILESTONE-4.md](MILESTONE-4.md); the formulas are in [BALANCING.md](BALANCING.md).

**Where the career lives.**

- The career lives in `World.career`, and the player is an ordinary member of `world.players` and of their club's squad. Background fixtures, tables, statistics and squad views treat them like any player, and the simulation worker can apply training, recovery and ageing each week without a second payload.
- The placeholder `CareerState`/`CareerPlayer` types from milestone 1 were removed; save payloads remain `foundation` or `world`.

**Starting a career.**

- A career starts at one of three trial clubs from the bottom simulated tier of the chosen country (England's National League North/South, the lowest regional groups elsewhere), matching AGENTS.md §1. Reserve teams are never offered.
- The career can start in a newly generated world or in a loaded world without a career.
- The player always starts when fit. Squad-role promises and manager selection belong to contracts (milestone 5) and relationships (milestone 6).

**One commit path.**

- The career player's fixtures are played interactively (or by the headless auto-play policy during season simulation) and committed once through `commitPlayedFixture`, which shares the background resolver's standings, statistics, extra-time and penalty code.
- `simulateWeek` refuses to run a week with an unplayed career fixture unless explicitly allowed. The worker therefore stops at matchdays, or auto-plays when the player chose season simulation with auto-play.
- An injured player misses the match and the fixture is simulated normally, without XP.
- Committing runs in the world worker. The committed world replaces the finished session in the store, and the session is kept only in memory for the report, so a saved world never sits beside a session it already contains.
- An interactive match always covers 90 minutes. Knockout and deciding-leg draws are settled after it with the background extra-time and penalty rules, and the report records how the tie was decided.

**Progression and ageing.**

- Development version 2: `potential` means peak overall ability, AI attributes follow age curves toward an id-derived profile, and generation starts players on their curve. This fixed the upward ability drift the hardening pass deferred.
- Older worlds are recalibrated once. Abilities in recalibrated worlds keep their values and only move toward the new targets gradually.
- The career player grows only through XP, attribute points and training. Ageing pulls attributes above the age-adjusted soft cap back down after each category's peak.
- The AI lifecycle never retires, releases, trims, exchanges or re-contracts the career player.
- If the career club drops below the simulated frontier, the player joins a club in the lowest simulated division of the same country (same region where possible), recorded as a transfer event. Real transfers arrive in milestone 5.
- Retirement is milestone 8; forced retirement does not apply to the career player yet.

**Injuries.** The injury system is implemented now, for the career player only, because training intensity must carry real risk (AGENTS.md §6). Types, durations, the rehab-or-rush choice and the rare career-threatening tail follow §8. AI players remain injury-free; validation rejects an injury on anyone but the career player.

**Skills.** There are 49 skills, slightly above the specified ~40, so goalkeepers have a full branch. Every skill has a tested effect: boosted choices, an unlocked choice or a systemic effect. Skill ids double as trait ids.

**Versions.** File schema 7 adds the optional career and development version. The match engine is `match-5`: sessions saved by `match-4` are discarded on load with the existing notice, and the world is kept.

## Real countries and referenced clubs (before milestone 5)

The user asked for real countries and regions, with fictional clubs, leagues and competitions that clearly reference their real counterparts. Their choices:

- **Club mapping:** the professional tiers map one to one (302 clubs). Lower tiers use plausible generated clubs in real towns.
- **Club names:** city + nickname.
- **Competition names:** descriptive parody (English Premier Division, German Regionalklasse, European Champions Cup).
- **Older saves:** keep their fictional names and rules.

Implementation decisions:

- **Identity version 2.** `World.identityVersion: 2` marks new national worlds. Its absence means fictional names, including for feeder clubs admitted later, so an older world never mixes styles.
- **Names are display data.** Display names and real references are copied into the saved profile. The rule fingerprint excludes them and region keys are unchanged, so no sporting rule changed.
- **File schema 8.** Schema 8 only adds the optional `identityVersion` and `DivisionProfile.reference`; schema 7 files migrate unchanged.
- **Referenced clubs keep real attributes.** These are city, coordinates, colours, home-shirt pattern, stadium and capacity. Reputation comes from stature within the tier's existing band, so the balance of the tier is unchanged.
- **Reserve teams.** Real reserve teams in referenced tiers have fixed parents and keep their real grounds; they share the parent's kits and colours. Generated reserves in lower groups still take the parent's city.
- **Reserve counts follow the real leagues.** Spain and Portugal now start with 9 reserve teams, Germany 7, France and Italy 3. Forced reserve demotion now picks the target group sharing the reserve's region, instead of the first group.
- **Lower-tier name styles** are keyed on a hash of the town rather than the club index, so tables do not show a fixed rotation. German founding years follow the same hash.
- **Wizard and Rules panel.** The career wizard lists the real country names. The Rules panel shows "Real-world model: <competition> · <season> rules". Postseason labels come from the division and stage, not the engine key, so no real competition names leak into the UI.
- **Identity data stays in the worker.** All identity data lives in `src/engine/world/identities/` and ships only in the world-worker bundle.
- **Open review items for the user:** "Lisbon Lions" also evokes Celtic's 1967 side; "Bochum Unrelegatables" is a fan nickname rather than an official one; Paris clubs sit in the Northwest game region and Monaco in South.

## Milestone 5: contracts, agents, transfers and loans

- **Scope: the player's market.** The full market (interest, bids, negotiation, loans) is built around the career player. AI clubs keep the existing like-for-like exchanges, because a full AI transfer market would change the balance of every simulated league; a later milestone can extend it.
- **Role promises decide selection.** This was the open item from milestone 4. A seeded draw keeps background and interactive paths consistent. A trial earns a rotation contract so early careers still play regularly, and starts rise as the player improves.
- **Deterministic negotiation.** Clubs answer counter-offers by rule, not by dice, so the talks can explain every response, in line with AGENTS.md §9.5 (decision transparency). Uncertainty comes from the private limits, which an agent estimates.
- **Windows and visibility.** Offers made by the weekly simulation are dated from the week the player sees them, and never outlive the window. Renewals and pre-contracts are allowed outside windows, as in real football.
- **Club option at expiry.** A contract that runs out without a new deal is extended by one season, so a career world never holds an unattached player. Pre-contracts provide the free-agent route.
- **Registration after a move.** The player is registered from the following week, so they can never play twice in one week.
- **Minimal relationships now.** The transfer request must affect relationships (AGENTS.md §8), so manager trust and fan affection per club are introduced as `Relationship` records. Trust also feeds selection. Milestone 6 adds teammates, media and performance effects.
- **Inbox now.** The inbox screen from AGENTS.md §10 is built here, because offers need a place to arrive. It holds market messages only until later milestones add more.
- **Structural sharing for actions.** UI market actions copy only the records they change, about 15 ms on a national world, instead of deep-copying the world.
- **Bundle.** The schema 9 migration lives in the shell bundle, as validators already did. Agent generation therefore uses a compact name list, not the name catalogues. The shell grew from about 191 to about 199 KB gzip.
- **Accessibility tooling.** `axe-core` is now an explicit dev dependency. The market journey checks the populated pages with it, because Lighthouse only sees empty-state pages in a fresh profile.
- **Versions.** File schema 9; `MATCH_ENGINE_VERSION` is unchanged (`match-5`), because the match engine itself did not change.

## Milestone 6: media, relationships, rival, dressing room, morale and form

- **Morale now matters.** Morale had no effect before. It now shifts key-moment odds by up to ±8%, shown as a "Morale" factor (decision transparency, §9.5). The factor is centred on the average generated morale, so match calibration is unchanged. The match engine became `match-6`; older sessions are discarded on load with the existing notice.
- **An explained morale target.** Morale moves toward a target made of named, bounded parts, so every system in this milestone (relationships, dressing room, culture fit, media) reaches the player through one visible number.
- **The rival is an existing player.** Choosing a real player of the same generation, rather than generating one, keeps the world graph and the schema 10 migration small. The migration lives in the shell bundle and must not pull in world generation. The rival is protected from the AI lifecycle for the career's duration, and moves club by their own rule.
- **Cliques for the player's club only.** Groups are derived from the squad each week (age and nationality) and keep their regard for the player. Other clubs keep a static mood, which keeps weekly simulation cost bounded. The shared dressing-room refresh keeps clique members and leaders valid for every club.
- **Culture fit (§9.6) is in this milestone.** It belongs with relationships and the dressing room. Personality `temperament` is read as composure (high is calm), documented in BALANCING.md.
- **Press design.** At most one open question; a fixed catalogue of topics, each with three answers whose effects are shown before choosing; a six-week topic cooldown. Number keys 1–3 answer, matching key moments.
- **Size and cost.** The shell grew about 5 KB gzip (migration and validator); the new routes are 226–232 KB. A national career week costs about 330 ms in the worker, against 284 ms after milestone 5.
- **Versions.** File schema 10, match engine `match-6`.
