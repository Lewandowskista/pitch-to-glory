# Interactive match balancing

Milestone 3 uses regulation-time friendlies. All principal tuning is in `CONFIG.match` in `src/engine/config.ts`; `engine/match/tuning.ts` is an alias. Pitch geometry, lineup positions and regulation minutes are fixed structural values.

## Scoring model

The expected total starts at 2.7 goals. The home share is `logistic(clamp(homeReputation − awayReputation, −75, 75) × 0.026 + homeAdvantage)`, with `homeAdvantage = 0.18`, or zero on neutral ground. Personal mentality adjusts the selected team's share by +0.035 attacking or −0.035 defensive; cut-inside adds 0.015 and track-back subtracts 0.015. The share is bounded to 0.12–0.88. High risk multiplies total expectation by 1.09; low risk by 0.94. A captain instruction or requested role change recalculates these expectations.

Each minute resolves background shots with a 0.12 conversion chance. A personal attacker replaces 35% of their team's background goal budget with decisions; a personal keeper/defender replaces part of the opposition's budget with defensive moments. Goals always require a recorded shot. Selected-player goals and assisted teammate goals are recorded once; substitutions remove the selected player from subsequent frames, scoring and actions.

Shot choices start from `selectedTeamExpectedGoals × 0.35 / momentCount`, multiplied by 1.1 for near-post and 0.9 for far-post. Non-shot base success chances are 0.8 for passing/distribution, 0.78 clearing, 0.52 rushing, and 0.62 for other actions. Relevant attribute contributions use `(attribute − 50) × 0.004`; opposition quality subtracts `(reputation − 50) × 0.0025`; fatigue subtracts `fatigue × 0.002`. These three contributions are divided by ten for scoring chances. Action-specific traits add 0.08. Matching roles add 0.04, or 0.008 for shots. High risk subtracts 0.04 from ordinary execution but adds 0.008 to shots; low risk reverses these adjustments. Non-clear weather subtracts 0.025, or 0.004 for shots. Probabilities are bounded to 0.12–0.94, or 0.02–0.94 for shots; any bounding adjustment appears as another displayed factor.

A seeded roll resolves the displayed probability. Every explicit outcome retains its input, roll, probability and exact factors. They sum to the shown probability, including the base and limits. Successful attacking passes/dribbles can create a shot from the personal budget; keeper saves and failed defensive actions influence opposing shots. Ordinary passes use the player's passing and fatigue and contribute to the report's actual pass count/map.

## Time, opportunities and fatigue

Full matches last 90 minutes. Opportunity count is `clamp(8 + positionalInvolvement + round((form − 50) / 15) + seededJitter, 6, 15)`. Involvement is three for attackers, one for other outfield players and zero for keepers. Opportunities are spread through minutes 4–86 with bounded seeded jitter. A substitution shortens involvement. Half-time, choices, substitution acknowledgement and captain instructions must resolve before another minute can advance.

Fatigue increases each played minute by `0.48 × (1.3 − stamina / 150)`, plus 0.08 under high risk. Half-time recovers eight points and that recovery persists. From minute 65, fatigue at least 82 or fitness below 50 triggers a replacement when an eligible substitute exists. Match UI time (850 ms per minute at 1×), 2×/4× speed, frame interpolation and visibility are presentation controls; they never enter RNG.

## Reports

Rating starts at 6.5; successful decisions add 0.12, failures subtract 0.13 and a successful shot adds 0.55. Rating is bounded to 3–10 and rounded to one decimal for the report. The rating factors reconcile the base and accumulated performance contribution.

Performance XP is `round(minutes × 1.2 + max(0, rating − 6) × 25 + goals × 30 + assists × 20 + completedObjectives × 15)`. Fame is `round(max(0, rating − 6.5) × 2 + goals × 2)`. Friendlies calculate these values without granting progression. Career opposition-strength/importance multipliers and level-up allocation belong to milestone 4.

Heatmaps use recorded player positions. Pass/shot maps use event origins and destinations, including the change of ends at half-time. Key moments put the ball at the selected player's position; resolved choices/goal destinations drive the short pitch highlight. Objectives evaluate rating, passing percentage or the team's clean sheet. Reactions/headlines derive from rating and goals; they are localized templates rather than arbitrary generated text.

## Statistical gate

The deterministic benchmark plays 10,000 complete matches: 6,000 equal-reputation fixtures, 2,000 with a 15-point gap and 2,000 with a 45-point gap. It alternates shooting, passing and dribbling, answers half-time and required prompts, and uses fixed independent seeds. Recorded on 6 October 2026:

| Measure                          | Result |
| -------------------------------- | ------ |
| Goals per match, all cohorts     | 2.7545 |
| Equal teams: home goals          | 1.5138 |
| Equal teams: away goals          | 1.2305 |
| Equal teams: home wins           | 43.62% |
| Equal teams: away wins           | 30.60% |
| Equal teams: draws               | 25.78% |
| Away underdog wins, 15-point gap | 21.35% |
| Away underdog wins, 45-point gap | 7.05%  |

Tests enforce 2.5–2.9 goals, home advantage, 18–35% draws, plausible bounded upset frequencies and fewer upsets at the wider gap. These measurements are calibration evidence for this policy/cohort, not proof that every tactic, position or attribute configuration has the same distribution. Separate tests cover goal/shot conservation, goalkeeper choices, role-sensitive lineups, half-time recovery, substitution, factor sums, immutable replay and corrupt imports. Background league results retain their existing source-world score resolver; interactive career-fixture integration is a milestone 4 dependency.
