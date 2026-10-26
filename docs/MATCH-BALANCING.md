# Interactive match balancing

> **1.0 compatibility cut.** Only engine `match-21` is live. The earlier engine paths described
> below as kept for replay (`match-10-lines` to `match-20`, the 4-3-3 line-up, cosmetic cards, the
> combined weather factor) were removed; their sessions restart from kick-off. The history is
> kept here for the reasoning behind each rule. See [COMPATIBILITY.md](COMPATIBILITY.md).
>
> **match-22.** Release 1.0 Phase 5 plays new matches on `match-22`, with `match-21` kept as the
> previous engine: each 1.0 rule is gated on `rules22(setup)` (COMPATIBILITY.md, "How to change
> match rules in match-22"), and the rules below are match-21's until a step says otherwise.

Engine `match-8` (`MATCH_ENGINE_VERSION`); sessions saved by `match-7` replay with their original 4-3-3. The engine plays the 90 minutes of friendlies and career fixtures; extra time is simulated when a fixture is finalized (see Phase 1.2 in BALANCING.md). Scalar tunables live in `CONFIG.match` (`src/engine/config.ts`; `engine/match/tuning.ts` is an alias). The key-moment catalogue — situations, their choices, governing attributes, base probabilities and weights — is data in `src/engine/match/situations.ts`; personal roles and their effects are in `src/engine/match/roles.ts`. Pitch geometry, formation slots and regulation minutes are structural values.

All replayed floats are produced with `+ − × ÷`, `Math.round`, `min`/`max` only and rounded to six decimals where they are stored or compared (`round6`). No `Math.exp`, `Math.pow` or `Math.hypot` result enters replayed state, so a saved session replays byte-for-byte on any JavaScript engine. Sessions carry their engine version (`engine: 'match-7'`); `validateMatchSession` throws `OutdatedMatchSessionError` before replaying a session whose `engine` is missing or different.

## Shared strength model

`src/engine/strength.ts` holds the formulas of the background fixture resolver so both paths agree:

- `playerAbility(p)` = mean of the outfield attributes, or of the goalkeeping attributes for a goalkeeper.
- `selectStartingPlayers(players)` = best goalkeeper, four best CB/LB/RB, three best DM/CM/AM, three best LW/RW/ST, then the best remaining outfielders up to eleven (ability descending, ties by ascending id; retired players ignored).
- `teamStrength(reputation, starters)` = `reputation × 0.6 + meanAbility(starters) × 0.4`.
- `expectedGoals(h, a, neutral)` = `max(0.15, 1.35 ± 0.14 ± (h − a) × 0.012)` (home advantage 0 on neutral ground).

`tests/strength.test.ts` recomputes every week-one background result of a generated world from these functions and the resolver's Poisson sampler and requires identical scores.

Every match fields each manager's formation (4-3-3, 4-4-2, 4-2-3-1 or 3-5-2; `src/engine/selection/formations.ts`) with the shared selection in `src/engine/selection/lineup.ts`, which background results and career selection also use. A player's value in a slot is ability × (0.8 + 0.2 × fit / 100): fit 100 in the primary position, familiarity in a secondary one, 0 otherwise (`CONFIG.selection.unfamiliarFactor`). The best keeper keeps goal; outfield slots fill best value first across the team, ties to better fit, the earlier slot, then the lower id; keepers never play outfield. The career player takes their best slot first. Team strength uses the starters' slot values; `matchLevel` is the mean ability of all 22 starters. A setup without `formations` (worlds before they adopt formations, and sessions saved by `match-7`) keeps the earlier 4-3-3: best goalkeeper, then for each slot the highest positional fit, ties by ability, then id, the selected player replacing the weakest starter in the closest compatible slot, and strength from plain abilities. The 10,000-match calibration passes with formations.

## Expected goals and personal tactics

`[λh, λa] = expectedGoals(strengthHome, strengthAway, neutral)`, then personal tactics apply bounded adjustments and the result is rounded to six decimals:

- Risk scales the total: low × 0.95, high × 1.06.
- Mentality moves the selected team's share of the total by ±0.03; roles add their own small share (`cut-inside`/`push-forward` +0.01, `track-back`/`hold-position` −0.01). The share is bounded to 0.10–0.90.

The captain's `push` moves mentality one step towards attacking and `calm` one step towards defensive (bounded). A half-time role request picks the first role from that position's half-time list that differs from the current role. Both recalculate expectations.

## Background minutes

Each minute each side has a shot chance of `rate / 0.12` with `rate = λ × (1 − replaced) / 90` (bounded to 0.2) and converts a shot with 0.12. While the selected player is on the pitch `replaced` is their positional share (`CONFIG.match.shares`, [own attack, opposition attack]):

| Position | Attack share | Defence share |
| -------- | ------------ | ------------- |
| ST       | 0.55         | 0.04          |
| LW/RW    | 0.42         | 0.05          |
| AM       | 0.40         | 0.05          |
| CM       | 0.26         | 0.12          |
| DM       | 0.10         | 0.26          |
| CB       | 0.07         | 0.32          |
| LB/RB    | 0.10         | 0.28          |
| GK       | 0.03         | 0.45          |

After a substitution nothing is replaced. Background scorers are weighted (ST 4, wide/AM 3, CM 2, others 1, never the goalkeeper) and exclude the selected player while their share is active. Routine passes still happen with probability 0.48 per minute and success `clamp(0.68 + passing × 0.002 − fatigue × 0.0008, 0.4, 0.96)`.

## Key moments and situations

Opportunity count: `clamp(8 + involvement + round((form − 50) / 15) ± 1, 6, 15)` with involvement +1 for ST/LW/RW/AM, −1 for goalkeepers, 0 otherwise. Minutes are spread over 4–86 with ±2 seeded jitter and kept strictly increasing.

Each moment draws a situation from `${seed}:situation:${minute}`, weighted by the position's weight and the personal role's multiplier:

| Situation       | Positions (weight)                        | Attack / defence weight | Choices                                    |
| --------------- | ----------------------------------------- | ----------------------- | ------------------------------------------ |
| `box-chance`    | ST 3.5, LW/RW 2.5, AM 2, CM 1             | 1 / 0                   | near post, far post, square pass, take on  |
| `build-up`      | LW/RW 4, AM/CM 3.5, ST 2, LB/RB 1.5, DM 1 | 0.15 / 1                | through ball, cross or switch, carry       |
| `edge-of-area`  | AM 3, CM 2.5, ST/LW/RW 2, DM 0.5          | 0.4 / 0                 | long shot, lay off, drive inside           |
| `aerial-chance` | ST 2.5, LW/RW 1, CB 0.6, AM/CM 0.5        | 0.6 / 0                 | header, control and shoot, cushion         |
| `defend-attack` | CB 5, LB/RB/DM 4, CM 1.5                  | 0 / 1                   | intercept, tackle, jockey                  |
| `build-out`     | CB/DM 3, LB/RB 2.5, CM 1.5                | 0.15 / 0.35             | short pass, clear long, carry out          |
| `shot-incoming` | GK 4                                      | 0 / 1                   | hold, parry                                |
| `one-on-one`    | GK 2                                      | 0 / 1.4                 | rush, stay on line                         |
| `cross-ball`    | GK 2                                      | 0 / 0.6                 | claim, punch, stay on line                 |
| `distribution`  | GK 2.5                                    | 1 / 0.15                | short, long (non-defensive: no shot faced) |

Role multipliers, e.g. `hug-touchline` build-up × 1.6, `cut-inside` box × 1.3 and edge × 1.4, `target-player` aerial × 2, `sweeper-keeper` one-on-one × 2, `shot-stopper` shot-incoming × 1.5. Roles also give listed choices an odds multiplier of 1.12; `track-back` and `hold-position` multiply the danger of failed choices by 0.85.

Role lists per position family (single source for the preview, validation and half-time): keeper `balanced, sweeper-keeper, shot-stopper, safe-distribution`; defence (CB/LB/RB/DM) `balanced, hold-position, ball-winner, push-forward`; wide (LW/RW) `balanced, hug-touchline, cut-inside, track-back`; central (CM/AM/ST) `balanced, playmaker, run-behind, target-player`. `createMatchSession` rejects any other role.

### Moment budget

A moment replaces part of the expected goals removed from the background:

`budget.for = λown × attackShare × attackWeight(s) / (N × Σ P(s′) × attackWeight(s′))`, and the same with `λopp`, the defence share and defence weights for `budget.against`, where `P` is the player's situation probability. Over a full match the expected budgets sum to `λ × share` for each side, so totals stay calibrated whatever the situation mix.

### Choices: probability, stakes and fairness

For each choice with governing attributes `w` (weights sum to 1; keeper attributes read `keeperAttributes`):

- `relative = Σ w × attribute − matchLevel`
- attribute odds multiplier `clamp(1 + relative × 0.02, 0.5, 1.6)`; impact multiplier `clamp(1 + relative × 0.01, 0.7, 1.3)`
- expected goals at the reference player: `F = forShare × budget.for`, `G = againstShare × budget.against × (0.9 if the choice faces an attacker)`. The 0.9 defensive edge makes every defensive choice concede less than the background expectation it replaces.
- Reference probability `r`: direct shots `F` (success is the goal); direct saves `1 − G` (failure is the goal conceded); otherwise the catalogue base with team odds `clamp(1 + (ownStrength − oppStrength) × 0.012, 0.75, 1.3)`.
- Stakes: goal after success `F / r × impact × riskImpact`, conceded after failure `G / (1 − r) / impact × relief × riskImpact` (second balls after a successful parry or punch use the same rule with the 30 % success-side split). Conversions are bounded to 0.95.

The displayed probability starts from `r` (team odds excluded for direct choices) and applies odds multipliers `p′ = p × M / (1 − p + p × M)` in a fixed order, each step rounded to six decimals and shown as a factor: opposition (team odds × direct-opponent matchup `clamp(1 − (opponentAbility − matchLevel) × 0.006, 0.85, 1.15)`), attribute, trait (× 1.2 when `player.traits.includes(traitId)`), fatigue (`1 − max(0, fatigue − 25) × 0.006`, at least 0.6), role (× 1.12), risk (non-direct only: low odds × 1.1 / impact × 0.92, high odds × 0.9 / impact × 1.1), conditions. The probability is bounded to 0.02–0.97 (direct shots 0.6) and any bound appears as the limit factor, so factors always sum exactly to the probability.

Conditions multiply odds by `1 + effect`: technical choices rain −0.06, snow −0.10 and `−max(0, 70 − pitch) × 0.004`; direct choices (crosses, long balls, long shots, headers, claims, punches) wind −0.08, snow −0.05, rain −0.02. The preview shows both effects.

Because conversions are anchored to `r`, a player whose governing attributes equal the match level gets exactly `F` goals for and `G` against from every choice in a situation; choices differ in variance (a shot's failure never concedes; a failed carry or short pass can). Better attributes raise both the success probability and the goal impact. Measured analytic values (λ 1.45/1.30, N = 10, equal teams, neutral conditions; probability and expected goals for/against):

| Player | Situation (budget for/against) | Attributes 40                               | Attributes 60                      | Attributes 80                               |
| ------ | ------------------------------ | ------------------------------------------- | ---------------------------------- | ------------------------------------------- |
| ST     | box-chance (0.131/0)           | near post 8 % 0.083; square 61 % 0.088      | all choices 0.131/0 (shots 13 %)   | near post 17 % 0.174; take on 53 % 0.186    |
| ST     | build-up (0.020/0.026)         | through 33 % 0.011/0.040                    | all choices 0.020/0.026            | through 53 % 0.028/0.018                    |
| ST     | edge-of-area (0.052/0)         | long shot 3 % 0.032                         | all 0.052 (long shot 5 %)          | long shot 7 % 0.072                         |
| CB     | defend-attack (0/0.059)        | intercept 38 % 0/0.083; jockey 68 % 0/0.097 | all 0/0.053                        | intercept 58 % 0/0.037; jockey 83 % 0/0.034 |
| CB     | build-out (0.016/0.021)        | short 79 % 0.012/0.035                      | all 0.016/0.019                    | short 90 % 0.020/0.012                      |
| GK     | shot-incoming (0/0.073)        | hold 89 % 0/0.105                           | hold 93 %, parry 95 %: all 0/0.066 | hold 95 % 0/0.048                           |
| GK     | one-on-one (0/0.103)           | rush 47 % 0/0.152                           | rush 60 %, stay 91 %: all 0/0.092  | rush 68 % 0/0.062                           |
| GK     | distribution (0.018/0.011)     | short 84 % 0.014/0.019                      | all 0.018/0.010                    | long 63 % 0.025/0.007                       |

Each choice uses its own roll stream `${seed}:decision:${minute}:${momentId}:${choiceId}`, so alternatives at one moment never share a roll. Follow-up chances become a recorded shot with probability `min(1, goal / 0.3)` and a goal conditionally, so every goal still has a shot. Keeper moments log a `save` event; only a shot that is actually taken (direct saves, or a conceded chance after a failure or second ball) is recorded for the opposition, and distribution moments face no shot.

## Rating

Match-21's rating (match-22's is in [Believable ratings and statistics](#believable-ratings-and-statistics-engine-match-22-release-10-step-53)). Rating starts at 6.3. Decisions are expected-value-neutral: success adds `0.6 × (1 − p)`, failure subtracts `0.6 × p`, credited to the choice's family (shooting, passing, dribbling, defending, goalkeeping). Outcome bonuses: goal +0.6 and assist +0.6 (equal so finishing and creating choices with equal expected goals are rating-neutral), saves and defensive stops `1.5 × G / p` on success (expected value `1.5 × G` for every choice in the situation), and −0.45 for every goal conceded from the player's own moment. The live rating is bounded to 3–10; the report lists the base, each non-zero part and a limit-and-rounding factor that makes the factors sum exactly to the one-decimal report rating.

Performance XP is `round(minutes × 1.2 + max(0, rating − 6) × 25 + goals × 30 + assists × 20 + completedObjectives × 15)`. Fame is `round(max(0, rating − 6.5) × 2 + goals × 2)`. Friendlies calculate these values without granting progression.

## Time, fatigue, substitutions, momentum and possession

Fatigue increases each played minute by `0.48 × (1.3 − stamina / 150)`, plus 0.08 under high risk; half-time recovers 8. The only substitution trigger is fatigue ≥ 82 from minute 65 up to minute 89 (fatigue starts from the player's own condition); no substitution is triggered at minute 90, and substitution answers are rejected once the match is finished. The replacement is the best-ability bench player in the same position, then a compatible one (secondary familiarity or neighbouring position), then any outfielder; goalkeepers are only replaced by goalkeepers.

Momentum: `50 + round((momentum − 50) × 0.85) + impulses`, bounded 5–95, where each shot is ±4, each goal ±12 and each decision outcome +3 (success) or −2 (failure) for the acting team. Home possession: `round(clamp(50 + (strengthHome − strengthAway) × 0.45 ± 3 (selected mentality) + (momentum − 50) × 0.08, 30, 70))`.

## Statistical gate and calibration

The deterministic benchmark plays 10,000 complete matches with the generated striker: 6,000 equal-reputation fixtures, 2,000 with a 15-point reputation gap and 2,000 with a 45-point gap (squads unchanged), cycling choice indices 0/1/2 and answering every prompt. Recorded on 6 October 2026 (about 11 s):

| Measure                          | Result |
| -------------------------------- | ------ |
| Goals per match, all cohorts     | 2.686  |
| Equal teams: home goals          | 1.441  |
| Equal teams: away goals          | 1.230  |
| Equal teams: home wins           | 42.0 % |
| Equal teams: away wins           | 31.5 % |
| Equal teams: draws               | 26.5 % |
| Away underdog wins, 15-point gap | 27.3 % |
| Away underdog wins, 45-point gap | 18.5 % |

A reputation-only 45-point gap is a 27-point strength gap, for which the background Poisson model itself gives about 18.7 % away wins; real worlds also have an ability gap, which widens it.

Policy fairness: with every footballer in both squads rated 60, 250 seeded matches per "always choose index k" policy give team goals [for, against]:

| Selected | Index 0      | Index 1      | Index 2      | Index 3      |
| -------- | ------------ | ------------ | ------------ | ------------ |
| ST       | 1.512, 1.204 | 1.548, 1.224 | 1.448, 1.212 | 1.508, 1.212 |
| CB       | 1.448, 1.252 | 1.408, 1.188 | 1.380, 1.240 | 1.380, 1.240 |
| GK       | 1.416, 1.244 | 1.396, 1.196 | 1.396, 1.196 | 1.396, 1.196 |

With real generated squads the striker's elite finishing makes shooting worth more than passing (1.53 vs 1.31 goals for always-first vs always-fourth), which is intended specialisation; average ratings per policy stay within 6.68–6.82 for the striker, 6.55–6.65 for the centre back and 6.68–6.72 for the goalkeeper.

Tests enforce: 2.5–2.9 goals, home advantage, 18–35 % draws, close-gap upsets 15–36 %, wide-gap upsets 3–20 % and fewer than close-gap; analytic equality of each situation's choices within ±15 % of the moment budget and no defensive choice above the background expectation; higher success and goal value from 40 to 80 for every choice; policy goal bands within ±12 %; separate roll streams; substitution, captain, half-time role, keeper-save, conditions, momentum/possession, i18n-coverage and engine-version regressions; factor sums and replay determinism. Interactive career fixtures (milestone 4) will feed results back to the world.

## Milestone 4 changes (engine `match-5`)

- **Fixture context.**
  - `MatchSetup.fixture` (`id`, `competitionId`, `importance` 1–2) marks a scheduled career fixture; friendlies omit it.
  - `match.fixtureId` is the real fixture id, and the venue's neutrality comes from the fixture.
  - Importance is league 1, phase 1.1, cup 1.15, playoff tie 1.25, final 1.5. It feeds the Big Game Player skill and career XP.
- **Skill boosts.**
  - Besides a choice's own `traitId`, the `TRAIT_BOOSTS` table maps each skill id to the choices it improves.
  - Any match multiplies success odds by `traitMultiplier` (1.2) once.
  - Big Game Player multiplies every choice's odds by 1.1 in fixtures of importance above 1.
  - The factor appears as the existing "trait" probability factor, so the displayed factors still sum to the probability.
- **Skill-unlocked choices.** Eight choices appear only with a skill and are added only to situations that had fewer than four choices, so keys 1–4 still cover every option:

  | Choice                            | Situation        | Skill                 |
  | --------------------------------- | ---------------- | --------------------- |
  | Disguise a defence-splitting pass | build-up         | Maestro               |
  | Curl it into the top corner       | edge of area     | Curler                |
  | Try an overhead kick              | aerial chance    | Acrobat               |
  | Throw in a sliding block          | defend an attack | Last-Ditch            |
  | Dance away from the press         | build out        | Escape Artist         |
  | Tip it over the bar               | shot incoming    | Cat Reflexes          |
  | Smother it at the striker's feet  | one-on-one       | One-on-One Specialist |
  | Release a quick counter           | distribution     | Distributor           |

  Their expected value is anchored to the moment budget like every other choice. Tests assert each is never weaker than its situation's average and that its advantage over the mean stays below 0.35 of the budget.

- **Assists.** A goal created by the selected player's choice is tagged with `assistId`, so a committed career fixture credits the assist to the right player. Other goals in committed fixtures receive an assist with the background resolver's 78% rule, drawn from the scorer's outfield teammates on the pitch at that minute and never from the selected player, whose assists come only from the session. Each assister is fixed once in the finalized fixture (Phase 1.2).
- **Calibration.** Because generation changed (development version 2), the 10,000-match gate was re-measured: 2.758 goals per match, equal-team home/away goals 1.521/1.225, draws 25.1%, away underdog wins 26.1% at a 15-point and 17.7% at a 45-point reputation gap. All within the asserted bands.

## Morale factor (milestone 6, `match-6`)

Each choice now multiplies its odds by `clamp(1 + (morale − 70) × 0.002, 0.92, 1.08)` after the fatigue factor. It is shown as the "Morale" factor in the choice breakdown. 70 is the average generated morale, so the calibration is unchanged within noise. The 10,000-match run gave:

- **Goals per match:** 2.744.
- **Equal teams:** home 1.509 and away 1.226 goals; home win 44.3%, draw 25.2%, away win 30.5%.
- **Away upsets:** 26.2% at a 15-point gap and 17.7% at a 45-point gap.

The analytic tests pin neutral morale.

## Match motion (engine `match-7`)

Earlier engines placed the ball at a uniformly random point every minute and jittered all 22 players independently around fixed slots, so the pitch view looked erratic and unrelated to the commentary. `src/engine/match/motion.ts` now choreographs every minute, key moment and decision outcome as a continuous passage of play. **Outcomes are unchanged:** shots, goals, decisions and ratings still come from the calibrated model above. Motion uses its own seeded streams (`${seed}:motion:${minute}:${kind}`). The same 200 seeded matches across eight positions gave byte-identical scores, events (except pitch points), key moments, statistics and reports before and after the change.

- **Passages.** Each command that advances play stores `state.motion`: keyframes starting at the frame previously shown. `state.play` carries possession (side, carrier, pending restart) between passages. `state.frames` keeps one end-of-minute snapshot per minute for the heatmap.
- **Team shape.** Each side holds its formation's shape (each slot's in- and out-of-possession point in the catalogue; 4-3-3 keeps the earlier coordinates), which slides with the ball: depth shift 0.55 in possession and 0.5 out of it, lateral shift 0.12 and 0.3, width × 1.05 and × 0.8. Each line has depth bounds, and the back line never drops deeper than two units behind the ball. Every player also has a small stable personal offset.
- **Defending.** The two nearest outfielders press the carrier: one 2.2 units goal-side, one covering 8 units deeper.
- **Offside.** Attackers without the ball stay level with the second-last defender (or the ball) in the opponent's half, including teammates timing a run during a build-up.
- **Speed limits.** Nobody moves faster than 0.0085 units per sporting millisecond (about 9 m/s). Passes take 700 ms plus 60 ms per unit (lofted 1,300 ms plus 55 ms), carries 600 ms plus 170 ms per unit, and shots 250 ms plus 28 ms per unit. Keyframe times are never compressed.
- **Possession.** Passes go to teammates scored by forward progress (scaled by momentum), distance and pressure. The opposition intercepts or tackles with probability `clamp(0.2 × (1 − possession share), 0.04, 0.2)`, × 1.6 in the final third. A minute holds at least three or four ball actions.
- **Events.** A shot is struck by its shooter from a slot-based shooting position after the ball is worked to them, and ends in the net, the keeper's hands, off a defender, wide or over, matching its commentary variant. A decision pass reaches the teammate who takes the follow-up chance; dribbles and tackles beat or dispossess the nearest opponent.
- **Restarts.** Goals lead to a celebration, then a kickoff by the conceding side with both teams in their own halves. Misses lead to goal kicks and parries to corners. At half-time the teams switch ends and the away side kicks off.
- **Key moments.** The scene is built around the selected player at the situation's spot, with the opponent drawn for the odds as the direct opponent: a defender goal-side, a presser on build-out, or the attacker running at you. Decision event points come from the scene and its outcome.
- **Moments.** The selected player's goals keep the keyframes of their move, strike and celebration (`state.highlights`, up to 24; see Moments clips v2 below), and Moments clips are cut from them.
- **Cost.** Motion adds about 4 ms per match in Node. The 10,000-match gate therefore has a 240 s budget.
- **Restarts after goals.** The passage containing a goal ends with the celebration; the next passage, even a quiet minute without events, walks both teams back and takes the kickoff.

## Balance pass B: decisions with trade-offs (engine `match-9`)

The [game design review](GAME-DESIGN-REVIEW.md) found that every choice in a situation had the same expected goals at the reference player, that attacking mentality was a pure buff, and that momentum, substitutions and the half-time talk changed nothing. This pass makes decisions decisions. Saved sessions from `match-8` are discarded on load (the world is kept); Moments keep their stored keyframes.

**Choices differ in what they lead to.** Direct shots differ in risk: `far-post`, `long-shot`, `curler`, `header` and `bicycle-kick` keep 90 / 80 / 85 / 90 / 70% of their expected goals on success and leave the rest as rebounds after a miss (`forOnSuccess`), so a surer finish and an ambitious one are different bets with the same expected value at the reference. A chance made for a teammate converts by the finishers it falls to: `successGoal x clamp(1 + (mean finishing of the best three teammate attackers - own finishing) x 0.005, 0.9, 1.1)`. Risk applies to direct shots (`riskShot`: low x 1.03, high x 0.95 on odds).

**Mentality and roles scale both ends.** `rates()` multiplies [own, opposition] expected goals: attacking [1.08, 1.06], defensive [0.92, 0.90]; `push-forward` and `cut-inside` [1.05, 1.04]; `hold-position` and `track-back` keep only their counter relief (failed choices concede 0.85x). Risk still scales the total (0.95 / 1 / 1.06).

**Momentum and the talk feed the odds.** Every choice carries `1 + (own momentum - 50) x 0.002` (0.9-1.1) as a shown factor. At half-time _motivate_ moves momentum 8 toward the player's side (x 1.5 with the Leader skill) and multiplies second-half odds by 1.03; _complain_ multiplies them by 0.97; a granted role request is neutral. The captain's call with Captain's Voice also moves momentum (push 6, calm 3). The talk's trust delta now reaches the manager relationship after the match.

**Fatigue and substitutions happen.** `fatiguePerMinute` 0.6 (keepers use at least 70 stamina); a player at 75 fatigue comes off from the 65th minute; at 60, 70 and 80 minutes a manager may also replace an outfielder rating below 6 or protect a two-goal lead (8% each). Second Wind slows in-match fatigue by 15%. Measured: 5-8% of outfield matches end with the career player substituted.

**Skills stack and fit their choice.** Each further skill covering a choice multiplies its odds by 1.1 (1.2, 1.32, 1.45 at most). On a choice already at 75% or more the skill sharpens the outcome (x 1.1 on the goal it leads to) instead of its odds. The occasion: in a fixture of importance above 1 every choice is multiplied by `0.9 + big-match temperament x 0.002` (0.9-1.1, a hidden attribute) plus 0.1 with Big Game Player. Consistency (hidden) shifts the player's governing attributes by up to +/- 8 x (1 - consistency/100) per match, drawn by the match seed.

**Goals are shared.** Key-moment shares of the team's attack: ST 0.40, wingers and AM 0.32 (were 0.55 / 0.42 / 0.40). Measured over 300 matches a position: a striker 0.48 goals and 0.12 assists a match, a winger 0.2 and 0.26, an attacking midfielder 0.2 and 0.3.

**Rating.** Stops credit 2.0 (was 1.5); the team's result adds +/- 0.25 and a clean sheet 0.4 for keepers and the back four (`team` part). Measured means: GK 7.0, CB 6.95, ST 6.7, CM 6.5; p90 8.0-8.5; 1-4% of matches rate 9 or more at every position.

**Fame** = 3 x max(0, rating - 6.3) + 1.5 x goals + 1 x assists + 1.5 per clean sheet (keepers and defenders), so a defender's good game counts.

**Objectives.** A rating target of 7 and one objective drawn for the position each match: keepers a clean sheet or 5 saves; defenders a clean sheet, 3 tackles or a passing rate; defensive midfielders a passing rate, 2 tackles or a clean sheet; central midfielders a passing rate or an assist; attacking midfielders a passing rate, an assist or 3 shots; strikers a goal or 5 shots; wingers a goal, 3 shots or an assist. The passing target is the player's routine completion (`0.68 + passing x 0.002`) minus 3 points, within 65-90. Measured completion 21-65% by kind (300-match profile).

**Headless matches choose like a player.** `autoPlayCommand` draws, by the moment's seed, among the choices within 0.02 expected goals of the best (`autoPlayMargin`), so simulated careers shoot, pass and carry rather than always making the single best call; wingers and attacking midfielders now score in simulated seasons.

**Minutes teach positions.** Ninety minutes in a secondary slot add 3 familiarity (`familiarityPerMatch`).

**Gate.** `npm run profile:match` (`scripts/match-profile.ts`) plays 300 matches a position with the best policy, and the worst on a specialised profile, and asserts: striker 0.35-0.55 goals a match; keeper p90 rating at least 7.6 and every position reaching 9; every objective kind 14-75% complete; outfield substitutions 4-25%; an attacker's goal involvement at least 25% higher under the best policy than the worst; stated odds within 7 points of actual over 100 decisions and 4 over 500 (sampling noise; a direct probe of 36,000 seeded rolls showed no bias).

## Balance pass D (engine `match-10`)

Chemistry with teammates scales a created chance for them (`successGoal × clamp(1 + (chemistry − 60) × 0.004, 0.85, 1.15)`, from `MatchSetup.chemistry`); morale's factor is `1 + (morale − 65) × 0.004` within 0.88–1.12. Saved sessions from `match-9` are discarded on load.

## Connected systems phase 0 (engine `match-11`)

**Moments follow the slot.** A setup with `slotMoments` (every new setup in a world on formation-aware selection) draws key moments by the situation weights of the formation slot the selected player fills (`FORMATION_SLOTS[formation][index]`), not their primary position, and budgets the moment from the same weights. A striker fielded at centre-back faces defensive moments. Roles, goal shares, objectives and the rating's back-line terms still follow the primary position.

**Out of position.** In a slot other than the primary position, the player loses `(100 − familiarity) × positionPenalty` attribute points (0.1, so familiarity 40 costs 6), applied as its own odds step after the attribute factor: `× clamp(1 − penalty × attributeSlope, attributeMinimum, 1)`. It appears in the breakdown as "Out of position" and is absent in the player's own position.

**Compatibility.** Sessions saved before (`match-10`, no `slotMoments`) still replay as they were; `engineFor(setup)` picks `match-11`, `match-10` or the earlier `match-10-lines` from the setup, and a session may not claim another engine.

**Placement.** A selected player is put in their best slot by fit (`selectLineup`); among equal fits they now take a slot in the line they naturally play in. Before, a winger with no familiarity anywhere in a 3-5-2 was fielded at centre-back (the first outfield slot), drawn there on the pitch and taught centre-back familiarity by those minutes.

**Profile.** `scripts/match-profile.ts` fields each position in a formation that has a slot for it (an attacking midfielder is not measured at striker), and counts goals for and against from the profiled club's actual side (it is always at home; the tallies used to alternate sides). All six gates hold on `match-11`: striker 0.39 goals a match (the same as `match-10` on this world; the 0.51 recorded under pass D predates later changes), wingers 0.17 goals and 0.28 assists, every objective kind 10–75%, attacker involvement best/worst ×1.19–1.59, odds within tolerance.

## Engagement pass 1: moments that follow the game (engine `match-12`)

The [engagement review](ENGAGEMENT-REVIEW-2026-10-09.md) found key moments that never reacted to the game: ten situations with one sentence each, minutes fixed evenly from 6′ to 84′, no set pieces and the same three headlines. Constants are `CONFIG.match.drama`; new setups carry `dramaMoments`.

**The late moment.** The last of a match's moments is provisionally at 82′ (`routineLateMinute`). On reaching 80′ (`lateDecisionMinute`), if the selected side is within a goal (`closeMargin` 1) it moves to a minute drawn from 86–89′ (`lateMinutes`). The count is unchanged, so moment budgets are too. Measured: the last moment comes at 85′ or later in 64–72% of matches (38–46% before), every close game included.

**The score weights the pool.** From 60′ (`tiltFromMinute`) a side behind sees attacking situations (`phase: 'attack'`) × 1.6 (`tilt`), a side ahead defending ones. Budgets are normalised by the same tilted weights, so the tilt moves where goals come from, not how many a match expects.

**Set pieces and last-ditch moments** (`drama: true` in `situations.ts`; earlier engines never draw them):

| Situation    | Positions (weight)               | Budget weight            | Choices                                                           |
| ------------ | -------------------------------- | ------------------------ | ----------------------------------------------------------------- |
| Penalty      | ST 0.2, AM 0.12, W 0.05, CM 0.03 | attack 10                | power, corner, chip (Chip Specialist); fixed 0.76 goal, up to 92% |
| Free kick    | AM 0.25, W/CM 0.15, ST 0.12      | attack 0.6               | curl, drive, short                                                |
| Corner       | W/AM 0.25, CM 0.2, FB 0.12       | attack 0.35, defence 0.2 | inswinger, near-post run, short                                   |
| Goal-line    | CB 0.3, FB 0.2, DM 0.15          | defence 12               | clear off the line, body block, lunge (Last-Ditch)                |
| Offside line | CB 1.2, FB 0.6, DM 0.4           | defence 0.8              | step up, drop off, track the runner                               |
| Penalty save | GK 0.2                           | defence 17               | read and dive, stay big; fixed 0.76 against                       |

A penalty is a penalty against any side: `ChoiceTemplate.fixed` sets its goal probability at the reference player whatever the budget (its weight keeps the average budget about the same), and `maximum` lifts the shot cap from 0.6 to 0.92. A set-piece taker carries more of the team's attack: the attacking share rises by the set pieces' share of the position's attacking weight, at most × 1.3 (`setPieceShareCap`), and the background plays correspondingly less, so open-play moments keep their value and match totals hold.

**Framing.** Each situation has three sentences (`situationVariants`) naming the drawn keeper, defender or attacker, a teammate and the opposition; late in a close game a pressure line says what is at stake ("Level, 87th minute. This could decide it."). A goal from 85′ that levels the game or puts a side ahead has its own commentary. Wording is drawn from its own seed stream and never moves a roll.

**Report.** The headline is chosen by the story of the match (late winner or equaliser, hat-trick, brace, saved penalty, goal in a win/draw/defeat, two assists, a clean-sheet wall, rout, thrashing, two errors in a defeat, otherwise by result and rating) with three wordings each and names filled in (`headlines.ts`); manager and fan reactions are keyed by result × performance (star from 7.3, poor below 6.3).

**Measured.** Goals per match with and without the pass agree within 0.1 on 500-match samples per position. All six `profile:match` gates hold: striker 0.49 goals a match (penalties included), keepers p90 8.5, every objective kind 10–75%, attacker involvement best/worst ×1.18–1.34, odds within tolerance. Penalties: a striker takes ~0.16 a match and scores 64–88% depending on the player; keepers save 23–29%; a centre-back meets a goal-line moment every third match and keeps it out ~64% of the time.

**Compatibility.** Sessions saved on `match-11` replay as they were; `engineFor` picks `match-12` only for setups with `dramaMoments`.

## Engagement pass 2: big occasions (engine `match-13`)

New setups carry `occasions`; `engineFor` picks `match-13`, and sessions saved on `match-12` replay as they were.

**Chained moments.** When a striker, winger, attacking or central midfielder wins a dribble (`event: 'dribble'`, `scorer: 'self'`) in the slot they play, the chance it opened up is no longer a hidden roll: the shot itself follows in the same minute as a `box-chance` moment whose budget is the dribble's `successGoal` (so a reference player realises the same expected goals, and a good finisher more). A chained moment never chains again. It replaces the minute's replay frame, so a match still has one frame a minute (`KeyMoment.follows`).

**The shootout kick.** A career fixture that goes to extra time and penalties when level carries `fixture.shootoutLead` (the home side's aggregate lead from earlier legs, 0 for a single match; absent in leagues, group games and ties settled by rank). Level on aggregate at full time, the player is asked for their kick (`penalty`, a fixed 0.76 goal) or, in goal, their plan against the takers (`penalty-save`), unless substituted. The kick never changes the score. If extra time does not separate the sides, the finalized shootout's home win chance moves from 0.5 by ± `background.shootoutKick` 0.15 toward the side whose player scored or saved, against it when they missed or were beaten. The report says which.

**Headlines.** A final (importance 1.5) or a derby (both clubs in one city) won or lost has its own story (`final-won`, `final-lost`, `derby-won`, `derby-lost`, three wordings each), after a late winner or a hat-trick. The crowd bed is 25% louder for cup ties, finals and derbies.

**Demand the ball.** The half-time "Challenge the instructions" becomes "Demand the ball": the attacking share × 1.25 for the second half (at most 0.6), costing 3 manager trust, with no sulk on the odds (`decision.talk.demand`). Before, it was strictly worse than motivating.

**Ratings reward quality.** Decision credit was `weight × (1 − p)` on success and `−weight × p` on failure, and a stop earned `stop × danger / p`: measured against the player's own odds, both average the same for every player, so an elite defender rated like an average one (in a probe, an 85-rated centre-back among 31-rated defenders averaged 6.83, the league's defenders 6.81). On `match-13` both are measured against the reference player's odds (the choice's base probability): credit averages `weight × (p − reference)`, and a stop `stop × danger × p / reference`. An average player rates as before; the same centre-back now averages 7.63 and leads the league's defenders.

**Calibration gate.** The fixed margins (7 points over 150 decisions, 5 over 500) are replaced by a sampling test (`scripts/calibration.ts`): each bucket of 100 or more decisions within three standard errors of its stated odds plus a point of rounding, and all of a profile's decisions pooled within three standard errors. With a hundred buckets, the fixed margins failed on noise (2.2σ each); the pooled test, with a standard error under a point, is the sharper check for bias.

**Measured** (300 matches a position): all six gates hold. Striker 0.50 goals a match; involvement best against worst ×1.25–1.85 for attackers (the chained shot rewards beating a defender); pooled stated and actual odds within a point for every position.

## Choreography annotations and bookkeeping (engine `match-14`)

Redesign phase 5 (steps M0, M1 and M6 in [REDESIGN-IMPLEMENTATION.md](REDESIGN-IMPLEMENTATION.md)) makes the pitch readable and the live stats real without touching the outcome layer. **Outcomes are unchanged:** `tests/match-outcome-snapshot.test.ts` plays 200 seeded matches across eight positions (varied roles, tactics, choice policies, the legacy 4-3-3, slot moments, cup fixtures with shootouts and captaincy) and hashes the score, every event (kind, team, player, minute, commentary, assist, decision outcome), every key moment's choices with their probabilities and factors, the existing stats, the rating parts and the report. The hashes captured on `match-13` hold byte-identical on `match-14`, and the 10,000-match gate prints the same numbers (goals per match 2.6594). Every phase-5 step must keep them; phase 6 re-gates them deliberately.

**Version.** `MATCH_ENGINE_VERSION` is `match-14` for setups with `occasions`; the earlier engine paths keep their names and rules. Replayed state gained fields on every path, so a session saved before (no `stats.xg`) throws `OutdatedMatchSessionError` whatever its engine, and the save keeps the world and restarts the fixture from its seed.

**Beats.** Every keyframe after a passage's first carries `ReplayFrame.beat`: the ball action between the previous keyframe and this one (`kind`, `actorId`, `receiverId` on a completed pass, `eventId` when it plays an engine event, `pattern` when part of a recognised move, `zone` and `flank`).

- Passes between teammates are named by shape (`Director.passKind`): `cross` from wide (outside the central third of the width) in the final third into the box (depth ≥ 80, within 25 of the centre line); `cutback` when that ball is played low from the byline (depth ≥ 85) back to depth 72 or more; `switch` a lofted ball (or a cross hint) moving 45 or more across; `through` a forward through ball; `long` any other lofted ball; `pass` otherwise. A pass taken by an opponent is that opponent's `intercept` (a keeper claiming a cross is a `save`).
- `carry` gains ground; `dribble` takes the ball past a defender (take-on, drive inside, escaping the press, beating a defender who failed to stop you).
- `shot` or `header` on the strike keyframe: a header is a shot met first time from a cross to the shooter (an overhead kick stays a shot). A parry or punch adds the keeper's `save`, a block the defender's `block`, a goal its `celebration`. A caught shot ends in the keeper's hands (`carrierId`).
- `tackle`, `intercept` (also loose balls won), `block` (body block, sliding block), `clearance` (cleared off the line), `restart` (the dead ball being placed for a kickoff, goal kick, corner, penalty or free kick).
- `zone` (`def`, `mid`, `final`: thirds of the depth) and `flank` (`left`, `centre`, `right`: thirds of the width) are taken where the actor plays the ball, or where they win it for tackles, interceptions, saves and restarts, in the actor's team's attacking direction.
- Counter-attacks (a shot from a `counter` commentary line) tag their build-up `pattern: 'counter'`; the pattern library (M2) sets `Director.pattern` the same way.
- Per-minute snapshots (`state.frames`, `KeyMoment.frame`) drop the beat; the most recent beat travels in `PlayState.last`, so a passage can tell a header from a shot. Beats live in the current passage (`state.motion.frames`) and in goal highlights.

**Events** played on the pitch gain `action` (the beat kind; a failed pass keeps its intended shape), `zone`, and `receiverId` on completed passes. **Focus:** an outcome passage sets `MatchMotion.focus {start, end}` (inclusive keyframe indices) from where the chosen action starts to the end of what the decision led to (its follow-up shot or the counter it conceded, a goal's celebration).

**Stats** (bookkeeping only; no random draws):

| Field                    | Rule                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `stats.xg` [home, away]  | Sum of `MatchEvent.xg` over recorded shots: background shots `shotConversion` (0.12); a key-moment shot its choice probability; a shot faced in a keeper or goal-line moment 1 − the choice probability; a created chance its goal probability given the shot, `p / min(1, p / chanceConversion)` (so expected xG equals the chance's `p`). Rounded to six decimals. The shootout kick is not a shot. |
| `stats.shotsOnTarget`    | Shots shown ending in the net or the keeper's hands (goal, catch, smother, parry, punch, a claimed cross).                                                                                                                                                                                                                                                                                            |
| `stats.keyPasses`        | The selected player's completed decision passes followed by a teammate's shot in the same command.                                                                                                                                                                                                                                                                                                    |
| `stats.tacklesAttempted` | Decisions counted as tackles, won or lost (`tackles` keeps those won).                                                                                                                                                                                                                                                                                                                                |
| `stats.distanceM`        | The selected player's movement across the shown keyframes (`span` × 1.05 m a length unit, half-time resets excluded), to 0.1 m. About 13 minutes of play are shown a match, so a full match reads 1.5–5 km.                                                                                                                                                                                           |
| `stats.touches`          | Beats in which the selected player plays, receives or wins the ball (restarts and celebrations excluded).                                                                                                                                                                                                                                                                                             |
| `state.ratingByMinute`   | The live rating at the end of each played minute, to two decimals (90 values; the report's team part comes after).                                                                                                                                                                                                                                                                                    |
| `state.heat`             | 20 × 13 cells (`HEAT_COLUMNS`, `HEAT_ROWS`; about 5 m square), row-major, milliseconds the selected player spent in each, sampled every 5 length units along each keyframe span and mirrored so their team attacks towards x = 100 in both halves. It sums to the time shown. The report's heatmap draws it; `MatchReport.heatmap` keeps the per-minute samples for older sessions.                   |

The live stats panel shows `stats.xg` instead of the pre-match expectation pro-rated by the minute.

**Moments clips v2 (M9).** Goal highlights are cut by `engine/match/highlight.ts` (`cutHighlight`) instead of keeping the last 12 keyframes. Walking back from the strike (the celebration stays at the end), the move starts at the keyframe where the scoring side last took the ball: the latest beat by the other side (tackle, interception, save, a pass that went astray), a celebration or a `reset`; or one keyframe before a `restart` the scoring side takes. When the beats leading to the strike carry a `pattern`, the move starts one keyframe before the first contiguous beat of that pattern. At least the keyframe before the strike is kept, and at most 24 keyframes (`HIGHLIGHT_FRAMES`), keeping the end. Frames without beats (older engine paths) keep the last 12. The cut is presentation only: outcome hashes and the 10,000-match gate are unchanged, and `MATCH_ENGINE_VERSION` stays `match-14` (sessions saved by an unreleased build of this phase between M6 and M9 would no longer replay identically).

The clip codec (`engine/career/honours/clip.ts`) writes version 2: a 33-byte header (version, frame count, scorer index, pattern, both kits' second colours, 22 × side bit and shirt number, name count), up to eight short names (player index, length, up to 24 UTF-8 bytes), then 51 bytes a keyframe (step in 20 ms units up to 5.1 s, ball x and y, ball motion with the lofted ball's apex in the high nibble, carrier, beat kind, beat actor, 22 × x and y). Positions cover −5 to 105.9 so the ball in the net stays in the net. A beatless keyframe (a decision pause) is capped at 0.8 s. The longest clip is 1,465 bytes (`CLIP_MAX_LENGTH` 1,954 characters) and the longest share link with 80-character names and a 256-character seed stays under 4,200 characters, inside the viewer's 6,000-character limit. Version 1 clips (positions only, up to 12 keyframes) still decode and replay at 0.9 s a keyframe; v2 clips replay through `screens/match/playback.ts` at 3 sporting seconds a second, capped at 9 s.

**Cost and size.** Motion costs about 4 ms a match in Node (`npm run profile:match` prints it per position and gates it at 10 ms). A saved session grows by about 5 KB (310 → 315 KB): event annotations 3 KB, the heat grid and rating line 1.5 KB, beats in the current passage under 1 KB.

### Patterns and narration (still `match-14`)

Redesign steps M2 and M3 make the build-up read as football and say what it shows. Both are choreography only: the outcome snapshot and the 10,000-match gate are unchanged, and `MATCH_ENGINE_VERSION` stays `match-14` (nothing shipped between the steps).

**Pattern library** (`src/engine/match/patterns.ts`). A move is planned as concrete steps (passes to slot roles, carries, a run while the carrier holds the ball) in the attacking team's frame, authored down the left and mirrored for the right. `motion.ts` plays the steps through its usual `passTo`, `carry` and `intercept`, so sprint speed, the offside line (runs are held onside until the ball is played), pressing and spacing all still apply, and tags each beat with `pattern`.

| Pattern        | Steps                                                                                                                                                                                           |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `wing-play`    | Full-back (or wide midfielder) → winger down the line (d 64–72) → carry towards the byline (d 80–85) → cross to the finisher at the near post (d 88–91, w 40–46) or far post (d 86–90, w 55–62) |
| `overlap`      | Winger receives (d 60–68), checks inside and holds it while the full-back overlaps outside (run to d 80–85, w 4–9) → ball down the line → cross, or byline and cut-back                         |
| `switch`       | Midfielder on the far side (w 65–76) → lofted diagonal to the near touchline (w 6–14) → attack down that side and cross                                                                         |
| `through-ball` | Midfielder in the middle third → ball 5–11 beyond the offside line **as it stands when played**, in the runner's channel → the runner bears down on goal (d 84–89)                              |
| `counter`      | Straight from the regain: at most one ball out to a runner and one in behind (≤ 2 passes), then the run on goal                                                                                 |
| `cut-back`     | Wide player (d 70–78) → dribble to the byline (d 90–94, w 12–22) → low ball back to the penalty-spot area (d 80–87, w 42–58)                                                                    |
| `long-ball`    | Keeper or back line → lofted ball to the target man (d 62–72) → knock-down to a runner (3–8 deeper)                                                                                             |
| `recycle`      | Back and across (6–14 deeper, then to the other side) before going again; a midfielder's shot then comes from the edge of the box                                                               |

**Choosing a pattern** (deterministic, on the motion stream). `planMove` weights the patterns by what the move is for and who finishes it, then multiplies by the club's playing style and formation, and drops patterns the shape or the state of play cannot support:

- _Shots_ by the finisher's slot role. Strikers: wing play 3, through ball 3, cut-back 2, overlap 1.5, switch 1, long ball 1. Wingers: through ball 2.5, wing play 2 (arriving at the far post from the other wing), switch 2 (to their wing), cut-back 1. Midfielders: cut-back 3, recycle 2.5, through ball 1.5, switch 1, wing play 1. Defenders: wing play 4 (the far-post header), cut-back 1, recycle 1. A wide teammate already on the ball deep in the final third crosses or cuts back (2 : 1).
- _Counters:_ a shot from a `counter` commentary line, or a `quick-release` decision, always plays `counter`; a side that has just won the ball may counter in ordinary play.
- _Key-moment scenes_ by situation: box chance (through ball or cut-back), build-up (switch, wing play, an overlap for full-backs, recycle), edge of the area (cut-back, recycle), aerial chance and opposition crosses (wing play), one-on-one (through ball), defending an attack (counter, wing play, recycle). Penalties, free kicks, corners and the keeper's distribution keep their set-ups.
- _Decision passes_ by choice: `through-ball` and `disguised-pass` play `through-ball`; `cross-switch` is `wing-play` from wide in the final third and `switch` elsewhere; `square-pass` from the byline is a `cut-back`; `clear-long` and `long-distribution` are `long-ball`; `quick-release` is `counter`; `short-pass`, `short-distribution`, `lay-off` and `cushion` without a shot are `recycle`. A follow-up shot is set up by the move: a cross to the far post, the knock-down, the run on goal after a ball in behind.
- _Ordinary possession:_ half of the filler passages start with a move without a finisher (recycle 3, switch 2, long ball 2, wing play 1.2, overlap 1, through ball 0.7, cut-back 0.6, counter 2 after a regain); its final ball into the box is cut out 60 % of the time.
- _Style:_ possession ×2 recycle, ×1.5 switch, ×1.3 cut-back, ×0.3 long ball; direct ×3 long ball, ×1.5 wing play, ×0.4 recycle; press ×1.5 through ball and counter; counter ×2.5 counter, ×1.5 through ball, ×0.5 recycle. _Formation:_ 4-3-3 ×1.3 overlap; 4-4-2 ×1.5 long ball, ×1.2 wing play; 4-2-3-1 ×1.2 through ball and cut-back; 3-5-2 no overlap (no full-backs), ×1.3 wing play.

Crosses are lofted 60 % of the time; a lofted cross met first time is a header, a low one is struck. A ball in behind is weighted for the runner (it waits for them) and is only a `through` beat when it lands beyond the line; otherwise it is an ordinary pass. In a sample of 24 matches, about 20 % of shots and of goals are headers.

**Narration** (`src/engine/match/narration.ts`, copy in `src/i18n/narration.ts`). After each passage, its pattern runs become lines in `state.narration` (`NarrationLine`: `minute`, `frame` (the keyframe in that passage), `key` `match.narration.<family>.<variant>`, `params`, optional `eventId`). Families: `cross.header.near|far`, `cross.shot`, `cross.found`, `cross.cut`, `cutback.shot`, `cutback`, `cutback.cut`, `through`, `through.cut`, `switch`, `overlap`, `long-ball`, `counter.release|win|run`, `recycle`, four variants each. Params: `player` and `receiver` are player ids (in the `…cut` families the passer and the opponent who cut it out), `flank`, `zone`, `post`, `pattern` are descriptors.

- A move that leads to a shot or plays a decision gets its two most telling lines, tied to that event (`eventId`); the UI shows them just before the event's commentary.
- Ordinary build-up gets at most one line a passage: 45 % of minute passages that play a move, half of outcome passages, every key-moment build-up; recycling at half those rates. About 30 lines a match (6 KB of saved session), roughly half tied to events.
- Variants come from `${seed}:narration:${minute}:${kind}:${index}`, never the `:commentary` stream, and existing `commentaryKey`/`commentaryParams` are untouched. `MatchMotion.narrationStart` says where the current passage's lines begin. A session saved without `state.narration` is outdated (`OutdatedMatchSessionError`) and restarts from its seed.
- The UI calls `narrationFeed(session, shown?)` for display lines in order (names as surnames, flank words translated); lines of the passage now playing appear once playback reaches their keyframe (`shown`).

**Cost.** Narration is timed inside the motion probe. Motion plus narration costs about 5.4–6 ms a match in Node (narration about 0.55 ms of it; before the patterns, motion was about 4.4–5.3 ms on the same machine), within the 10 ms gate. Patterns add about 10 % more keyframes a match.

## Decisions on the pitch (engine `match-15`)

Redesign phase 6 (steps M4, M5, M7 and M8 and decision 3 in [REDESIGN-IMPLEMENTATION.md](REDESIGN-IMPLEMENTATION.md)) changes outcomes by design, one step at a time, each re-gated against the 10,000-match test, the fairness tests and `npm run profile:match`. The rules apply to the current engine path (setups with `occasions`); the earlier paths (`match-10-lines` to `match-13`) keep theirs, checked byte-identical against `match-14` after every step. `MATCH_ENGINE_VERSION` is `match-15`: a session saved by `match-14` fails validation with `OutdatedMatchSessionError`, and the save keeps the world and restarts the fixture from its seed.

Distribution of the 10,000-match gate after each step (`goalsPerMatch` / `homeWin` / `draw` / `closeUpset` / `wideUpset`):

| Step                | Goals  | Home win | Draw   | Close upset | Wide upset |
| ------------------- | ------ | -------- | ------ | ----------- | ---------- |
| `match-14` baseline | 2.6594 | 0.423    | 0.2602 | 0.224       | 0.087      |
| M4 cast and targets | 2.6507 | 0.4195   | 0.264  | 0.232       | 0.086      |
| M5 Track the runner | 2.6507 | 0.4195   | 0.264  | 0.232       | 0.086      |
| Objectives stream   | 2.652  | 0.4202   | 0.2632 | 0.229       | 0.083      |
| M7 cards and subs   | 2.6527 | 0.4205   | 0.2628 | 0.229       | 0.083      |
| M8 weather, pitch   | 2.6542 | 0.4218   | 0.2625 | 0.2285      | 0.082      |

On `match-15` the equal-team cohort scores 1.450 home and 1.225 away goals (home wins 42.2 %, away wins 31.6 %). Policy fairness (every footballer rated 60, 250 matches per "always choose index k", team goals [for, against]):

| Selected | Index 0      | Index 1      | Index 2      | Index 3      |
| -------- | ------------ | ------------ | ------------ | ------------ |
| ST       | 1.440, 1.296 | 1.468, 1.292 | 1.468, 1.280 | 1.384, 1.280 |
| CB       | 1.400, 1.304 | 1.388, 1.308 | 1.376, 1.272 | 1.376, 1.288 |
| GK       | 1.344, 1.068 | 1.316, 1.144 | 1.316, 1.160 | 1.316, 1.160 |

Every column stays within ±12 % of its mean; CB index 3 is now Track the runner. The analytic fairness tests (each choice within ±15 % of the moment budget, no defensive choice above the background expectation) include Track the runner and the split conditions.

**Profile** (`npm run profile:match`, 300 matches a position): striker 0.49 goals a match, keeper p90 8.6, every position reaching 9, outfield substitutions 6–9 %, attacker involvement best/worst ×1.4–1.8, stated odds honest, and choreography 5.1–5.6 ms a match (motion and narration; 7.6–8.3 ms a whole match), inside the 10 ms budget. The objectives gate first read 76 % for the striker's and the attacking midfielder's shots objective against a 75 % ceiling: over 1,200 matches a striker reached four shots in 73.8 % of matches and an attacking midfielder two in 72.3 %, so the rate sat at the ceiling rather than drifting past it. The targets rose to five shots for a striker and three for other attackers; the 300-match profile now reads 49 % (ST), 43 % (AM) and 32 % (RW), every kind inside 10–75 %. Objectives do not change scores, so the 10,000-match distribution is unchanged.

### M4: the cast and each choice's target

**Cast.** Every key moment carries `KeyMoment.zone` (`def`, `mid`, `final`: the third of the situation's spot) and `KeyMoment.cast` (`MomentCast`): `selected`; `presser` (attacking: the opponent set goal-side of you, drawn for the odds by `contextFor`; defending: the attacker on the ball); `cover` (attacking: the next one or two opponents nearest the ball; defending: the one or two teammates nearest it); `keeper` (theirs when the spot is in the final third, yours in your own third, none when you are the keeper); `free` (the teammates the moment's passes go to); `runner` (attacking: the receiver of a ball in behind; defending: their attacker nearest you, off the ball); `crosser` (the teammate crossing an aerial chance, or their winger on a cross into your box). `scene()` names them after the build-up and moves them towards their marks in the scene's last keyframe, as far as a sprint takes them in its time (covering opponents goal-side of the spot, the runner on the offside line, free teammates a step into space, covering teammates goal-side of the ball; set pieces keep their set-up). Every cast id is on the pitch in the moment's frame.

**Receivers before the choice.** Each pass-type choice (a `pass` event whose chance falls to a teammate) has its receiver drawn on `${seed}:receiver:${minute}` (`:chain` or `:shootout` for a follow-up moment) when the moment opens, like a finisher (strikers 4, other attackers 3, central midfielders 2, others 1; never the keeper or the player), one draw per pass-type choice in catalogue order, locked choices included so the stream never shifts. `resolveChoice` gives a successful pass's chance to that teammate instead of drawing a finisher on the decision stream, so the arrow drawn before the choice points at the player who receives the ball (motion plays the pass to them whatever the move) and takes the chance. Failed shots' rebounds and conceded chances still draw their players on the decision stream.

**The spot's width.** The situation's spot is on the side of the selected player's formation post (`in` width when attacking, `out` when defending) instead of a random mirror, pulled 30 % of the way towards the post in open play (box chance, build-up, edge of the area, aerial chance, defending an attack, building out), plus a jitter of ±4 drawn last on the situation stream, so the situation, the opponents and their abilities are drawn exactly as before.

**Targets.** `DecisionChoice.target` (`ChoiceTarget`): shots at a post (`near-post` the post on the shooter's side, `far-post` and `curler` the other; everything else where the catalogue aims it, `centre`), and the strike goes there; passes to the named teammate (`teammate`, their point in the frame); carries along their lane (`lane`, the carry the outcome plays); challenges on the attacker on the ball (tackles, blocks, rushing out) or the runner (`runner`); and the space an interception, a jockey, a step up or a drop off, a goal-line clearance or a claimed cross goes to (`lane`).

**Camera.** `src/screens/match/cam.ts` uses the engine's cast (labels: pressing, on the ball, covering, free, runner, crossing) and draws one arrow for every targeted choice (shots to a marked near or far post, passes to the named teammate, dotted lanes, solid challenges); the frame-based derivation stays for sessions from earlier engines.

### M5: Track the runner

`defend-attack` gains a fourth choice, appended after the catalogue's others: **Track the runner** (`track-runner`; work rate 0.4, pace 0.3, positioning 0.3; base 0.7; a `tackle` event credited as a tackle, against the attacker; Man Marker is its skill, and Engine, Sprinter and Defensive Wall also help it through the template's own `boostedBy`, so the offside trap's choice of the same name is untouched). Like every choice it is anchored to the moment budget, so at the reference player it concedes the same as intercepting, tackling or jockeying (`decision fairness` asserts it within ±15 % and below the background expectation). It is `latest`: offered only on `match-15`, and only while the moment has fewer than four choices, so a Last-Ditch defender keeps the sliding block in fourth place and keys 1–4 still cover every option. Its target is the runner the cast names; the outcome plays the carrier's ball into the run, cut out by the defender who went with it (an `intercept` beat) or played past one a step behind.

Policy goals [for, against] with every footballer rated 60, 250 matches per index: CB index 3 (now Track the runner rather than a repeat of the jockey) 1.38 / 1.276; the four indices stay within ±12 % of their mean. The 10,000-match gate fields a striker, so it is unchanged. Splitting `cross-switch` into a cross and a switch was optional and is left for later.

### Objectives on their own stream (decision 3)

A match's objectives (the rating target and one drawn for the position, as in Balance pass B) are drawn on `${seed}:objectives:${position}` (`engine/match/objectives.ts`, `objectivesFor`): keyed only by the match seed, which for a career fixture names the fixture (`careerMatchSeed`, `${world.seed}:career:${fixture.id}`), and the player's primary position, never by the preview stream. `previewObjectives(world, fixture)` (`engine/career/objectives.ts`) makes the same draw, so what the hub shows before matchday is exactly what kickoff sets (tested for every position over each upcoming fixture). The passing target still follows the player's passing attribute, so training between the preview and the match can move it by a point. Worlds on the earlier selection rules (no formations) keep the old draw and preview nothing.

Taking that draw off the preview stream moves its later draws (the consistency shift and the weather) for every match, which is why this step changes outcomes; the number of moments and their minutes come before it and are unchanged.

**Hub.** The next-match hero lists the objectives under the fixture ("Your objectives") when the player is expected to start (selection chance of 50 % or more), and "Your objectives, if you are picked" otherwise; nothing for an injured player (`screens/career/objectivesUi.tsx`).

### M7: cosmetic yellow cards, the managers' substitutions and a bench of seven

**Cards** (decision 5, first step; `engine/match/discipline.ts`). At the end of every played minute each side is booked with probability `discipline.perTeamPerMinute` 0.02 (about 3.6 cards a match), drawn on `${seed}:discipline:${minute}` with two draws a side every minute so the stream never shifts. The player is drawn among the side's outfielders on the pitch not yet booked, weighted `20 + aggression + 0.5 × tackling`. A booking is a `card` event (`card: 'yellow'`, commentary `match.commentary.card.*`) and nothing else: no second yellows, no reds, no change of strength, odds or rating. Because events are numbered and commentary variants are salted by the event count, later event ids and commentary wording move, but no roll does: a test plays the same matches with bookings switched off and gets the same scores, shots, decision rolls and probabilities, ratings and line-ups.

**Bench.** On `match-15` a matchday bench is seven (`benchSize`): the best reserve keeper, then the best of each line (centre-back, full-back, central midfield, wide or attacking midfield, striker), then the best of the rest by ability. The career player's replacement and the managers' changes come from it. Earlier engines keep every other available player on the bench.

**The managers' substitutions.** Each side's plan is drawn on `${seed}:ai-subs`: how many changes (1 to 5 with weights 0.10 / 0.25 / 0.40 / 0.20 / 0.05, at most `aiSubstitutions.limit` 5, one fewer on the career player's side so their own substitution always fits) and their minutes, 60′–80′ (five minute draws a side whatever the count). At a planned minute the manager takes off an outfielder who started (never the keeper, the career player or someone who came on), weighted `1 + 0.05 × fatigue + 0.06 × (70 − stamina)⁺ + 0.05 × (55 − form)⁺`, drawn on `${seed}:ai-subs:${minute}:${side}:${change}`; the best bench replacement comes on (same position, then a compatible one, then any outfielder), the line-up's starter and bench ids are updated, and a `substitution` event names the player off (`playerId`) and on (`receiverId`, commentary `match.commentary.change.*`). The career player's own substitution now names who comes on too. Choreography already puts a substitute in the slot of the player who left. Changes alter who can score and who the drawn opponents are, so they change outcomes.

**Minutes.** `commitCareerMatch` credits minutes from the substitution events: a starter plays until taken off, a substitute from the minute they came on (`90 − minute`, at least 1), the career player the session's own count; players taken off keep their appearance. Each side's minutes therefore add up to 990 in regulation (`match-accounting.test.ts`). Sessions from earlier engines, whose only change was the career player's, are credited as before.

### M8: weather intensity and the pitch's state

**Intensity.** After the weather is picked, one more draw on the preview stream (the last it makes, so every earlier draw is unchanged) sets `Match.weatherIntensity`: light, steady or heavy with weights 0.3 / 0.4 / 0.3 (`conditions.intensityWeights`, a mean scale of exactly 1). **Pitch state** (`Match.pitchState`) is derived without a draw (`engine/match/conditions.ts`, `pitchStateFor`, also used by the preview's pitch icon): snow freezes the pitch (light snow only makes it heavy), rain makes it heavy unless it is light rain on a good surface, a surface below `pitchGood` (70) is heavy whatever the sky, and a good surface is firm under clear skies, otherwise good.

**Two factors.** The combined conditions factor is split into two shown factors, each an odds multiplier `1 + effect` in the usual order, so the factors still sum exactly to the probability:

- **Weather** (`match.factor.weather.<intensity>.<weather>`, "Light rain", "Strong wind"): the weather's own effect × the intensity's scale (light 0.5, steady 1, heavy 1.5). Technical choices: rain −0.03, snow −0.05; direct choices (crosses, long balls, long shots, headers, claims, punches): rain −0.02, wind −0.08, snow −0.05.
- **Pitch** (`match.factor.pitch.<state>`, "Heavy pitch"): technical choices only, the larger of the loss from a surface the rain or snow made heavy or frozen (−0.05) and the loss from a poor surface (`pitchSlope` 0.004 a point below 70, as before).

Averaged over intensities, direct choices lose exactly what they did, and close control on a good surface within a point of the combined factor (rain −0.065 against −0.06, snow −0.10 as before). Earlier engines keep the single "Weather and pitch" factor. The briefing names the weather with its intensity and draws its icon ("Light rain"), the pitch tile reads "Heavy pitch · 62% quality", the live chip "Light rain · Heavy pitch", and a choice's reason can cite "Heavy pitch −1.2%" (the factor's contribution to the chance).

## Full discipline (engine `match-16`)

The discipline phase (decision 5, step two, in [REDESIGN-IMPLEMENTATION.md](REDESIGN-IMPLEMENTATION.md)) turns the cosmetic yellows of `match-15` into real discipline: second yellows and straight reds, sides playing on a man short, the career player's own dismissal and a booking risk on defending choices. Suspensions follow in the world (see "Discipline and suspensions" in [BALANCING.md](BALANCING.md)). Every constant is in `CONFIG.match.cards` and `CONFIG.match.booking`; the code is `engine/match/discipline.ts`, with the match flow in `engine/match/index.ts`.

**Version and the earlier path.** A setup gains `discipline: true` (with `occasions`, for worlds on formations); `engineFor` names it `match-16`. A setup with `occasions` but no `discipline` is now its own path, `match-15` (`OCCASIONS_MATCH_ENGINE`): it keeps the cosmetic yellows on `${seed}:discipline:${minute}`, and a session saved by `match-15` still validates and replays as it was. `tests/match-outcome-snapshot.test.ts` checks both: the new hashes, and the `match-15` hashes from the end of phase 6 byte-identical (with the legacy and slot paths of variants 0 and 1). Moments clips need no new version: a keyframe always carries 22 players in slot order (see "Off the pitch" below).

**The minute's cards.** At the start of every minute, before anything else happens in it (so a player sent off takes no part in it and the selected player has no moment), each side draws three numbers on `${seed}:cards:${minute}`, whatever happens, so the stream never shifts:

- a card is shown with `perTeamPerMinute` 0.0205;
- to an outfielder on the pitch (keepers are never booked, as before), weighted `20 + aggression + 0.5 × tackling`, × `bookedCaution` 0.16 for a player already on a yellow, and × (1 − defence share × `selectedDefence` 2, at least 0) for the selected player while on the pitch, since their own defending moments carry their booking risk (a centre-back × 0.36, a striker × 0.92);
- it is a straight red with `straightRed` 0.0155 × (1 + (aggression − 50) × `straightAggression` 0.02), otherwise a yellow, and a second yellow for a booked player;
- a side already `maxDismissals` (3) men down is shown no more reds (the card is not shown), so a side never has fewer than eight.

A card is a `card` event with `card: 'yellow' | 'second-yellow' | 'red'` and commentary `match.commentary.card.*`, `.second-yellow.*` or `.red.*`.

**A man short.** A dismissal adds the player to the line-up's `sentOffIds` (they keep their slot in `starterIds`) and recalculates the game. Each man down multiplies the side's expected goals by `max(attackFloor 0.4, 1 − attack 0.3 × men)` and the opposition's by `1 + concede 0.45 × men` (both rounded to six decimals, `+ − × ÷` only), so the background minutes and every later moment's budget follow; possession moves `possession` 5 points a man; and the selected player's team odds read the strength gap as if the short side were `strength` 8 points weaker. Over the 7,200 profile matches a side a man short scored ×0.71 and conceded ×1.38 its goals per minute at eleven against eleven (gate: below ×0.9 and above ×1.1).

**Out of play.** A player sent off never shoots, scores, assists, receives a pass or a moment's ball, is never a moment's opponent, presser, runner or cover, and cannot be substituted: a manager's change takes someone else, and nobody replaces them. **Off the pitch** in the choreography: the Director parks them at (−5, −5) with the keyframe animation `off` (`engine/match/parked.ts`), out of every shape, press, offside line and cast, and the renderers (Pixi pitch, SVG pitch, tactical camera, Moments clip) hide them; keyframes and clips keep all 22 players in slot order, so the v2 clip codec and earlier clips are unchanged. A player sent off by a decision plays that outcome passage out and is parked from the next.

**The selected player sent off.** Their match ends at the card: `state.sentOff` records the minute and reason; there are no more moments, no shootout kick, no captain's call; their shares go back to the background (as after a substitution), which simulates the rest to full time a man short. Minutes stop at the card (`selectedPlayerMinutes`, and the career's minute accounting counts a dismissed player to the card). Their cards cost rating as the `discipline` part, listed in the breakdown as "Cards": `rating.yellow` −0.2 for a yellow, `rating.red` −1 for the card that sends them off (so two yellows cost −1.2, a straight red −1). XP follows minutes and rating; fame loses `fame` 2 and the clean-sheet credit; the manager's trust moves `trust` −2 for a second yellow and −4 for a straight red; the headline is "sent-off" (three wordings), the manager reacts to the card and the fans to the result. The report (`report.cards`) carries the yellows and the dismissal.

**Booking risk in key moments.** Each defending choice has a foul chance for a failed attempt (`booking.choices`, e.g. tackle 0.11 with 5% of those straight reds, sliding block 0.14 / 8%, last-ditch stretch tackle 0.20 / 20%, body block 0.06, intercept 0.04, track the runner 0.07, jockey and drop off 0.02), moved by aggression × (1 + (aggression − 50) × 0.012) and tackling × (1 − (tackling − 50) × 0.008), × 0.8 once booked, bounded 0.01–0.6. The choice carries `booking` (`BookingRisk`): the foul chance with factors that add up to it, and the chances of a yellow (`(1 − p) × foul × (1 − straight)`) and a red (`(1 − p) × foul × straight`, or the whole `(1 − p) × foul` when already booked). The decision panel shows "Booking risk 4%" (or "Red card risk" when booked) beside the stakes, and the breakdown the foul chance's factors and the overall chances. A failed choice rolls twice on `${seed}:booking:${momentId}:${choiceId}` (foul, then straight red), never moving the decision's own roll; the outcome records `booking: { roll, foul, card? }`, and the outcome panel says "Booking roll 12.3 against the 11.0% foul chance: a yellow card". Attacking and keeper choices carry no booking risk.

**Rates** (`npm run profile:match`, 300 matches a position, 7,200 matches): 3.73 yellows and 0.138 dismissals a match (0.064 second yellows, 0.073 straight reds), against roughly 3.5–4 yellows and 0.1–0.2 reds in the top divisions. The career player was sent off in 0–1.4% of their matches (centre-backs and holding midfielders most). Gate: 3.3–4.3 yellows, 0.10–0.20 reds, a career player sent off in at most 3% of matches, and the man-short gate above. Unit tests (`tests/match-discipline.test.ts`) check the cards and their commentary, that a player sent off is out of every later event, frame, cast and target, the expected-goal change at a dismissal, the selected player's dismissal end to end, the booking risk's factors and its roll, suspended players left out of a line-up, and replay after a JSON round trip.

**10,000-match gate** (the striker's benchmark, which now includes dismissals): goals 2.6661 a match (home 1.454, away 1.229), home wins 42.2%, draws 26.3%, close-gap upsets 23.2%, wide-gap upsets 8.6%: within a few hundredths of `match-15` (2.6542 / 42.2% / 26.3% / 22.9% / 8.2%).

| Step             | Goals  | Home win | Draw   | Close upset | Wide upset |
| ---------------- | ------ | -------- | ------ | ----------- | ---------- |
| `match-15` (M8)  | 2.6542 | 0.4218   | 0.2625 | 0.2285      | 0.082      |
| `match-16` cards | 2.6661 | 0.4223   | 0.2632 | 0.2315      | 0.0855     |

The profile's other gates hold: a striker scores 0.50 a match, every position reaches 9, objectives complete 10–75% of the time, outfield substitutions 6–9%, attacker involvement best/worst ×1.4–1.8, stated odds honest, and choreography 5.3–5.9 ms a match (8.0–9.2 ms a whole match).

## Commentary and reactions (engine `match-22`, release 1.0 step 5.5)

Words only: no roll, probability, goal or rating moves. The commentary keys an event logs are part of the saved session, so the new selection is gated on `rules22`; match-21 keeps drawing one of three variants on `${seed}:commentary:${matchId}:${eventCount}` and one of four narration variants, byte for byte (the outcome snapshot's `PREVIOUS` table and match-21 session hash are unchanged). The match-22 snapshot was re-recorded; goals and moments per position equal match-21's.

**Picking a line** (`src/engine/match/commentary.ts`). `line(session, base, side)` picks `match.commentary.<family>.<variant>`:

- Variants per family: `COMMENTARY_VARIANTS` (eight to twelve for the lines a player sees most; three for any family not listed, `commentaryVariants`), and `NARRATION_VARIANTS_22` for narration (eight to sixteen for the frequent moves, four otherwise).
- A family's variants are used once each in a shuffled order, then reshuffled, never repeating the last one (`cycledVariant`), on `${seed}:lines22:${matchId}:${family}:${cycle}` (`:narration22:` for narration). The order is counted from the family's earlier keys in the session, so nothing new is stored. Narration still draws its match-21 variant, so the moves narrated are unchanged.
- Context (`CONTEXTS`): a line prefers a context family while it has unused variants in the match: a missed shot held or wide from the 80th minute by a side level or behind (`attempt-held-late`, `attempt-wide-late`); a card in the first 15 minutes or from the 80th (`card-early`, `card-late`); a substitution by a side behind, or ahead from the 70th (`change-chasing`, `change-protecting`); the player's own substitution with a live rating of 7 or more (`substitution-applauded`); half-time goalless, level or with a leader (`halftime-*`).
- A shot outside the player's choices that does not go in (a background attempt, or the player's own shot that a successful choice led to; a teammate's `chance` and an opponent's `counter` keep their neutral lines) names how it was missed: `missedShot` weights held 0.42, parried 0.15, wide 0.20, over 0.13, blocked 0.10 on `${seed}:missed22:${matchId}:${eventCount}` (on target 57%, as match-21's lines and pitch drew them), and the pitch draws the same (`MISSED_SHOTS` in motion.ts). The goal roll now comes before the shot is logged; the log draws nothing from that stream, so match-21's draws are unchanged. Failed near-post and far-post shots have eight variants, each tied to what the pitch draws (`FAILED_SHOTS`). A parried miss gives a corner, so a shot can follow from a ball won in the box at the other end; match-22 carries such a shot on into shooting range (`SHOOTING_DEPTH` 62) instead of striking it from midfield, which match-21 did in about 1 match in 80.

**Adding lines.** A new event kind is a new family: log it with `line(session, 'match.commentary.<family>', side)`, write its lines in `src/i18n/commentary.ts`, and list it in `COMMENTARY_VARIANTS` if it has more than three; a context is one more `CONTEXTS` entry with its own family. `tests/match-commentary.test.ts` checks that every variant has copy. Step 5.3 added `attempt-woodwork` (a `missedShot` outcome with its own pitch visual). Keys the other 1.0 steps are expected to add: 5.4 `stoppage` (the board, `{added}` minutes), `injury` and `injury-off` (an AI player forced off), `shootout-kick.scored|saved|missed` per kick, `bench-on` (the player coming off the bench), `touchline-refused` (the half-time role refused); 5.2 commentary families for new choices (three variants by default) and `card` contexts for a last-man foul.

**The feed** (`src/screens/match/feed.ts`, `lines.ts`; presentation, both engines). Consecutive routine passes by the player, with no other event between them, are one summary row at the spell's last pass ("Doyle and Okafor keep it ticking over: 6 passes"), from four pools by size and passes lost, cycled per match like the engine's lines. A shot outside the player's moments that goes in shows as its goal only. Lines name the team, the opposition, the keeper and the score (`{team}`, `{opponent}`, `{keeper}`, `{scoreline}`, `{leader}`, `{trailer}`), and a match's goals cycle through each goal pool (5.1). The screen reader announces the latest event that is not a routine pass. The words and the narration copy load with the match (`lines.ts`, about 13 KB gzip), not the screen's first render.

**Repetition** (`npm run profile:commentary`, 230 matches: 46 for each of ST, RW, CM, CB and GK; a sentence is a template, whatever the names):

| Measure                                    | Before 5.5 | match-22 |
| ------------------------------------------ | ---------- | -------- |
| Feed rows a match                          | 110.1      | 92.4     |
| Distinct sentences a match                 | 49.8       | 92.2     |
| Most repeated sentence a match (mean, max) | 13.1, 21   | 1.17, 2  |
| Most common sentence in a 46-match season  | 518–530    | 27–35    |

Before, the most common sentences were the three routine-pass lines (about 9 a match each) and the three attempt lines (about 6 each). `--check` fails above three repetitions in a match or 40 in a season.

**Reactions** (`reactionStory`, `reactionKey` in `src/screens/match/reportData.ts`; presentation). The report quotes the match story when there is one, in this order: a late winner, a comeback win, a late equaliser, a late defeat (the last goal, from the 85th minute, changed the result), a defeat or a win by three or more, and a clean sheet kept by a keeper or full-back or centre-back who stayed on. The manager's line keeps the rating's tone (`good` for a solid or star match, `poor` below); the fans react to the story alone; a sending-off keeps its own lines. Four lines each, picked from the seed.

## 1.0 targets (release plan step 2.3)

The match profile (`scripts/match-profile.ts`) reports five 1.0 targets after its gates; phase 5 (engine `match-22`) meets them and sets each `asserted: true` in `TARGETS` (ratings and match statistics from step 5.3). Until then they print as `MISS` without failing the check; `npm run profile:match -- --check --assert-targets` previews them as gates. The asserted gates above are unchanged. The bands are in `TARGET_BANDS`; [BALANCING.md](BALANCING.md#10-targets-release-plan-step-23) lists every 1.0 target with its baseline.

- **Choices matter.** For each position and seed, the selected side's goal difference with the best policy less that with the worst, both on the specialised setup the goals-prevented gate uses (`swing`, with its standard error). Target ≥ 0.30 goals a match for every position on two seeds; the weekly job runs `match-profile` and `match-profile-b`.
- **No dominant choice.** At every key moment of the best-policy matches, the choice with the highest expected value (`expectedImpact(...).net`; ties share the credit) is tallied per situation (`dominance`). Pooled over positions per seed, no choice may be best in more than 60% of a situation's instances (situations with at least 30).
- **Ratings.** Per position: mean 6.5–6.9, standard deviation 0.7–1.0 (`rating.sd`), at most 3% at 9.0 or more and at most 3% at 5.0 or less (`rating.fiveOrLess`).
- **Match statistics.** From the best-policy matches, pooled per seed (`statistics`): shots on target 30–40% of shots, 11–14 shots a team, home possession with p10 ≤ 40% and p90 ≥ 60%. The 10,000-match test keeps the goal, home-advantage and upset bands.
- **Goals in added time** (split from the match statistics in step 5.3; asserted from step 5.4): goals marked with an added minute (`MatchEvent.addedTime`), 6–10% of all goals (`TARGET_BANDS.addedTimeShare`; football data puts it at about 7–9%).

Step 5.2 met the first two and asserts them (`asserted: true`), step 5.3 the ratings and match statistics; the figures after each are in their sections.

Baseline on 25 October 2026 (0.10.0, 300 matches a position, both seeds):

| Target                           | `match-profile`                                                                                                                                                                                                                       | `match-profile-b`                                                                                                                                   |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Perfect vs worst (goals a match) | ST 0.32, CM 0.24, CB 0.17, AM 0.16, LB 0.12, DM 0.10, GK 0.09, RW 0.09                                                                                                                                                                | ST 0.31, GK 0.16, RW 0.16, CM 0.15, AM 0.10, CB 0.09, DM 0.08, LB 0.03                                                                              |
| Dominated situations             | 9 situations: one-on-one _stay_ 96%, penalty save _stay_ 100%, free kick _short_ 85%, distribution _short_ 78%, corner _short_ 77%, penalty _corner_ 70%, shot incoming _hold_ 65%, defend-attack _tackle_ 61%, build-out _carry_ 60% | 6 situations: distribution _short_ 84%, free kick _short_ 76%, corner _short_ 76%, penalty save _stay_ 71%, cross _claim_ 67%, aerial _cushion_ 61% |
| Ratings (mean, sd)               | 6.23–7.07, 1.14–1.70; 9.0+ up to 13.3% (CB); ≤ 5.0 up to 18.3% (CM)                                                                                                                                                                   | 6.29–6.83, 1.12–1.52; 9.0+ up to 8.0%; ≤ 5.0 up to 18.0% (AM)                                                                                       |
| Shots on target, shots a team    | 60.8%, 10.2                                                                                                                                                                                                                           | 60.7%, 10.3                                                                                                                                         |
| Possession p10–p90               | 48–52%                                                                                                                                                                                                                                | 47–52%                                                                                                                                              |
| Goals in added time              | 0 of 6,485                                                                                                                                                                                                                            | 0 of 6,524                                                                                                                                          |

Step 5.3 met the ratings and match statistics targets on both seeds and asserts them; step 5.4 meets and asserts goals in added time (7.1% and 7.0% of all goals; "The occasions" below). Measured values below, in "Believable ratings and statistics".

## Believable ratings and statistics (engine `match-22`, release 1.0 step 5.3)

Findings M6, M10 and M11 of the [25 October review](APP-REVIEW-2026-10-25.md). Every rule here is gated on `rules22(setup)`; a `match-21` session keeps the rules above byte for byte (the snapshot's `PREVIOUS` table and whole-session hash are unchanged). Constants: `CONFIG.match.rating22`, `rewards22`, `possession22`, `shots22` and `missedShot`; the career's reactions to a match-22 rating in `CONFIG.career.social.performance.ratings22` and `cliques.ratings22`.

### Rating

Match-21 gave flat credits on 8–15 moments (±0.6 a decision, +0.6 a goal or assist, 2 × danger ÷ odds a stop, −0.45 a goal conceded), so ratings were wide (standard deviation 1.1–1.7), every position reached 10, and the centre depended on the position: keepers and defenders collected stop credit on average, strikers and wide players lost decision credit. Match-22 measures every key moment against what the **reference player** (the choice's base odds, before attributes, form and conditions) would have made of it, so its expected credit is zero for that player whatever the moment, and the rating centres on the same base in every position whatever the mix of moments (step 5.2 can change the mix without moving the centre):

- **Decision**, to the choice's family: `decision[family] × (success − reference odds)`, with shooting, passing and dribbling 0.25 and defending and keeping 0.35 and 0.4 (their value is mostly in the decision itself; step 5.2 retuned them, below).
- **As it happens**: a goal `goal` 0.9 and an assist `assist` 0.7, each further one in the match × `repeat` 0.55 of the one before, and a hat-trick's third goal `hatTrick` +1.2; a save or stop `stop` 0.9 × danger ÷ reference odds (the odds at least `stopFloor` 0.3, the credit at most `stopCap` 0.85); a goal conceded from the moment `error` −0.4.
- **Par** (the new part "Expected from your moments" in the report), subtracted at every moment: `goal` × the reference player's expected own goals + `assist` × expected assists (both × `repeat` as above) + reference odds × the stop credit + `error` × expected goals conceded. Expected goals and assists come from the choice's stakes: a direct shot's are its odds, a chance made for oneself or a teammate the odds × the chance's goal probability (none for a dribble that leads into a follow-up shot, whose own moment carries it); goals conceded are the odds × `successConcede` + (1 − odds) × `failureConcede` (1 for a direct save). The hat-trick bonus stays out of the par: it is rare enough not to move the centre, and a striker on two goals is not marked down for every chance that might have made it three.
- **Involvement**: every credit above is × √(`moments` 10 ÷ the match's planned moments, at least `fewest` 6), so a busy match is not a wider one. The square root is Newton's method rounded to six decimals, so replay never depends on `Math.sqrt`.
- **Team**: ± `result` 0.2 for a win or loss; a clean sheet `cleanSheet` 0.25 for keepers, defenders and (new) defensive midfielders still on the pitch.
- **Scale**: rating = base 6.63 + the sum's distance from the base × `lean` (0.8 below, 1.15 above: a poor match is rarely a disaster, a great one stands out), then beyond the `knees` 5.6 and 9.2 at `beyond` 0.5 and 0.6 of the rate, bounded 3–10. The report lists the base, every part and a "Rating limit and rounding" factor that absorbs the scale, so the factors still sum to the shown rating.
- A manager's tactical substitution looks at a live rating below `substituteBelow` 6.3 (match-21: 6), about the same share of poor matches on the narrower scale.

Every hat-trick in the profile rates 9.1–10, a brace usually 8–9; five big saves and a clean-sheet win reach 9, and four goals conceded from a defender's own moments in a defeat go below 5 (`tests/match-ratings.test.ts`).

| Position | Mean before → after (`match-profile` / `-b`) | Standard deviation        | 9.0+                     | 5.0 or less               |
| -------- | -------------------------------------------- | ------------------------- | ------------------------ | ------------------------- |
| GK       | 7.07 / 6.78 → 6.81 / 6.64                    | 1.45 / 1.36 → 0.88 / 0.79 | 10.0 / 6.7% → 0.7 / 0.3% | 8.3 / 8.0% → 0.7 / 0.0%   |
| CB       | 6.88 / 6.83 → 6.74 / 6.76                    | 1.70 / 1.52 → 0.96 / 0.89 | 13.3 / 8.0% → 1.7 / 2.0% | 17.0 / 10.0% → 0.3 / 0.3% |
| LB       | 6.89 / 6.60 → 6.84 / 6.65                    | 1.54 / 1.48 → 0.92 / 0.78 | 9.3 / 5.3% → 1.3 / 0.3%  | 12.0 / 15.0% → 1.0 / 0.0% |
| DM       | 6.75 / 6.70 → 6.77 / 6.80                    | 1.57 / 1.40 → 0.89 / 0.88 | 8.7 / 4.7% → 1.3 / 0.3%  | 12.0 / 13.0% → 0.3 / 0.7% |
| CM       | 6.30 / 6.41 → 6.56 / 6.67                    | 1.32 / 1.12 → 0.77 / 0.78 | 2.3 / 2.0% → 0.7 / 0.7%  | 18.3 / 8.3% → 0.0 / 0.3%  |
| AM       | 6.53 / 6.29 → 6.69 / 6.59                    | 1.25 / 1.28 → 0.76 / 0.74 | 4.0 / 2.7% → 0.7 / 0.3%  | 12.7 / 18.0% → 0.0 / 0.0% |
| RW       | 6.23 / 6.76 → 6.59 / 6.83                    | 1.14 / 1.30 → 0.76 / 0.88 | 1.7 / 5.7% → 0.7 / 2.0%  | 12.7 / 9.7% → 0.0 / 0.0%  |
| ST       | 6.61 / 6.53 → 6.77 / 6.73                    | 1.21 / 1.17 → 0.92 / 0.79 | 4.3 / 2.3% → 2.7 / 1.0%  | 9.7 / 12.0% → 0.0 / 0.0%  |

The remaining spread of the means (6.56–6.84) is the players': the profile rotates through each club's players of a position, and a better one beats the reference more often. The keeper's p90 is 7.9 / 7.7 (gate ≥ 7.6), and every position reaches 9.

### XP and fame

Performance XP (`performanceXp`) and fame (`performanceFame`) take the match's scale (`rewardScale(session)`: null for a match-21 report, else the position played), so a match-21 match pays exactly as before. On match-22 the rating term is `rewards22.xp.perRating` 45 × max(0, rating − 5.2) × the position's weight, and fame's `rewards22.fame.perRating` 3.75 × max(0, rating − 6.2) × the same weight; minutes, goals, assists, objectives and clean sheets pay as in `xp` and `fame`. The weights (GK 1.2, CB 1.1, LB and RB 1, DM 0.9, LW and RW 0.9, AM 0.85, ST 0.85, CM 0.8; since step 5.2 CB 1.21, CM 0.62, AM 0.74, LW and RW 0.78) keep each position's XP a match where match-21's ratings had it (inflated for keepers and defenders), so levelling stays on its curve.

Report XP and fame a match over the match profile (both seeds, 600 matches a position, best policy):

| Position | XP median before → after | XP mean before → after | Fame mean before → after |
| -------- | ------------------------ | ---------------------- | ------------------------ |
| GK       | 130 → 126 (−3.1%)        | 134.6 → 139.2 (+3.4%)  | 3.23 → 3.35 (+3.7%)      |
| CB       | 120 → 124 (+3.3%)        | 136.5 → 135.4 (−0.8%)  | 3.47 → 3.31 (−4.7%)      |
| LB       | 115 → 119 (+3.5%)        | 130.5 → 127.9 (−2.0%)  | 3.14 → 2.96 (−5.7%)      |
| DM       | 110 → 114 (+3.6%)        | 130.2 → 125.0 (−4.0%)  | 2.58 → 2.42 (−6.3%)      |
| CM       | 95 → 95 (0.0%)           | 116.7 → 115.9 (−0.8%)  | 2.00 → 2.02 (+1.1%)      |
| AM       | 100 → 99 (−1.0%)         | 124.9 → 125.2 (+0.3%)  | 2.33 → 2.27 (−2.2%)      |
| RW       | 103 → 102 (−1.0%)        | 129.4 → 134.0 (+3.6%)  | 2.50 → 2.69 (+7.3%)      |
| ST       | 120 → 123 (+2.5%)        | 139.6 → 140.4 (+0.6%)  | 2.83 → 2.99 (+5.9%)      |
| All      | 110 → 113 (+2.7%)        | 130.3 → 130.4 (+0.1%)  | 2.76 → 2.75 (−0.3%)      |

**The career's reactions.** Manager trust, fan affection and the dressing room react to a match in bands of its rating (`career.social.performance`, `cliques`). On a match-22 rating they use `ratings22` (great 7.25, good 6.65, poor below 6.05; cliques 7.25 and 6.05), which keep the profile's shares of great (27%), good-or-better (45%) and poor (21%) matches; on the old bands poor matches fell from 21% to 3% and the career gate "trust below 70 in at least 15% of weeks" failed (median 14%). The media's weekly performance lines and the stories still read the match-21 bands (7.5 / 6.8 / 5.8): they read stored records, which do not name their engine.

**Careers** (`npm run profile`, `review-a` ST, `review-b` CM, `review-c` CB, `review-d` GK, to 34; every gate holds): XP an appearance over the career 208 → 204 (ST), 187 → 169 (CM), 184 → 185 (CB), 218 → 202 (GK); level at 33: 95 → 94, 77 → 76, 84 → 88, 96 → 97. Levels in between move with playing time (a centre-midfielder's ratings no longer sit half a point below the others', so form and selection give the CM and GK careers more appearances at 21–25). Ability at 25: median 85.5 (85.5 before), lowest 76.1 (75.1).

### Possession

`homePossession` adds, to match-21's strength, mentality, men-down and momentum terms: the home side's `home` 2.5 points (not at a neutral venue); each side's playing style (`styles`: possession +6, press +2, balanced 0, direct −3, counter −5; the home side's less the away side's); the day's game plan, a triangular draw of ± `spread` 18 on its own stream (`${seed}:possession`, the same every minute); and the score, a side ahead sitting `lead` 2 points deeper a goal (at most `leadCap` 3). Bounded 25–75.

### Shots, the woodwork and shots on target

The background converts `shots22.conversion` 0.095 of its shots (match-21: 0.12), so it shoots about a quarter more for the same goals. A missed shot outside the player's own choices is named by step 5.5's `missedShot` (above); step 5.3 moves its weights to real bands and adds the woodwork: held 0.17, parried 0.09, wide 0.24, over 0.16, blocked 0.30, woodwork 0.04 (about a quarter of misses on target, against 57% before). The commentary family (`attempt-woodwork`, six variants) and the pitch (`MISSED_SHOTS`: a woodwork shot strikes the post, the nearest defender gathers the rebound) follow it, and so do the shots on target (goals, held, parried). The shot event keeps the result as `shotResult` (`saved`, `blocked`, `off-target`, `woodwork`; `src/engine/match/shots.ts`), and the woodwork counts in `stats.woodwork` [home, away], shown in the report's team statistics when a shot hit it. The player's own missed shot keeps the ending its line names, but hits the woodwork with `shots22.woodwork` 0.04 on its own stream (`${seed}:woodwork:${eventId}`), and its line then becomes an `attempt-woodwork` one. A teammate's `chance` and an opponent's `counter` keep their neutral lines and the pitch's seeded ending.

| Statistic (profile, both seeds) | Before        | After         |
| ------------------------------- | ------------- | ------------- |
| Shots a team                    | 10.2 / 10.3   | 12.5 / 12.5   |
| Shots on target                 | 60.8 / 60.7%  | 36.5 / 36.7%  |
| Off the woodwork, a match       | —             | 0.82 / 0.81   |
| Home possession p10–p90         | 48–52 / 47–52 | 39–65 / 39–66 |

### The 10,000-match gate

`tests/match-calibration.slow.test.ts` (the striker's benchmark), both engines on the same seeds:

| Engine     | Goals  | Home / away goals | Home win | Draw  | Close upset | Wide upset | Shots a team | On target | Woodwork |
| ---------- | ------ | ----------------- | -------- | ----- | ----------- | ---------- | ------------ | --------- | -------- |
| `match-21` | 2.6638 | 1.452 / 1.227     | 42.1%    | 26.8% | 23.1%       | 8.7%       | 10.5         | 57.1%     | —        |
| `match-22` | 2.6564 | 1.454 / 1.220     | 42.4%    | 26.3% | 22.8%       | 8.4%       | 12.6         | 36.0%     | 0.87     |

**After step 5.2.** Done: see "Ratings and rewards after 5.2" below.

## The occasions (engine `match-22`, release 1.0 step 5.4)

Findings M7, M12 and M13 (and M1's follow-up) of the [25 October review](APP-REVIEW-2026-10-25.md). Every rule is gated on `rules22(setup)`; match-21 keeps its rules byte for byte (the snapshot's `PREVIOUS` table and whole-session hash are unchanged). New random draws are on new streams; per-minute streams in added time are keyed `minute+added` (`clockKey`), so normal time's draws keep their keys. Constants: `CONFIG.match.occasions` (`stoppage`, `bench`, `injuries`, `extraSub`, `shootout`, `touchline`). Modules: `stoppage.ts`, `bench.ts`, `injuries.ts`, `shootout.ts`, `touchline.ts`.

### Stoppage time

At the end of each period (45, 90, and 105 and 120 in extra time) the board shows N = base + goals × 0.45 + substitutions × 0.2 + cards × 0.2 + injuries × 0.9 + a uniform draw below 1.6 (`${seed}:added:${minute}`), rounded within the period's band: 1–4 (base 0.7), 3–7 (base 2.6; with 4% a long stoppage of 2–4 more, up to 10), 0–2 and 1–3 in extra time. The clock stands at the period's last minute while the added minutes are played (`state.added`; shown 45+2′, 90+4′); events, moments and narration lines carry `addedTime`. Added minutes are played minutes (fatigue, cards, injuries, a rating sample), but `selectedPlayerMinutes` counts regulation time only. A minute's background goal rate is expected goals ÷ `matchMinutes` 98.3 (90 plus the mean added time), so goals a match hold. The last moment of a close game, placed at the 80th minute, lands in one of the first three added minutes with 30% (`${seed}:late:added`).

Measured (2,000 friendlies): boards 2.56 (45′), 5.69 (90′, up to 10), 1.39 and 1.65 in extra time; goals a match 2.67 (match-21 on the same setups 2.65); 7.3% of goals in added time (profile, both seeds: 7.1% and 7.0%). The 10,000-match gate: 2.65 goals, home 42.9%, draw 25.6%, close upsets 22.7%, wide 8.3%.

### Coming off the bench

A career player the manager leaves out (`careerSelection`, not suspended, registered) now has a playable fixture (`pendingCareerFixture` → `matchdaySquad`) and starts on the bench (`setup.bench.role`, the role promised): out of the eleven, first on the bench of seven, no moments. From 55′ to 80′ (91′–105′ in extra time) the manager brings them on with a per-minute hazard (`${seed}:bench:${minute}`): base by role (key 0.09, rotation 0.05, backup 0.03, youth 0.02) × a ramp (0.5 at 55′, 1.4 at 68′, 0.9 at 80′) × the score (chasing: attackers 1.6, defenders 0.6; leading: attackers 0.8, defenders 1.4) × form (1 + (form − 50) × 0.012) × freshness (1 − fatigue × 0.008) × 1.5 if they asked at half-time (−2 trust). They replace whoever fills their natural slot, take 2–4 moments in the time left (`${seed}:bench:moments`), and a moment's budget divides by the moments a whole match would hold at that rate (`momentCount`). A keeper on the bench comes on only for an injured or dismissed keeper; an outfielder can also come on for an injured teammate whose like-for-like change they are. Measured over 1,400 outfield bench sessions: on in 95% (key), 84% (rotation), 66% (backup), 51% (youth), at 62′–66′ on average, for 26 minutes and about 3 moments.

At commit the record has `cameOn`; the matchday counts as dropped (not a start) and posts the "dropped" note; an unused substitute's match records only the club's result (no appearance, rating, XP or fame; the availability entry stays `benched`), with its own headline (`unused-sub`) and reactions. A substitute who scores or assists in a win or draw gets `impact-sub`.

### In-match injuries

Each side's players on the pitch carry a per-minute hazard of 0.012 ÷ 90 × (0.5 + proneness ÷ 100) × (1 + fatigue ÷ 50) (the world's background rate), one draw a side a minute (`${seed}:injury:${clock}`); the injured player is replaced from the bench while the side has a change left (the career side keeps one back for the career player), and the world's injury table takes the session's injuries at commit instead of its post-match draw (`PlayedFixture.injuries`). Measured: 0.29 forced off a match.

The career player takes a knock with 0.035 ÷ 90 a minute × their injury factor (`setup.injury`, the career's `injuryFactor`: fatigue, proneness, Iron Man, a physio), plus a rushed return's risk ÷ 90 (`${seed}:knock:${clock}`, before the minute). A quarter of knocks (and every rushed return breaking down) are injuries that end the match; the rest ask "play on or come off": playing on adds 20 fatigue (odds fall through the fatigue factor) and a 1% a minute risk of the knock becoming an injury; coming off ends the match unhurt (only with a change left). At commit a serious or aggravated knock is an injury of that type in the career's system (`sessionInjury`; internationals too); the post-match roll is not made. Measured: a knock in 3.6% of matches (about 0.9% an injury at once, as the old post-match chance).

Keepers are booked with a card weight × 0.3 (0.10 keeper cards a match); a keeper sent off is replaced by the reserve keeper for an outfielder, or an outfielder takes the gloves. Each side has one more change in extra time (75%, between 91′ and 110′): 1.4 extra-time changes a match that goes to extra time.

### The shootout

Five kicks a side, then sudden death, kick by kick on `advance` (`penaltyShootout`); the toss on `${seed}:shootout:toss`. Takers: each side's players on the pitch, by (finishing + composure + set pieces) ÷ 3, the keeper last; the career player on the pitch takes one of the first five. A kick goes in with 0.76 + (taker − 60) × 0.004 − (keeper − 60) × 0.003 − 0.04 if a miss loses it, within 0.55–0.92 (`${seed}:shootout:kick:${index}`); the career player chooses the placement (a penalty moment) or, in goal, faces every kick (a save moment each). Off the pitch it is simulated without moments, and the session settles `penalties` itself, so `sessionPenalties` and every commit path read it. Measured: 76.5% of kicks scored, 10.6 kicks a shootout.

### Touchline decisions

| Answer                   | Effect                                                                                                             | Best in (300+ branched half-times; substitutions) |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------- |
| Motivate                 | momentum +8 × 1.25 behind / 1 level / 0.4 ahead (× 1.5 Leader), odds × 1.03 (× 1.005 ahead), trust +1              | 56% (63% behind, 57% level, 50% ahead)            |
| Ask for a role (chosen)  | refused with 0.3 − (trust − 50) × 0.008 + 0.25 against the score, within 0.05–0.85; refused: trust −1, odds × 0.98 | 31% (21% behind, 36% level, 33% ahead)            |
| Demand the ball          | attacking share × 1.35 and two more second-half moments; trust 0 after a first half rated 7+, −2, or −4 below 6.2  | 13% (16% behind, 7% level, 17% ahead)             |
| Accept a substitution    | trust +1                                                                                                           | 92.5%                                             |
| Rally the side going off | own expected goals × 1.3, theirs × 0.85 for the rest, no trust                                                     | 7.5% (10% of close games)                         |

"Best" plays the same half-time (or substitution) out with every answer on the same seeds and scores result points × 0.5 + rating + trust × 0.1. The captain's call comes at the second half's start, after a goal conceded and at 80′ in a game within a goal, at most three times and ten minutes apart. The headless player picks the answer its context favours (`touchlinePolicy`).

## Choices that decide matches (engine `match-22`, release 1.0 step 5.2)

Before this step every choice of a moment was worth the same at the reference player (by construction: `forShare × budget` for and `againstShare × budget` against), so only attribute gaps told choices apart: perfect against worst play was worth 0.03–0.32 goals a match and 15 of 32 situation-seeds had a choice that was best almost always (review M4, M5). Everything below is gated on `rules22(setup)`; match-21 replays byte for byte (the outcome snapshot's `PREVIOUS` table and match-21 session hash are unchanged).

### Reads of the play

Each situation has one or two **reads** (`READS` in `src/engine/match/readTable.ts`): what the pitch shows at that moment. A drawn read takes one draw on `${seed}:reads:${minute}:${keyMoments.length}` (its own stream, so no other roll moves); a matchup read compares the player with the drawn direct opponent without a draw: `pace` ((pace + acceleration) / 2) or `aerial` ((heading + jumping + strength) / 3; at a corner the best three of each side), ahead beyond `moments22.matchupMargin` 5 points, behind below −5, level otherwise. Each state multiplies the odds (`scaleOdds`) of the choices it bears on and is a named factor right after the opposition's quality and style (`match.read.<read>.<state>`, the same words the decision panel shows under "What you see"), so the factors still sum to the chance. The moment stores its reads (`KeyMoment.reads`).

| Situation         | Reads (states, weight)                                                                                                         |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| box-chance        | keeper: set .35, covering the near post .35, off his line .30; cover: clear sight .35, defender tight .35, one against one .30 |
| edge-of-area      | keeper: set .40, off his line .30, view screened .30; space: room .35, closing .35, crowded .30                                |
| aerial-chance     | delivery: whipped .38, looping .37, behind you .25; aerial matchup                                                             |
| build-up          | their line: high .35, deep .35, midway .30; space: room .40, closed .60                                                        |
| defend-attack     | carrier: heavy touch, tricky dribbler, looking for a pass, runner in behind (.25 each)                                         |
| build-out         | press: high .35, mid-block .30, sitting off .35; their line: space behind .40, none .60                                        |
| shot-incoming     | shot: tame .35, powerful .35, dipping .30; range: distance .5, close .5                                                        |
| one-on-one        | your position: off your line .45, deep .55; angle: central .5, tight .5                                                        |
| cross-ball        | traffic: clear .35, crowded .35, late runner .30; delivery: floated .5, whipped .5                                             |
| distribution      | press: high .5, sitting off .5; their shape: men forward .35, back in shape .65                                                |
| penalty           | keeper: dives early .35, stays big .35, guessing .30                                                                           |
| free-kick         | distance: close .35, 25 yards .35, long .30; wall: four .5, two .5                                                             |
| corner-kick       | marking: zonal .35, man .35, packed .30; aerial matchup                                                                        |
| goal-line         | shot: low drive .5, lofted .5                                                                                                  |
| offside-line      | your line: together .5, broken .5; pace matchup                                                                                |
| penalty-save      | taker: picks a corner early .4, waits for you .4, nervous .2                                                                   |
| last-man          | cover: behind you .45, none .55; pace matchup                                                                                  |
| cross-defence     | delivery: early .35, cut-back .35, whipped .30; aerial matchup                                                                 |
| two-on-one        | carrier: looking to pass .5, going alone .5; help: coming .45, none .55                                                        |
| set-piece-marking | delivery: far post .35, near post .35, middle .30; aerial matchup                                                              |
| sweeping          | race: the ball runs to you .35, fifty-fifty .35, they get there first .30                                                      |
| back-pass         | pass: under-hit .4, firm .6; press: high .45, off .55                                                                          |
| rebound           | keeper: on the ground .45, back up .55; ball: falls kindly .35, awkward .35, bodies in the way .30                             |
| weak-foot         | pressure: closing fast .5, time to adjust .5; keeper: set .6, off his line .4                                                  |

The multipliers (in the table file, one per state and choice) lean down more than up: the right read is worth a little more than the moment's budget (best choice +0.05 to +0.15 of the budget at the reference player), the wrong one a lot less (worst −0.35 to −0.6, one-on-ones and shots at goal −0.6 to −0.75). A player who chooses at random therefore realises 10–25% less than the budget, one who reads the pitch slightly more; the striker's benchmark in the 10,000-match test plays fixed choices and still scores 2.6 a match. `npm run profile:match` measures it; at the reference player every base choice wins under some combination of reads (`tests/match-choices-22.test.ts`).

**The pitch shows them** (`stageReads`): the moment's last keyframe moves the people a read is about — the keeper off his line or across to the near post, the striker's angle and your own position in a one-on-one, the shot's distance, the runner in the race for a ball over the top, two more defenders in a wall, the press closing in or sitting off, bodies in the six-yard box, zonal or man marking at a corner, your line together or one man deep, the cover behind a last man. The free kick's distance moves its spot (81, 76 or 71 from the player's own goal line). The last step is drawn out by up to 2.5 s so they reach their marks at a sprint, never faster; the player on the ball moves only with it.

### Situations per position (review M9)

Eight new situations (`SITUATIONS_22` in `src/engine/match/situations22.ts`), with their attacking and defending weights for the moment budget: **last-man** (defence 2.2: take him down, chase him back, show him wide), **cross-defence** (0.9: attack the ball, stay with the runner, close the crosser), **two-on-one** (1.4: go to the ball, cut out the pass, back off and delay), **set-piece-marking** (0.8, with the set pieces: hold your zone, mark their best header, attack the near post), **sweeping** (defence 1.6, attack 0.2: rush out and clear, come out and take it down, stay home), **back-pass** (defence 0.7, attack 0.35: clear first time, take a touch and pass, go round the striker), **rebound** (attack 1: first time, control and place, cut it back), **weak-foot** (attack 0.8: shoot with the weaker foot, shift onto the stronger, lay it off; never offered to a two-footed player; the weaker-foot shot carries the weaker-foot factor wherever the post is). The match-21 situations take new position weights (`POSITIONS_22`), so no position spends more than about a third of its moments in one situation:

| Position | Situations before → after | Most common before → after (`match-profile` / `-b`)  |
| -------- | ------------------------- | ---------------------------------------------------- |
| GK       | 5 → 7                     | shot incoming 41 / 43% → 30 / 31%                    |
| CB       | 5 → 9                     | defend-attack 54 / 46% → 30 / 26%                    |
| LB       | 6 → 10                    | defend-attack 50 / 43% → 28 / 25%                    |
| DM       | 6 → 10                    | defend-attack 49 / 41% → 34 / 29%                    |
| CM       | 9 → 12                    | build-up 27 / 25% → 23 / 21%                         |
| AM       | 7 → 9                     | box-chance 34% / edge-of-area 31% → 26% / 25%        |
| RW       | 7 → 9                     | build-up 34% / box-chance 32% → 27% / 25% (build-up) |
| ST       | 6 → 8                     | box-chance 42 / 36% → 29 / 25%                       |

Each situation has five framings on match-22 (`moments22.situationVariants`; the shootout keeps its three). The new framings and the reads' words load with the match's commentary (`src/i18n/momentsCopy.ts`, through `screens/match/lines.ts`), off the route's first render; until then a moment reads its situation's plain sentence.

### Shares and auto-play

More of a match passes through the player's decisions (`moments22.shares` replaces `shares` × `defending`; [attack, defence]): ST 0.37/0.05 (unchanged attack, which the striker's goal gate holds), LW/RW 0.46/0.08, AM 0.36/0.07, CM 0.32/0.16, DM 0.12/0.48, CB 0.08/0.60, LB/RB 0.12/0.55, GK 0.06/0.75 (match-21: ST 0.37/0.04, wide and AM 0.32/0.05, CM 0.26/0.12, DM 0.10/0.546, CB 0.07/0.48, full-backs 0.10/0.42, GK 0.03/0.585). Auto-play (simulated career matches and the profile's best policy) draws only between choices within `moments22.autoPlayMargin` 0.004 goals of the best (`autoPlayMargin` 0.02 before, when most choices were within it).

### Skill mechanics (review C13, C14)

- **A skill's choice replaces the weakest base choice** (lowest expected value at that moment) when more than four would be offered, instead of hiding an appended one: Last-Ditch no longer hides Track the runner.
- **Clutch** no longer boosts four shots at any time. In a clutch moment — from `clutch.fromMinute` 75 with the game within `closeMargin` 1 goal, in a fixture of importance `importance` 1.25 or more, or the shootout — every choice takes a "Clutch" factor × `odds` 1.15.
- **Ball Winner** unlocks "Win it and drive forward" in defend-attack, **Maestro** "Play a first-time ball over the press" in build-out (`UNLOCKS_22`), and **Distributor**'s quick release starts a counter (`COUNTER_22`): a success adds `counter` 0.05, 0.06 and 0.05 expected goals on top of the moment's budget (counted in the choice's stakes, so its value hint shows it). The stacking cap for multipliers is unchanged.

### The professional foul and a card's cost

The last man's "Take him down" is the foul (`foulOnSuccess`): it succeeds 0.86 at the reference (some danger stays: `againstOnFailure` 0.7, the free kick), and when it succeeds a card follows with the foul chance (`booking.choices['professional-foul'].foul` 1, by aggression and tackling, up to 1), a straight red with `moments22.professionalFoul` 0.04 when covered and 0.12 when no one covers (`BookingRisk.onSuccess`). On match-22 every booking risk also carries its **cost** in the choice's value (`BookingRisk.cost`): the dismissal chance × the rest of the match ÷ 90 × (own expected goals × `cards.menDown.attack` + the opposition's × `concede`), so a reckless challenge reads as costly. New defending choices have booking risks too (chase back 0.08, go to the ball 0.10, close the crosser 0.06, mark their best header 0.05, win it and drive 0.12).

### The marked man (review C17)

When the player's ability exceeds both the match level and the opposition's mean ability by more than `marked.threshold` 8, opponents double-mark them: e = min(`maximum` 0.3, excess × `slope` 0.025). Their shots and dribbles × (1 − e), passes to a teammate × (1 + e × `passShare` 0.5) — one "Double-marked" factor — and clean chances in the box come up × (1 − e × `boxChance` 1). From `relaxFromMinute` 60 an opposition behind in the game marks × `relax` 0.5 as tightly. A lower-league star sees fewer clean looks and a teammate left free; in a league that matches them, nothing changes.

### Ratings and rewards after 5.2

The rating's par (step 5.3) counts the reads: the reference odds a moment is measured against are the base odds with each read factor's multiplier applied (recovered from its contribution), so taking what the pitch offers is worth its goals rather than extra rating. To keep the asserted ratings target on both seeds, `rating22.decision` is now shooting 0.2, passing 0.35, dribbling 0.4, defending 0.35, keeping 0.37 (0.25/0.25/0.25/0.35/0.4), and `assist` 0.85 (0.7): midfielders' best matches reach 9 again without raising the striker's share of 9s. `rewards22.position` keeps XP a match within 1% of the table above: CB 1.21, CM 0.62, AM 0.74, LW/RW 0.78 (1.1, 0.8, 0.85, 0.9).

### Results (300 matches a position, both seeds)

| Position | Perfect vs worst before → after (`match-profile` / `-b`) | Rating mean after | Striker's goals a match   |
| -------- | -------------------------------------------------------- | ----------------- | ------------------------- |
| GK       | 0.09 / 0.16 → 0.40 / 0.38                                | 6.87 / 6.52       |                           |
| CB       | 0.17 / 0.09 → 0.58 / 0.46                                | 6.59 / 6.70       |                           |
| LB       | 0.12 / 0.03 → 0.52 / 0.54                                | 6.83 / 6.65       |                           |
| DM       | 0.10 / 0.08 → 0.50 / 0.44                                | 6.85 / 6.88       |                           |
| CM       | 0.24 / 0.15 → 0.48 / 0.46                                | 6.70 / 6.79       |                           |
| AM       | 0.16 / 0.10 → 0.61 / 0.50                                | 6.77 / 6.58       |                           |
| RW       | 0.09 / 0.16 → 0.36 / 0.49                                | 6.58 / 6.86       |                           |
| ST       | 0.32 / 0.31 → 0.46 / 0.48                                | 6.80 / 6.68       | 0.50 / 0.47 → 0.52 / 0.47 |

Standard errors 0.06–0.08. No dominant choice: 48 situation-seeds judged, the most dominated free kick _short_ 58%, rebound _cut back_ 58%, edge of the area _lay off_ 57% (before: one-on-one _stay_ 96%, penalty save _stay_ 71–100%, free kick _short_ 76–85%, corner _short_ 76–77%, short distribution 78–84%; punch now best in 16–31% of crosses). Every asserted gate holds on both seeds, including the ratings and match-statistics targets of step 5.3 and the choreography's 10 ms (5–7 ms a match on an idle machine). The 10,000-match test (the striker's benchmark, which plays fixed choices, so it pays the reads' lean): 2.58 goals a match (2.66 after step 5.3), home 1.38 / away 1.24, home wins 40.2%, draws 26.7%, close upsets 24.3%, wide upsets 10.1%, all in their bands.
