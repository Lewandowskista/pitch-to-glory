# Balance overhaul plan — 8 October 2026

**Status:** All five passes complete. Open follow-ups: rival growth tied to minutes played; a hostile seniors clique lowering selection; a world profile over more seeds in CI. The evidence is [GAME-DESIGN-REVIEW.md](../../GAME-DESIGN-REVIEW.md); [AGENTS.md](../../../AGENTS.md) remains the product authority. Every pass is measured by `npm run profile` (`scripts/career-profile.ts`), whose gates grow with each pass, and documented in `docs/BALANCING.md` and `docs/VERIFICATION.md`.

The mandate: fix what the review found, and add content where a system is thin rather than only retune it (more to buy, more kinds of objective and key moment, more story).

## Pass A — one ability scale (progression)

- [x] Position-weighted `playerAbility` used everywhere the plain mean was.
- [x] Passive development toward the cap, driven by playing time.
- [x] Level curve 500 × 1.02ⁿ with 5 points a level; `levelXp` recorded (schema 17) so levels are never taken or granted by a curve change.
- [x] XP weighted to performance and key decisions; absolute opposition factor; caps that hold (rising cost, hard stop before 24).
- [x] Training and recovery constants; rush risk by severity; career-threatening injuries that are.
- [x] Skill tiers 2/3/4/5; archetype emphasis × 2.5.
- [x] `npm run profile` and its gates; `tests/balance.test.ts`.

**Measured:** ability at 25 of 68–85 across four careers (was 27–37); top tier by 21–25; 20–50 appearances a season; senior caps for three of four.

## Pass B — decisions with trade-offs (match)

- [x] Distinct risk profiles per choice (rebounds, receiver-aware passes). The exact odds stay on the choice, as the spec's transparency asks.
- [x] Asymmetric mentality and role effects; risk setting that applies to shots.
- [x] Momentum feeds odds; fatigue and substitutions that happen; half-time and substitution responses applied (trust and odds).
- [x] Goal shares and assist rewards; rating result term and keeper credit; fame for non-scorers with decay; objectives of several kinds seeded per fixture, with reachable targets.
- [x] Skill stacking; trait application by probability band; the five unread skills given effects; hidden consistency and big-match temperament used.
- [x] Familiarity from minutes played out of position.
- [x] The defending calibration gap was sampling noise: a 36,000-roll probe of the seeded RNG showed no bias; the gate allows 7 points over 100 decisions and 4 over 500.
- [x] `MATCH_ENGINE_VERSION` bump with legacy replay for saved sessions and Moments.

**Gate (`npm run profile:match`, 300 matches a position):** ST 0.35-0.55 goals a match; GK rating p90 at least 7.6 and 9+ reachable everywhere; every objective kind 14-75% complete; outfield substitutions 4-25%; an attacker's goal involvement at least 25% higher under the best policy than the worst; stated odds within 7 points over 100 decisions and 4 over 500. **Measured:** ST 0.48 goals; GK p90 8.5; objectives 15-72%; substitutions 5-8%; involvement +29-48%; all buckets within tolerance.

## Pass C — a world that moves

- [x] Club reputation dynamics; an AI transfer window with fees; rotation, fatigue and injuries for AI players; ability-aware background goals, assists and ratings.
- [x] Lifecycle weeks derived from the season length; strength scale and tier bands; sackings as a weekly hazard with manager ability in team strength.
- [x] Generation fixes (ages, foreign share, intake spread, footedness); 90+ players; continental places and prizes.

**Gate (`npm run profile:world`, 12 seasons):** champion share of points ≥ 60%; favourite at home or away wins ≥ 50% of decided tier-1 matches; ≥ 60% of tier-1 squad members with ≥ 5 appearances; Spearman(goals, finishing) ≥ 0.3; ≥ 100 reputations moving and ≥ 100 paid transfers a season; 40–200 sackings a season; someone at 90+ and tier means within 4. **Measured:** 60–68%; 60–63%; 65–67%; 0.67–0.74; ~600 and ~1,000; 108–148; 2–3 at 90+, tiers within a point. Continental cups keep their 32-club format; they now pay prize money and the winners gain reputation.

## Pass D — stakes (economy and relationships), with content

- [x] Wage formula and budgets; key-role bids; offer cooldowns; free agency; promise thresholds; negotiation with walk-away; agent differentiation.
- [x] A lifestyle catalogue worth spending on: homes and cars priced in wage-weeks with upkeep; personal staff (physio, nutritionist, coach, analyst) that change injury, fatigue, training and decisions; holidays and family that move morale; a foundation that moves fan affection; riskier investments; sponsor deals with real failure.
- [x] Trust and fan decay; morale and form that respond; chemistry, dressing room and culture fit with effects; press resolved against results; award weighting; national-team projection; goal and promise targets; forced retirement by decline. Not done: rival growth tied to minutes (AI development has no per-season minutes yet) and a hostile seniors clique lowering selection; both noted for pass E.

**Gate (`npm run profile`, with a spending policy):** ≤ 60 declined offers in a career; trust below 70 in ≥ 15% of weeks; ≥ 20% of earnings spent on the lifestyle; no national award for a season below tier 3; tier-1 wage ≥ 3 × tier-4 wage at equal ability (unit). See VERIFICATION.md for the measured values.

## Pass E — tests that guard dynamics

- [x] `scripts/career-profile.ts` with gates.
- [x] Per-position match profile (`npm run profile:match`), world dynamics (`npm run profile:world`, `tests/world-dynamics.test.ts`) and career gates (`npm run profile`) with checks; unit suites `tests/balance.test.ts`, `tests/economy.test.ts`.
- [x] `docs/BALANCING.md` carries a section per pass with the constants and the measured values; the three profiles and their checks run in the weekly Performance workflow (`balance` job) and upload their results.
