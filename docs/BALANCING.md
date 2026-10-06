# Foundation constants and reproducibility

All tuning constants live in `src/engine/config.ts`; visual catalogues live beside their generators.

- RNG: Mulberry32, unsigned 32-bit state, step `0x6d2b79f5`. A text seed is hashed with FNV-1a over UTF-16 code units. Numeric seeds use their integer state directly. Outputs are unsigned 32-bit results divided by 2^32. Integer draws use rejection sampling to remove modulo bias. Snapshot includes algorithm, original seed, state and number of draws.
- Scoped streams: `seed + '::' + scope`, independently hashed. Asset streams do not consume simulation randomness.
- Gallery: 15 clubs, eight players, visual ages 17/28/42. Every collection covers every crest silhouette and all eight home kit patterns. Symbol selection starts at a seeded offset within the 33-symbol catalogue.
- Visual ageing factor: `clamp((age - 28) / 20, 0, 1)`. Hairline lifts by factor × 9 SVG units. Silver temple strokes fade in with the factor. Wrinkles begin at age 32; opacity factor × 0.45. Beard opacity is `clamp((age - 16) / 7, 0.12, 1)`; jaw shadow grows from 0.03 before age 20 to 0.08 in adulthood. This does not implement career attribute ageing.
- Autosave debounce: 450 ms; explicit week/match methods flush immediately. Backup limit: 128 MiB (file schema v4). Three slots. Lease expiry: 30 seconds, heartbeat: 5 seconds. Revision increments once per committed save.
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

At weeks 12 and 24, each league's last-place manager is eligible for dismissal if the club has at most 0.9 points per game, with 80% probability. Previous managers remain in the world archive. At week 31, players aged 38+ retire with 65% probability; those aged 43+ always retire. Each club adds at least two academy players aged 16–18. If too few retire, the oldest additional outfield veterans leave as free agents. If more retire, every vacant position receives a replacement, including goalkeeper vacancies. Departing players remain in the world, lose their club and contract references, and are removed from rosters; only genuine retirees have `retired=true`. Historical goal and event references continue to resolve. Event IDs and name parameters are deterministic and preserve the display names at the event date.

### Persistence and worker boundaries

`simulateWeek` copies its input and returns a new JSON-serializable world. Resuming after a JSON save preserves the RNG state, results, events and subsequent seasons exactly. Generation, week advancement and full-season loops run in the module worker; the season loop emits progress and autosave checkpoints between each week (34 for legacy; 60 for national-v1), awaiting acknowledgement before continuing. The engine imports no browser or React modules.

Completed seasons archive all final tables, champions, cup winners and planned league movements. Starting another season retains people, club finances, active contracts, events and season summaries, and replaces current fixtures/results/cup stages; old detailed results are intentionally omitted from the next season's active fixture maps. Released free agents continue attribute development/decline and remain subject to the same yearly retirement check. A historical compact-world Node measurement generated the initial 7,630,528-byte JSON world in about 34 ms and advanced 34 weeks in about 1.95 seconds; the completed world was approximately 9.16 MB. These timings exclude worker message cloning and IndexedDB checkpoints and vary with hardware.

## National-v1 structure and calendar

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
