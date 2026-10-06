# Foundation constants and reproducibility

All tuning constants live in `src/engine/config.ts`; visual catalogues live beside their generators.

- RNG: Mulberry32, unsigned 32-bit state, step `0x6d2b79f5`. A text seed is hashed with FNV-1a over UTF-16 code units. Numeric seeds use their integer state directly. Outputs are unsigned 32-bit results divided by 2^32. Integer draws use rejection sampling to remove modulo bias. Snapshot includes algorithm, original seed, state and number of draws.
- Scoped streams: `seed + '::' + scope`, independently hashed. Asset streams do not consume simulation randomness.
- Gallery: 15 clubs, eight players, visual ages 17/28/42. Every collection covers every crest silhouette and all eight home kit patterns. Symbol selection starts at a seeded offset within the 33-symbol catalogue.
- Visual ageing factor: `clamp((age - 28) / 20, 0, 1)`. Hairline lifts by factor × 9 SVG units. Silver temple strokes fade in with the factor. Wrinkles begin at age 32; opacity factor × 0.45. Beard opacity is `clamp((age - 16) / 7, 0.12, 1)`; jaw shadow grows from 0.03 before age 20 to 0.08 in adulthood. This does not implement career attribute ageing.
- Autosave debounce: 450 ms; explicit week/match methods flush immediately. Backup limit: 128 MiB of compact JSON (file schema v6). Three slots. Lease expiry: 30 seconds, heartbeat: 5 seconds. Revision increments once per committed save.
- Accessibility: font scale 0.85–1.30, UI steps of 0.05. User or system reduced motion suppresses movement.

Background scores and AI development are described below. Interactive match distributions and career balancing belong to their designated milestones. The 10,000-match statistical test is required in Milestone 3.

## Shared milestone-2 simulation and legacy structure

World saves permit 128 MiB. The structural subsection below records the preserved compact format; new-world structure is documented in the national subsection. Background scores support league simulation; they do not implement the interactive match engine or its milestone-3 statistical acceptance test. All numerical tuning is in `CONFIG.world` (`generation`, `background`, and `development` subobjects); legacy catalogues are in `src/engine/world/catalog.ts`; national profiles are in `src/engine/world/profiles.ts` and country rule modules.

### Legacy compact world structure and calendar

Legacy worlds have six fictional countries with four eight-club leagues each: 192 clubs and 4,224 active players. Initial squads have two goalkeepers, eight defenders, six central midfielders, four wingers and two strikers. Each has one veteran aged 38–42 and 21 players aged 17–36. People, clubs and assets are generated entirely from seeded streams; a seeded offset maps clubs to distinct crest shape/symbol pairs across the actual asset catalogue (15 shapes, 33 symbols).

Each league uses the circle scheduling algorithm, repeated four times with alternating home assignment: 28 fixtures per club, two home and two away against every opponent, one league fixture per week. League matches use day 1. Each country's 32 clubs enter a seeded single-leg domestic cup with rounds on weeks 4, 10, 16, 22 and 30, day 4. Only the first round exists initially; each later draw is generated from the previous round's winners. A drawn cup score is settled by penalties; shootout goals never count toward score, player goals or standings.

Standings award three points for a win and one for a draw. Ties use points, goal difference, goals scored, then ordinal club ID. The top two move up and bottom two move down at each adjacent tier boundary. Final memberships remain unchanged while the completed season is displayed; `startNextSeason` applies the archived movements simultaneously. A season completes after week 34, leaving the date at week 35 and phase `complete`. Advancing a complete week is idempotent; starting another season before completion throws.

### Generation and finances

Club reputation is sampled from `[max(5, 87 − 15 × tier), max(15, 99 − 15 × tier)]`; the bounds preserve low-tier ability for the deeper English pyramid. A player's base ability is `round(0.7 × reputation + uniformInteger(5,19) − youngPenalty)`, where the penalty is 12 under age 20. Each normal attribute varies by ±14; position-relevant attributes receive +8. A goalkeeper's finishing is 1–20, keeper attributes are base + a sample from −10–15, and outfield keeper attributes are 1–25. All attributes are integers clamped to 1–99. Potential is at least the highest relevant attribute and includes a base bonus of 8–30 under age 22, otherwise 8–18.

Weekly wage is `max(50, round(base² × (0.12 + reputation/1000)))`. Contracts last 1–4 seasons; appearance, goal and clean-sheet bonuses are respectively 10%, 15% and 12% of wage, release clauses are 250 wages, sell-on terms range 0–15%, and loyalty bonuses are four wages. Background matches currently accrue basic wages; paid career bonuses and negotiations are milestone 5.

Initial balance, income, running costs, transfer budget and wage budget are reputation squared times 200, 12, 3, 60 and 8 respectively. Each week, `balance = max(0, round(balance + income − runningCosts − rosterWages))`; wage budget covers at least the current roster, and transfer budget is capped at 35% of balance. Stadium capacity is a sample from 8–20 times `round(reputation²/4)`.

### Background fixture resolution and statistics

Every fixture has an independent RNG scope, `seed + ':result:' + fixtureId`, so unrelated RNG consumption cannot shift its rolls. Team strength is `0.6 × reputation + 0.4 × meanStartingXIAbility`. Mean ability uses outfield attributes or goalkeeper attributes. The selection takes one goalkeeper, four defenders, three central midfielders and three attackers, preferring higher ability, with deterministic player-ID ties and outfield fallback if positional coverage changes.

The score uses two capped Poisson draws (maximum 10 goals per team):

```
strengthDifference = (homeStrength − awayStrength) × 0.012
homeExpectedGoals = max(0.15, 1.35 + 0.14 + strengthDifference)
awayExpectedGoals = max(0.15, 1.35 − 0.14 − strengthDifference)
```

Scorer weights are goalkeeper 0.01, striker 5, attacking midfielder/winger 3, central/defensive midfielder 1.5, defender 0.5. Each goal has a 78% chance of an assist from another outfield starter. All starters receive 90 minutes; clean sheets are recorded for all starters when the opposition scores zero. A player's rating is `clamp(6.1 + outcomeBonus + 0.8 × goals + uniform(0,0.8), 3,10)`; win bonus is +0.6 and loss penalty −0.4. Ratings accumulate rounded to two decimals. Form is `round(0.85 × previousForm + 0.15 × rating × 10)`. Wins/losses change morale ±2. Playing adds 12 fatigue; weekly recovery subtracts 10; fitness is `round(100 − 0.2 × fatigue)`. Percentage fields clamp to 0–100.

A historical compact-world check of seed `world-test` across 2,874 fixtures produced 2.732 goals per game, with 1.537 home and 1.195 away goals. This is an observed development check, not the milestone-3 10,000-match validation.

### AI development and world events

For each active player's attribute below potential, weekly improvement probability is `0.045 × (ageGrowth + mentalGrowth) × (0.6 + professionalism/100)`. Age growth is 1.7 below 24, 0.65 at 24–28, and zero thereafter. Mental growth adds 0.65 for vision, composure, positioning, decisions, work rate and leadership until age 36. From age 30, decline probability is `0.035 × (age − 29)/5 × categoryFactor`, where physical factor is 2, mental is 0.15, and technical is 0.7. Goalkeeper attributes grow with `0.045 × professionalismFactor` until 32 and decline from 35 with `0.035 × (age − 34)/4`. Improvement and decline are independent; all attributes retain their integer 1–99 bounds.

Weeks 8, 18 and 31 exchange one pair of players per country between distinct clubs, matching the same outfield primary position. This produces twelve transfer events per window, preserves roster size/position coverage, and keeps goalkeeper counts safe. The zero-fee exchanges are background AI transactions; multi-step offers, fees and user negotiation are milestone 5. Contracts move with their players and reset to two-year terms. Dressing-room leaders and clique references refresh immediately after roster changes.

At weeks 12 and 24, each league's last-place manager (by the displayed ranking) is eligible for dismissal if the club has at most 0.9 points per game, with 80% probability; a table with no games played is skipped. Background exchanges at weeks 8, 18 and 31 pair two clubs at most one tier apart that share an outfield position. Squad turnover is described in the lifecycle section below. Event IDs and name parameters are deterministic and preserve the display names at the event date.

### Squad lifecycle (hardening pass)

All constants are in `CONFIG.world.lifecycle`; the logic is `src/engine/world/lifecycle.ts`. Only clubs in simulated leagues are processed. Clubs below the frontier are dormant: no development, finances or review.

- **Retirement** (intake week, week 31): probability by age is 0.06 at 33, 0.12 at 34, 0.24 at 35, 0.40 at 36, 0.55 at 37 and 0.70 from 38; age 41 or older always retires.
- **Contracts**: a contract whose end season is the current season (or earlier) is renewed when the player ranks inside the club's top 17 by squad value or is 21 or younger, and is at most 34. Otherwise the player is released. Squad value is `ability + (age < 23 ? 0.5 × max(0, potential − ability) : 0) − (age > 30 ? 2 × (age − 30) : 0)`. Renewals and signings run 2–4 seasons under 23, 1–2 from 30 and 1–3 otherwise. Wage is `max(50, round(ability² × (0.12 + reputation/1000)))`, with the usual bonus and clause multipliers.
- **Academy**: two players aged 16–18 per club, placed where the squad is furthest below the generated 22-player template (no third keeper by default).
- **Trimming**: above 26 players, the lowest-value surplus is released while keeping minimums of 2 GK, 7 DEF, 5 MID and 5 ATT.
- **Signings** (intake week and weeks 8/18): clubs sorted by reputation sign the best free agent of the needed group whose ability is at most the club's top-eleven mean plus 4, until they reach 23 players and every minimum. If no free agent fits a minimum, a trialist aged 19–27 is generated.
- **Free agents** leave professional football after one unsigned season at 30+, or two unsigned seasons at any age. Before that, they keep developing.
- **Readmission**: a dormant club returning to a league retires players aged 37+ (each replaced by a generated player of the same position) and renews expired contracts. Feeder admissions reuse the highest-reputation unclaimed dormant club in the same region before creating a new club.
- **Rollover**: retired players become `ArchivedPlayer` records, events before the previous season are dropped, and managers not employed by any club are removed.

Measured with seed `long-run` over ten national seasons in Node (compact JSON size of the world):

| Point     | Clubs (non-league) | Players (free agents) | Archived | World JSON |
| --------- | ------------------ | --------------------- | -------- | ---------- |
| Generated | 959 (0)            | 21,098 (0)            | 0        | 37.5 MiB   |
| End S1    | 1,066 (107)        | 25,391 (0)            | 0        | 50.8 MiB   |
| End S5    | 1,089 (129)        | 28,669 (1,528)        | 5,260    | 60.7 MiB   |
| End S10   | 1,097 (138)        | 30,471 (2,233)        | 13,482   | 67.2 MiB   |
| Start S11 | 1,097 (137)        | 28,867 (2,233)        | 15,131   | 58.9 MiB   |

Before this pass the same measurement grew ~15 MiB per season and a season-3 backup (134.4 MB pretty-printed) exceeded the 128 MiB import limit. Growth is now about 1.3 MiB per season, mostly the compact retiree archive. Mean squad age moves from 26.9 at generation to about 25 and then holds; squads hold 23–26 players.

**Known balance issue, deferred to milestone 4:** mean ability still rises over time (top tier 66 → 72, sixth tier 19 → 27 after ten seasons, rising more slowly each season). Generated adults start below their potential and develop toward it, and the 60-week national calendar applies development 60 times a season against the 34-week calibration. Milestone 4 owns the ageing curve and attribute development and should recalibrate both, including generation, so that tiers stay stable.

### Persistence and worker boundaries

`simulateWeek` copies its input and returns a new JSON-serializable world. Resuming after a JSON save preserves the RNG state, results, events and subsequent seasons exactly. Generation, week advancement and full-season loops run in the module worker, which simulates in place (`{ inPlace: true }`) because it owns its world; the season loop emits progress and autosave checkpoints between each week (34 for legacy; 60 for national-v1), awaiting acknowledgement before continuing. The engine imports no browser or React modules.

Completed seasons archive all final tables, champions, cup winners and planned league movements. Starting another season retains people, club finances, active contracts, events and season summaries, and replaces current fixtures/results/cup stages; old detailed results are intentionally omitted from the next season's active fixture maps. Released free agents continue attribute development/decline and remain subject to the same yearly retirement check. A historical compact-world Node measurement generated the initial 7,630,528-byte JSON world in about 34 ms and advanced 34 weeks in about 1.95 seconds; the completed world was approximately 9.16 MB. These timings exclude worker message cloning and IndexedDB checkpoints and vary with hardware.

## National-v1 structure and calendar

Simulating a national week in Node took about 500 ms before the hardening pass, about two thirds of it the whole-world deep copy. With in-place simulation and dormant squads skipped, it takes 72–97 ms across ten seasons, plus 0.6–0.8 s to validate a completed world.

`CONFIG.world.nationalWeeksPerSeason` is 60 abstract game weeks. Calendar consumers use `getSeasonWeeks(world)`; legacy worlds keep 34. Initial national generation contains 959 clubs × 22 players = 21,098 players across 52 league groups. English tiers five/six supply the semi-professional route; other countries include every regional group through tier four. Full group sizes, per-club match counts and movement rules are in [REALISM.md](REALISM.md).

The circle scheduler generates two cycles with opposite home assignments. For an even group of `n`, it schedules `2 × (n − 1)` rounds/matches per club. For an odd group, there are `2 × n` calendar rounds with two byes per club and still `2 × (n − 1)` matches. Regional membership/capacity can change after movement, so later schedules derive from actual membership.

National cup windows are weeks 5, 11, 17, 23, 29, 35, 41, 47 and 53, day 4. Six national knockouts admit all simulated clubs in their country; Italy adds a tier-three cup. Fields use byes to reach valid knockout brackets. These are game adaptations, not exact real domestic cup qualification rules. Drawn knockout fixtures use penalties; penalties do not inflate player goals or standings.

Postseason ties/league phases begin when their prerequisite results complete. Phase tables are separate from regular tables, with points reset except for Liga 3 survival bonuses. Two-leg aggregates resolve only after both legs; higher-rank advantage, extra time or penalties depend on the saved tie rule. Completed movement is archived and applied simultaneously at rollover, including reserve demotions and regional allocation. Feeder admissions below the simulated frontier can increase total clubs/players even when active division sizes remain balanced.

Portugal Liga 3 survival bonus is `0` for first-phase totals below 10; otherwise `11 − rank + clamp(floor((points − 10) / 5), 0, 4)` for ranks 5–10. Exactly ten explicitly receives rank bonus. Other conditional thresholds are fixed sporting rules, not score-balancing knobs: Serie B automatic third promotion requires a lead strictly greater than 14, Serie B survival omission strictly greater than 4, Serie C survival omission strictly greater than 8, and Serie D survival omission at least 8.

The shared background Poisson, financial, AI development and event formulas above currently apply to both formats. Transfer, manager and academy event weeks remain 8/18/31, 12/24 and 31 respectively; national generation changes sporting schedules rather than doubling yearly intake. However, 60 game-week finance/development/recovery ticks instead of 34 change the season's cumulative effects. They are deliberate current calendar consequences requiring later career balancing, not evidence of real annual economic/ageing calibration.

National generation adjusts lower-tier reputation/economics for semi-professional clubs and retains deterministic country-specific identities. Profiles and country modules hold fixed competition rules; `CONFIG.world` holds numerical generation/score/development tuning. Timings and payload sizes above refer only to compact worlds. National worker cloning, checkpoints, IndexedDB writes, rollover growth and UI performance require their own measurements in [VERIFICATION.md](VERIFICATION.md).

`CONFIG.workers.transportBatchEntries = 32` bounds graph-transfer packets, and `transportYieldMs = 8` yields the sender between batches. The receiver publishes only completed snapshots. These are transport tuning values, independent of simulated time and RNG. Save validation, JSON conversion and IndexedDB storage run in a persistent worker; weekly simulation still waits for the durable save acknowledgement.

## Interactive matches

All match tunables are exposed through `CONFIG.match` in `src/engine/config.ts`. The pure command engine produces role-specific opportunities and transparent probability factors. [Match balancing](MATCH-BALANCING.md) records the sporting formulas, calibrated distributions and report calculations. Friendly rewards are calculated performance values until milestone 4 supplies progression.

## Development and ageing (milestone 4)

All constants are in `CONFIG.world.development`; the logic is in `src/engine/ageing.ts`.

**Potential.**

- Since development version 2, `potential` is a player's peak overall ability, not an attribute ceiling.
- Generation draws it as `0.75 × club reputation + 13 ± 8`.
- An attribute's peak is `potential + positional emphasis (8 on the position's three key attributes) + offset`. The offset is a stable ±10 value derived from the player id and attribute name, so every player keeps a distinct profile without storing a second attribute set.
- Untrained attributes (an outfielder's goalkeeping; a keeper's outfield technique and physique) are static values in 1–25.

**Age curves.** Each category scales the peak by age, interpolated linearly between these points:

| Category                            | 16   | 18   | 21   | 23–24     | 26–28                | 30   | 32   | 34–35     | 37   | 40   |
| ----------------------------------- | ---- | ---- | ---- | --------- | -------------------- | ---- | ---- | --------- | ---- | ---- |
| Pace, acceleration                  | 0.84 | 0.91 | 0.97 | 1.00      | 1.00 (26), 0.96 (28) | 0.90 | 0.83 | 0.72 (35) | —    | 0.60 |
| Strength, stamina, agility, jumping | 0.80 | 0.88 | 0.95 | 1.00 (24) | 1.00                 | 0.96 | 0.91 | 0.85 (34) | 0.76 | 0.68 |
| Technical                           | 0.76 | 0.83 | 0.90 | 0.96 (24) | 1.00                 | 1.00 | 0.97 | 0.93 (34) | 0.86 | 0.80 |
| Mental (incl. aggression)           | 0.70 | 0.77 | 0.84 | 0.91 (24) | 0.96 (27)            | 1.00 | 1.00 | 1.00 (34) | 0.97 | 0.93 |
| Goalkeeping                         | 0.72 | 0.80 | 0.87 | 0.93 (24) | 0.98 (27)            | 1.00 | 1.00 | 0.95 (35) | 0.89 | 0.80 |

**AI development.**

- Each week, every trained attribute moves one point toward `peak × curve(age)`.
- The chance is `min(0.9, |gap| × rate / seasonWeeks)`, where rate is `0.75 × professionalism factor` for growth and `0.75` for decline. Professionalism factor is `0.6 + professionalism/100`.
- So a gap closes by roughly three quarters each season, independent of calendar length.
- Generation places players on their curve (±2), so new worlds start at equilibrium.
- Worlds without `developmentVersion: 2` are recalibrated once on their next simulated week: `potential := trained ability / weighted curve(age) − mean emphasis`.

**Measured** (seed `drift-check-2`, six national seasons): mean ability by tier at generation is 67.3 / 56.6 / 46.5 / 36.2 / 26.6 / 20.0. After six seasons it is 64.3 / 55.7 / 44.9 / 36.8 / 26.5 / 21.6, stable from season three onward. Before development version 2 the top tier rose from 66 to 72 over ten seasons.

**Lifecycle adjustment.** Squad value now subtracts 1 per year over 30 (was 2), and expiring contracts renew up to age 35 (was 34). The share of players aged 29+ at season start holds near 29%.

## Career progression (milestone 4)

All constants are in `CONFIG.career`; the logic is in `src/engine/career/`.

**XP and levels.**

- Match XP is the report's performance XP (`minutes × 1.2 + max(0, rating − 6) × 25 + goals × 30 + assists × 20 + objectives × 15`), multiplied by:
  - opposition: `clamp(1 + (opponent reputation − own reputation) × 0.01, 0.8, 1.3)`;
  - importance: league 1, promotion/survival phase 1.1, cup 1.15, playoff tie 1.25, final 1.5.
- Going from level n to n + 1 needs `round(300 × 1.06^(n − 1))` XP, up to level 99.
- Each level grants 8 attribute points and 1 skill point.
- Auto-played seasons in Node reached about level 11 in a first season (about 39 appearances).

**Attribute costs.**

- The soft cap for an attribute is `(potential + positional emphasis) × curve(age)`, with no hidden offset.
- Raising an attribute costs 1 point below the cap, 2 within five above it, and 3 beyond. Pace and physical attributes cost one more from age 29. 99 is the maximum.
- Outfield players cannot raise goalkeeping attributes; keepers raise goalkeeping and mental attributes.

**Creation.**

- Age 16–18, potential 74–88.
- Starting attributes are the trial club's average ability for the position family, minus 3, plus the archetype's emphasis, plus half the positional emphasis, ±2, capped by the age-adjusted cap.
- The archetype's tier-one skill is granted free.

**Skill tree.**

- 49 skills in 8 branches: finishing, creativity, dribbling, defending, physical, mentality, set pieces, goalkeeping.
- Costs and minimum levels by tier: tier 1 costs 1 point from level 1; tier 2 costs 2 from level 5; tier 3 costs 2 from level 12; tier 4 costs 3 from level 20.
- Every skill grants small permanent attribute bonuses and one or more of:
  - boosted key-moment choices (`TRAIT_BOOSTS`, success odds ×1.2);
  - an unlocked key-moment choice (`requiredTraitId`);
  - a systemic effect: Professional ×1.2 training gains; Second Wind ×0.7 training fatigue; Iron Man halves injury risk; Big Game Player ×1.1 odds on every choice in fixtures of importance above 1; Leader and Captain's Voice raise leadership, which decides the captaincy.

**Training.**

- Three weekly sessions plus an optional mentor session.
- Gain per session is low 0.08, normal 0.13, high 0.19 attribute points (mentor 0.15), multiplied by:
  - learning by age: 1.3 at 16, 1.15 at 20, 1.0 at 24, 0.85 at 28, 0.65 at 32, 0.5 at 36;
  - `(0.6 + professionalism/100) / 1.1`;
  - Professional.
- A mentor's lead in the focus adds up to +50%.
- A group focus splits its gain across the group's trainable attributes. Progress above the soft cap is halved and stops five points above it.
- Learning a position adds familiarity 2 / 4 / 6 by intensity (×1.5 with a mentor).
- Fatigue per session is low 1, normal 2, high 5, extra 3, recovery −12, against the weekly −10 recovery every player receives.

**Injuries.**

- Risk per session is low 0.002, normal 0.005, high 0.013, extra 0.004, plus 0.008 per match.
- Every risk is multiplied by `(1 + fatigue/50) × (0.5 + injury proneness/100)`, and by 0.5 with Iron Man.
- Types and weights: knock 30 (1–2 weeks), muscle strain 22 (2–4), ankle sprain 16 (2–5), hamstring strain 14 (3–6), groin strain 8 (3–6), calf tear 6 (5–9), broken foot 2.5 (8–14), knee ligament 1.2 (16–30).
- A knee ligament injury is career-threatening 25% of the time; on recovery it costs 6 pace and 6 acceleration.
- Rushing a return cuts the remaining weeks to 60% (minimum 1), then risks a re-injury of the same kind in each match for six weeks with probability 0.15.
- Auto-played Node seasons saw 7–9 injured weeks per season at default intensities.

**Ageing for the career player.** Past a category's peak (pace 26, physical 28, technical 30, mental 34, keeper 33), attributes above the age-adjusted cap decline toward it using the AI decline rate. The player never grows automatically.

**Hidden attributes.** These are revealed at 5, 15, 30, 50 and 80 appearances, in this order: professionalism, consistency, injury proneness, big-match temperament, ambition.
