# Interactive match balancing

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

Rating starts at 6.3. Decisions are expected-value-neutral: success adds `0.6 × (1 − p)`, failure subtracts `0.6 × p`, credited to the choice's family (shooting, passing, dribbling, defending, goalkeeping). Outcome bonuses: goal +0.6 and assist +0.6 (equal so finishing and creating choices with equal expected goals are rating-neutral), saves and defensive stops `1.5 × G / p` on success (expected value `1.5 × G` for every choice in the situation), and −0.45 for every goal conceded from the player's own moment. The live rating is bounded to 3–10; the report lists the base, each non-zero part and a limit-and-rounding factor that makes the factors sum exactly to the one-decimal report rating.

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

**Objectives.** A rating target of 7 and one objective drawn for the position each match: keepers a clean sheet or 5 saves; defenders a clean sheet, 3 tackles or a passing rate; defensive midfielders a passing rate, 2 tackles or a clean sheet; central midfielders a passing rate or an assist; attacking midfielders a passing rate, an assist or 2 shots; strikers a goal or 4 shots; wingers a goal, 2 shots or an assist. The passing target is the player's routine completion (`0.68 + passing x 0.002`) minus 3 points, within 65-90. Measured completion 15-72% by kind.

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

**Profile** (`npm run profile:match`, 300 matches a position): striker 0.49 goals a match, keeper p90 8.6, every position reaching 9, outfield substitutions 6–9 %, attacker involvement best/worst ×1.4–1.8, stated odds honest, and choreography 5.1–5.6 ms a match (motion and narration; 7.6–8.3 ms a whole match), inside the 10 ms budget. The objectives gate reads 76 % for the striker's and the attacking midfielder's shots objective against a 75 % ceiling: moving the objectives to their own stream changed which of the 300 matches are offered it. Over all 1,200 matches of a longer run, a striker reaches four shots in 73.8 % of matches (72.9 % on `match-14`) and an attacking midfielder two in 72.3 % (71.7 %), so the population rate is unchanged and sits just under the ceiling; at 300 matches the measured subset (about 150 matches) varies by ±4 points either way (`match-14`'s subset read 69 %).

### M4: the cast and each choice's target

**Cast.** Every key moment carries `KeyMoment.zone` (`def`, `mid`, `final`: the third of the situation's spot) and `KeyMoment.cast` (`MomentCast`): `selected`; `presser` (attacking: the opponent set goal-side of you, drawn for the odds by `contextFor`; defending: the attacker on the ball); `cover` (attacking: the next one or two opponents nearest the ball; defending: the one or two teammates nearest it); `keeper` (theirs when the spot is in the final third, yours in your own third, none when you are the keeper); `free` (the teammates the moment's passes go to); `runner` (attacking: the receiver of a ball in behind; defending: their attacker nearest you, off the ball); `crosser` (the teammate crossing an aerial chance, or their winger on a cross into your box). `scene()` names them after the build-up and moves them towards their marks in the scene's last keyframe, as far as a sprint takes them in its time (covering opponents goal-side of the spot, the runner on the offside line, free teammates a step into space, covering teammates goal-side of the ball; set pieces keep their set-up). Every cast id is on the pitch in the moment's frame.

**Receivers before the choice.** Each pass-type choice (a `pass` event whose chance falls to a teammate) has its receiver drawn on `${seed}:receiver:${minute}` (`:chain` or `:shootout` for a follow-up moment) when the moment opens, like a finisher (strikers 4, other attackers 3, central midfielders 2, others 1; never the keeper or the player), one draw per pass-type choice in catalogue order, locked choices included so the stream never shifts. `resolveChoice` gives a successful pass's chance to that teammate instead of drawing a finisher on the decision stream, so the arrow drawn before the choice points at the player who receives the ball (motion plays the pass to them whatever the move) and takes the chance. Failed shots' rebounds and conceded chances still draw their players on the decision stream.

**The spot's width.** The situation's spot is on the side of the selected player's formation post (`in` width when attacking, `out` when defending) instead of a random mirror, pulled 30 % of the way towards the post in open play (box chance, build-up, edge of the area, aerial chance, defending an attack, building out), plus a jitter of ±4 drawn last on the situation stream, so the situation, the opponents and their abilities are drawn exactly as before.

**Targets.** `DecisionChoice.target` (`ChoiceTarget`): shots at a post (`near-post` the post on the shooter's side, `far-post`, `curler` and the placed penalty the other; everything else where the catalogue aims it, `centre`), and the strike goes there; passes to the named teammate (`teammate`, their point in the frame); carries along their lane (`lane`, the carry the outcome plays); challenges on the attacker on the ball (tackles, blocks, rushing out) or the runner (`runner`); and the space an interception, a jockey, a step up or a drop off, a goal-line clearance or a claimed cross goes to (`lane`).

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
