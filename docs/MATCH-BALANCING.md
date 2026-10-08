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
- **Moments.** The selected player's goals keep up to 12 keyframes of build-up, strike and celebration (`state.highlights`), and Moments clips are cut from them.
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
