# Full app review — 20 October 2026

Reviewed checkout: `57ebf49`. This is a review of the existing game, not a proposal to restart its milestones. Application code was left unchanged.

## Overall assessment

Pitch to Glory has a strong foundation and unusually broad implemented scope. The deterministic engine, versioned saves, national pyramids, procedural identity, responsive navigation, playable match decisions, and persistent careers form a coherent product. The earlier balance and layout work has materially improved it. The app is considerably further along than its version number or the opening paragraphs of some documents suggest.

The next development cycle should concentrate on **making the existing systems create consequential, memorable football careers**. Most of the major systems already exist. Their depth and consistency vary: the player can build attributes, earn moves, answer the press, collect honours, and leave a legacy, but several of the calculations behind those experiences still reward the wrong thing, omit important context, or remove player choice.

My main concerns are the fairness of long-term achievement, the connection between playing time and development, control over career moves, international football, and how differently two careers actually play. These matter more to the experience than another large catalogue of items or additional countries.

## Evidence and limits

The review covered the product requirements in `AGENTS.md`, architecture and realism documentation, the earlier game-design and engagement reviews, the layout plan/review/progress, engine and career entry points, domain types, store/worker/persistence boundaries, route implementations, browser tests, CI, and the balance harnesses. Earlier findings were checked against current code; they are not automatically treated as current defects.

Fresh verification:

| Check                              | Result                                                                                                                                                                                          |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test`                         | **446 passed across 53 files**; includes the 10,000-match statistical test                                                                                                                      |
| `npm run build`                    | **Passed**, including TypeScript and every route's 300 KB gzip JavaScript budget                                                                                                                |
| `npm run lint`                     | **Passed**                                                                                                                                                                                      |
| Selected Playwright journeys       | **96 passed** across Chromium, Firefox, and WebKit                                                                                                                                              |
| `npm run profile:match`            | 300 baseline matches per position for eight positions, plus specialised best/worst policy comparisons                                                                                           |
| `npm run profile:match -- --check` | **All six gates passed**                                                                                                                                                                        |
| Targeted review probes             | Confirmed stale playing-time growth, a skill-stacking blind spot, an automatic free transfer, experience-action mutation, outcome-based coaching advice, and a forced-decline retirement bypass |
| Fresh full career                  | Specialised CB, national world, seed `review-2026-10-20`: 18 seasons to voluntary retirement at 34; applicable single-profile gates passed                                                      |
| Fresh visual captures              | Desktop hub, training, matchday entry; phone hub and transfer talks; no page errors in that capture session                                                                                     |

The selected browser run covered foundation, career, match, layout, market, social, and honours specs. It was not a fresh run of every browser spec. Existing release, offline, audio, accessibility, and performance coverage was inspected; a new Lighthouse audit, real-device Safari test, long-term player study, and independent federation-rule audit were not performed. The full career profile is recorded separately below. Browser automation and headless policies cannot establish whether repeated seasons are enjoyable to human players.

Local review evidence is under [artifacts/review-2026-10-20](../artifacts/review-2026-10-20/), including [probe source](../artifacts/review-2026-10-20/probes.ts), [probe output](../artifacts/review-2026-10-20/probes.json), and fresh captures. These are local artifacts, following the repository's existing ignored-artifact convention.

Priority labels below are development priorities: **P1** materially affects the career's central promise; **P2** meaningfully weakens a system or flow; **P3** is a smaller consistency or maintenance issue. A design recommendation is distinguished from a reproduced defect.

## What is working well

1. **The architecture supports this game's scope.** Framework-free simulation, seeded randomness, worker jobs with saved checkpoints, and separate platform services are appropriate choices. Save validation, session replay, ownership locks, and migration deserve particular credit: protecting a long career is part of game design.
2. **The visual identity is coherent.** Crests, kits, portraits, green/gold identity, typography, and rounded panels fit a readable football career game. Self-contained SVG assets are a good fit for offline delivery and a fictional world.
3. **The layout work solved real problems.** Current hub stacks, compact phone condition summary, grouped career navigation, training controls, skill sheets, and history layouts are substantially better than the October 9 baseline. The fresh phone hub puts condition beside the next action. The selected layout tests pass in all three engines.
4. **The world has substance.** Country-specific groups, playoff structures, reserve restrictions, feeder movement, continental competitions, AI development, transfers, injuries, manager changes, and reputation movement are implemented. The original uniform-world concern is no longer a useful description of new careers.
5. **Matches have a sound statistical foundation.** The fresh 10,000-match test produced 2.6594 goals per match, a 42.30% home win rate, 31.68% away wins, and 26.02% draws in its equal-reputation sample. Away upsets declined from 22.4% at a 15-point reputation gap to 8.7% at a 45-point gap. These are results of the configured test scenarios, not a claim about every competition or tactic.
6. **Decision transparency is valuable and should stay.** Odds calibration passed; fatigue, morale, attributes, opponents, traits, role, conditions, and momentum have explainable effects. Chained attacking moments and late-game pressure are good additions.
7. **Several earlier systemic defects are genuinely repaired.** Position-weighted ability and passive growth address the old progression dead end; trust now decays; half-time trust reaches the career; AI rotation and injuries exist; reputation changes; offer cooldowns and negotiation limits exist. Goals-per-match alone is no longer the only balance check.
8. **The complete career wrapper is already present.** Stories, promises, ambitions, reviews, rivalry, sponsorships, late-career projects, farewell, testimonials, Chronicle, and child careers give the game an identity beyond a match simulator.

## Highest-priority findings

### R1 — P1: Hall of Fame rankings do not compare players on equal terms

**Confirmed implementation issue and design imbalance.** [retirement.ts](../src/engine/career/honours/retirement.ts), especially `hallOfFameScore`, `hallOfFameStanding`, and `careerHallOfFameScore`.

The career's score includes caps, trophies, awards, and Golden Balls. Ordinary world players are compared with `caps: 0` and `trophies: 0`; their available awards count, but archived players fall back to club statistics alone. League awards are also generated around the career's tracked league, rather than a complete equal record for every league. Rankings can therefore change in meaning with observation and archival.

The formula gives goals two points and assists one, but no direct credit for clean sheets or defensive contribution. A keeper's excellent career relies on appearances and honours to compete with the inherent scoring advantage of a forward.

For illustration, 100 appearances, five trophies, and 50 caps are worth 175 points for the career. The same club statistics are worth 50 for an AI player before their recorded awards; that AI player's trophies and caps cannot close the difference through this ranking path. The arithmetic is reproduced in the probe output.

**Why it matters:** the Hall of Fame is a major long-term goal and one of the game's defining rewards. Becoming a legend should be credible across positions and generations.

**Recommendation:** define one lifetime achievement ledger and use it for active players, archived players, and legacies. Preserve earned honour points when pruning detailed history. Include position-appropriate contribution and competition level. If full international histories for every AI player are too expensive, use a clearly described comparable club-career ranking until the ledger supports the broader claim. Do not silently mix different scoring criteria.

**Acceptance:** identical achievements produce identical scores for career/AI/archived players; archival preserves rank; strong keeper and defender careers can compete with strong attacking careers without arbitrary position bonuses.

### R2 — P1: Playing-time development continues to reward old appearances indefinitely

**Reproduced defect.** [training.ts](../src/engine/career/training.ts), `developCareer`, line 197 onward; [balance.test.ts](../tests/balance.test.ts).

The growth multiplier takes the last eight entries in `career.matches`, sums minutes, and divides by eight full matches. It does not consider when those appearances happened or the number of subsequent missed opportunities. A player with eight old full appearances retains the full playing-time component while healthy but indefinitely benched. Injury currently stops passive growth during the injury branch, but after recovery the old appearances still supply the same bonus.

In a controlled probe with identical attributes, age, and RNG streams, eight recent appearances and eight appearances from three seasons earlier both produced **239 individual attribute increases across 60 development calls**, with identical final attributes. This is a diagnostic comparison, not a simulation of a real season's fixtures.

**Why it matters:** taking a lower-paid move or loan for minutes should be a meaningful development decision. This calculation weakens that trade-off and the credibility of coaching advice.

**Recommendation:** measure recent available match opportunities and actual minutes over the same bounded period. Distinguish benching, injury, registration, and a genuine winter/offseason break. Keep a baseline growth floor so a temporary injury does not wreck a young career.

**Acceptance:** sustained benching reduces the playing-time bonus; normal breaks do not; returning to regular minutes restores it. Test the actual state of a benched career, rather than synthetic zero-minute appearances that the real career history does not normally store.

### R3 — P1: Contract expiry can choose the player's next club for them

**Reproduced agency defect.** [offers.ts](../src/engine/career/market/offers.ts), `freeTransfer`, line 480; [week.ts](../src/engine/career/market/week.ts), `marketRollover`.

After the contract option has been used, expiry calls `freeTransfer`. It selects the most reputable active scouting interest, creates terms, marks them accepted, and executes the transfer. There is no player acceptance step. With nobody suitable scouting, the current club extends the deal again, albeit at an improved wage where applicable.

The review probe moved the player between clubs by calling that expiry fallback with scouting interest and **no player acceptance command**. The old infinite stale-wage trap has been mitigated, but the replacement still removes a central career decision.

**Recommendation:** make expiry a bounded decision: negotiate with interested clubs, accept a short bridge deal, or enter a free-agent trial/offer period. Keep time advancing and the player supported without selecting a permanent destination automatically. Explicitly show any club option when signing the contract.

**Acceptance:** an unsigned offer or scouting interest never causes a permanent transfer. Expiry remains playable with zero offers, including for older players.

### R4 — P1: The largest occasions offer less agency than ordinary club matches

**Confirmed scope/depth gap.** [international.ts](../src/engine/career/honours/international.ts), [matches.ts](../src/engine/career/matches.ts), [finalize.ts](../src/engine/world/finalize.ts).

National-team windows and complete international tournaments resolve automatically. The career player's part is sampled using position-line goal/assist shares and a separate rating calculation. A world final offers no tactical choices or key moments. Matches labelled qualifiers do not build a qualification campaign that determines entry into the tournament; the field is assembled directly from the six world countries and guest nations.

Club extra time is also simulated after the interactive 90 minutes. The player's shootout choice changes the eventual shootout chance; it is a useful intervention, but does not create a fully playable extra-time and shootout sequence.

**Why it matters:** the game invests in reaching the national team and major finals. These should deliver its most memorable player decisions. The issue is the depth of an existing feature, not a missing National screen.

**Recommendation:** first make the career player's important internationals playable through the existing match command system, with an explicit simulate option. Then expose extra time and a compact shootout sequence. Keep AI matches cheap. A lightweight qualification table can give call-ups and tournament entry an unfolding story without recreating every real-world qualification rule.

**Acceptance:** a player can take meaningful decisions in a national knockout match and final, save midway, resume, and have every cap, goal, reward, and trophy credited once.

## Systems that need more depth or consistency

### R5 — P2: Some additional skills still provide no extra match effect

**Reproduced, narrower than the old non-stacking defect.** [decisions.ts](../src/engine/match/decisions.ts), lines 226–227 and 289.

The normal odds path stacks covering skills. For non-direct choices with a reference probability of at least 0.75, however, the effect changes to a flat `traitImpact` when _any_ skill applies. Further covering skills do not increase that impact or the odds.

At a reference short pass, the probe measured:

| Covering skills                    | Success probability | Goal chance following success |
| ---------------------------------- | ------------------- | ----------------------------- |
| None                               | 86%                 | 6.9815%                       |
| Playmaker                          | 86%                 | 7.6797%                       |
| Playmaker + Maestro + Tempo Setter | 86%                 | 7.6797%                       |

Skills can still grant attributes or affect other choices, so this is not a claim that these skills are entirely useless. The advertised overlap nevertheless stops helping this action.

**Recommendation:** use bounded stacking on the impact path or give later skills distinct effects. Prefer capstones that change available football decisions—receiving under pressure, a second action, specialist distribution—over another small generic multiplier. Explain the effect of the next purchase against the current build.

### R6 — P2: Role promises and positional gameplay use different ideas of a player's job

**Confirmed inconsistency.** [rules.ts](../src/engine/career/market/rules.ts), `deservedRole` versus `slotCompetition`; [match/index.ts](../src/engine/match/index.ts), `playedSlot`, `matchObjectives`, `shares`, and half-time role handling.

Selection has formation-aware slots, but promised roles still use a fixed 4-defender/3-midfielder/3-attacker model. Moments can follow the slot actually played while roles, goal shares, objectives, and some rating treatment continue to follow the primary position. A winger fielded centrally can therefore face one job but receive another job's targets and contribution allocation.

**Recommendation:** carry one effective match role through selection, promises, briefing, involvement, objectives, ratings, and familiarity. Preserve primary position as identity. Before a transfer, show likely slot, fit, immediate competition, and credible minutes under the manager's actual formation. This makes the existing transfer and position-training systems more useful.

### R7 — P2: Coaching diagnoses bad luck as a development weakness

**Confirmed calculation; design interpretation.** [coaching.ts](../src/engine/career/coaching.ts), `coachAdvice`, line 113 onward.

Advice ranks decision families by realised successes below their predicted successes, then recommends attributes that governed failures. Because those predicted odds already account for attributes and opposition, this primarily detects outcome variance. Ten correctly chosen 80% actions that happen to succeed five times cause a training recommendation; a consistently poor choice can escape this warning if its outcomes match its low odds.

The probe reproduced exactly that 8-expected/5-actual finishing recommendation. It does not prove that finishing is never worth training; it proves the current diagnostic cannot establish the claimed reason.

**Recommendation:** distinguish execution, decision quality, and variance. Store the chosen action's expected value and a comparison with viable alternatives, plus relevant context. Recommend training when a useful action remains weak because of the player's attributes. Describe unlucky outcomes as variance. Avoid turning every recommendation into a command to chase recent rolls.

### R8 — P2: Defensive careers lose visibility outside the match report

**Confirmed depth gap.** [moments.ts](../src/engine/career/honours/moments.ts), `captureMoments`; [honours/week.ts](../src/engine/career/honours/week.ts); [rival.ts](../src/engine/career/social/rival.ts); [storylets.ts](../src/engine/career/stories/storylets.ts), `rival-war`.

The refreshed rating and fame balance is much better for defenders and keepers. However, Moments captures the career player's **goals** only. A last-minute penalty save, goal-line clearance, decisive interception, or wonderful assist cannot become a collected Moment. Rival-war follow-ups compare goals, even for a goalkeeper or centre-back. Chronicle's personal match landmarks still heavily favour scoring.

**Recommendation:** extend the existing event-to-Moment pipeline to saves, decisive defensive actions, and assists. Compare rivals by role-appropriate output, match level, and minutes. Add first clean sheet, penalty saved, assist milestones, and defensive big-match stories. Ensure the collection screen has meaningful material for every selectable position.

### R9 — P2: Progression works, but the relative value of training and career paths needs a stronger audit

**Design assessment supported by formulas and the fresh career trace.** [config.ts](../src/engine/config.ts), career development/training; [training.ts](../src/engine/career/training.ts); [career-profile.ts](../scripts/career-profile.ts).

Passive growth closes a configured share of the gap to age-adjusted caps across all trainable attributes. A normal training session distributes about 0.13 progress, before modifiers, among its focus attributes. Three normal sessions over a 60-week season contribute 23.4 total attribute progress before modifiers and caps. A 20-point passive gap across 22 attributes at the full baseline growth rate represents a much larger development pressure. Actual passive growth slows as the gap closes and varies with professionalism and minutes.

This is a sensible way to keep the player viable, but it risks making a detailed three-session planner feel less influential than its presentation suggests. Point spending and passive growth may carry the build while training changes it only marginally.

The fresh specialised CB career reached tier 1 at 20, but played only 11 matches at 21 and later moved again. Reaching a famous club and having a satisfying career there are different balance questions. One automated policy is insufficient to establish the intended pace for everyone.

**Recommendation:** measure the contribution of passive growth, training, level points, and skill bonuses separately. Compare realistic policies: default training, focused development, recovery-heavy, no point spending, one-club loyalty, aggressive moving, and minutes-first loans. Set an explicit intended range for the climb and the prime years. Keep an accessible growth floor while giving training visible, understandable effects on the player's chosen style.

**Related reproduced lifecycle defect:** `retirementState` labels a sufficiently declined player aged 33 or older as `forced`, but [honoursRollover](../src/engine/career/honours/week.ts) only automatically retires for age or a farewell. The hub still offers Next season. In the probe, a completed legacy-format season with the player aged 33 and a high historical peak returned `forced`, then continued into an active career at 34. Either enforce the stated decline rule through one retirement decision path or describe it as advice rather than a compulsory retirement.

### R10 — P2: Narrative memory is shorter than the career it is describing

**Design assessment from the state model.** [storylets.ts](../src/engine/career/stories/storylets.ts), [media.ts](../src/engine/career/social/media.ts), [social/week.ts](../src/engine/career/social/week.ts), [rival.ts](../src/engine/career/social/rival.ts).

Twelve story types, follow-ups, named teammates, recalled press answers, captaincy, and occasions are real improvements. They are still mainly individual incidents applying deltas to a small set of meters. A story kind can recur next season; media memory is short; many relationship effects drift back toward equilibrium. The game has a record of events, but relatively few durable beliefs about who the player has become.

Some responses remain trivially better: encouraging teammates after substitution adds trust without a modeled cost. That is fine as a small role-playing interaction, but should not be counted as strategic depth.

**Related confirmed pacing issue:** [the Continue job](../src/workers/run.ts) checks [transfer-offer deadlines](../src/engine/career/deadlines.ts), rather than every newly generated narrative decision. During a longer injury or fixture break, a story, press question, or sponsor offer can be generated and lapse inside one advance before the player sees it. The hub's preview of already pending items cannot warn about decisions not generated yet. Use an interruption policy for consequential new decisions, with optional delegation for routine press, so advancing time preserves the player's opportunity to act.

**Recommendation:** add persistent facts such as kept promises, repeated public criticism, loyalty to a teammate, mentoring history, difficult returns, and a manager's remembered view. Let later stories check these facts and change opportunities, rather than merely wording. Queue urgent events so an open six-week arc cannot swallow an important occasion. A small connected set of arcs will add more depth than many interchangeable posts.

### R11 — P2: The economy needs opportunity costs beyond having enough savings

**Design assessment; existing improvements acknowledged.** [lifestyle/lifestyle.ts](../src/engine/career/lifestyle/lifestyle.ts), [lifestyle/catalogue.ts](../src/engine/career/lifestyle/catalogue.ts), [world/simulate.ts](../src/engine/world/simulate.ts), `updateFinances`.

The earlier criticism that money has no purpose is out of date. Wage-scaled purchases, staff, recovery, sponsorship obligations and clawbacks, investments, upkeep, and legacy projects exist. The remaining question is whether spending creates interesting choices once income grows.

Buying useful staff and recovery support is mainly an accumulating advantage. Sponsor obligations often reward the actions the player already wants to take. Club wage budgets expand to at least existing payroll, and balances are clamped at zero, limiting the consequences of a club's finances for the career. The spending profile's willingness to buy expensive items establishes a cash sink, not that a human player finds the purchase worthwhile.

**Recommendation:** give commitments a small in-game time or attention cost: an extra session, sponsor appearance, recovery, mentoring, and a social engagement can compete for a limited number of weekly commitments. Offer sidegrades among staff specialities and clear benefits from support already purchased. Let financially constrained clubs affect renewal certainty, recruitment, and support quality in predictable ways. This should be an in-game planning system with no real-time waiting or paid energy.

### R12 — P2: Mobile transfer talks are still visually broken despite passing overflow checks

**Fresh visual reproduction.** [CareerTransfers.tsx](../src/screens/career/CareerTransfers.tsx), line 756 onward. Evidence: [phone transfer talks](../artifacts/review-2026-10-20/negotiation-phone.png), [capture measurements](../artifacts/review-2026-10-20/capture.json).

At 390 × 844, the crest, text block, and Back button stay on the same flex line. The text block becomes only **90 px wide**. “Talks with Oakfield Athletic” wraps into seven lines, breaking club words, while fee and culture text turn into a narrow vertical column. The first screen contains no actual contract terms. This is contained within the viewport, so a no-horizontal-overflow assertion passes.

**Recommendation:** place Back above or below the identity row on narrow containers; let crest plus title use the available width; keep culture detail below that row. Check names and terms at 360/390 px and 130% text. Add a readability/relationship geometry assertion, not just page overflow.

### R13 — P2: Experience purchases violate the action layer's immutability contract

**Reproduced implementation defect.** [lifestyle/actions.ts](../src/engine/career/lifestyle/actions.ts), line 24 onward; [lifestyle.ts](../src/engine/career/lifestyle/lifestyle.ts), `buyAsset`.

The action creates player copies only for wardrobe changes. Buying an experience changes the career player's morale and, for holidays, fatigue, through the shared original object. The probe showed the input player changing from morale 50/fatigue 40 to 56/20, with the returned player still the identical object.

**Why it matters:** previous-state snapshots become unreliable and selectors that depend on player identity can miss the change. This is a boundary defect, not evidence that every holiday currently fails visibly.

**Recommendation:** include experience actions in the touched-player set. Add an input-preservation test for each public action family that claims structural sharing.

### R14 — P2: The shared Chronicle poster reports cap landmarks as total caps

**Confirmed code defect.** [ChronicleView.tsx](../src/screens/career/ChronicleView.tsx), `posterSvg`, line 50; [international.ts](../src/engine/career/honours/international.ts), `credit`.

The poster's cap count is the number of Chronicle entries with kind `cap`. Those entries are written for the **first appearance at each national level**, rather than every cap. A player with many internationals can therefore export a poster showing only one to three caps. Landmark pruning makes event counting an even less reliable source of totals.

**Recommendation:** derive the number from current career honours or the retired legacy record, with an explicit youth/senior definition. Test an export for a career with many caps and a retired parent. Use the same authoritative summary for screen and export.

### R15 — P2: Several quality gates are weaker than their labels or product targets

**Confirmed verification gap.** [performance.spec.ts](../e2e/performance.spec.ts), line 25; [career-profile.ts](../scripts/career-profile.ts), line 383; [match-profile.ts](../scripts/match-profile.ts), `GATES`.

The performance journeys allow 200 ms interactions, a 6-second phone hub readiness budget, and p95 frames of 34 ms. The product calls for actions under 100 ms, initial interactivity under 3 seconds under its stated conditions, and a 60 fps renderer. These are not identical measurements or scenarios, so a passing journey should not be presented as proof of the stricter promises. The current gates do provide useful regression protection.

The career gate labelled “top tier reached by 27” accepts `tier <= 2`. The match decision-effectiveness gate measures attackers' goal involvement; it does not require meaningful keeper or defender policy differences. The existing eight-position profile also needs intentionally different goalkeeper builds and context-aware policies to evaluate those careers well.

**Recommendation:** separate original acceptance targets from machine-specific regression tolerances. Correct misleading gate names/predicates. Add defensive expected-goal prevention, score-aware win/draw objectives, formation mismatch, benching, injuries, and multiple policy/seed checks. Keep confidence intervals and raw distributions; avoid tuning solely to a few fixed review seeds.

### R16 — P3: Some identity choices and football descriptions have little mechanical expression

**Confirmed limited use; proposed improvement.** [create.ts](../src/engine/career/create.ts), [decisions.ts](../src/engine/match/decisions.ts), [selection/world.ts](../src/engine/selection/world.ts), [social/rules.ts](../src/engine/career/social/rules.ts).

Preferred foot is selected and stored but does not affect match decisions. Hidden ambition is generated and revealed but lacks a meaningful downstream engine use in the inspected paths. Club playing style contributes to culture fit, while match resolution uses formation, ability, and manager strength without a distinct pressing/possession/direct matchup model.

**Recommendation:** make identity legible through a few focused mechanics: weak-foot/strong-foot options in appropriate moments, manager style changing situation weights and role requests, and ambition affecting a stated career preference or demand. Each mechanic needs a visible explanation and a countervailing benefit. Keep the player's authority over their own career decisions.

### R17 — P3: Documentation needs a current entry point

**Confirmed maintenance issue.** [ARCHITECTURE.md](ARCHITECTURE.md) opens as milestones 1–4 with later systems described as contracts, despite documenting their implementations further down. [REALISM.md](REALISM.md) still introduces interactive and continental football as later milestones and discusses early schema versions. Its explicit 60 abstract-week calendar is a deliberate adaptation, not a new realism defect.

**Recommendation:** add a short current-state summary, clearly distinguish historical milestone notes, and link current constraints and acceptance evidence. Keep historical review findings, but mark which are resolved so they are not rediscovered as current defects.

## Match and reward balance: fresh measurements

These baseline measurements use the harness's generated legacy-world players and balanced tactics. They are a calibration sample, not the experience of every national-world career.

| Position | Goals/match | Assists/match | Mean rating | 90th-percentile rating | XP/match | Fame/match |
| -------- | ----------: | ------------: | ----------: | ---------------------: | -------: | ---------: |
| GK       |        0.00 |          0.00 |        6.96 |                    8.5 |      136 |       3.21 |
| CB       |        0.02 |          0.01 |        6.77 |                    8.5 |      128 |       2.89 |
| LB       |        0.03 |          0.04 |        6.76 |                    8.3 |      127 |       2.89 |
| DM       |        0.03 |          0.04 |        6.68 |                    8.4 |      125 |       2.27 |
| CM       |        0.20 |          0.23 |        6.48 |                    8.1 |      126 |       2.48 |
| AM       |        0.19 |          0.34 |        6.56 |                    8.3 |      134 |       2.61 |
| RW       |        0.18 |          0.32 |        6.34 |                    7.9 |      119 |       2.01 |
| ST       |        0.50 |          0.15 |        6.63 |                    8.4 |      143 |       2.88 |

Every position reached a rating of nine in the sample. Outfield substitutions occurred in 5.3–8.0% of baseline matches. Objective completion stayed inside the harness's 10–75% bands. All odds-calibration gates passed. Specialised attacking builds benefited from the stronger policy: for example, ST involvement was 0.76 versus 0.41, and CM 0.40 versus 0.25.

This supports keeping the current overall scoring environment and the improved defender/keeper match rewards. It does **not** establish equal positional progression over a career. The RW/GK baseline XP and fame differences, the separate background rating formula, award criteria, international simulation, and Hall of Fame should be evaluated together before changing individual reward constants.

The profile's keeper best/worst aggregate scores rounded to the same values. Its specialisation function explicitly leaves keepers unshaped, and the policy gate excludes them. That is a gap in the experiment, not evidence that all keeper choices are useless. Add specialised keeper scenarios before drawing that conclusion.

## Scope and experience coverage

| Area                               | Current assessment                                                                            | Best next improvement                                                                                       |
| ---------------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Landing, menu, creation            | Finished identity and coherent entry flow; archetypes affect starts                           | Explain the kind of career and the consequences of initial choices; make preferred foot meaningful          |
| Hub, inbox, calendar               | Stronger after the layout and agenda work; next action and deadlines are derived consistently | Lead with the week's consequential decision and retain concise feedback after advancing                     |
| World, squad, leagues, cups        | Broad and relatively mature simulation; explicit realism adaptations                          | Make nearby races, teammates, managers, and destinations matter more to the player                          |
| Match briefing and tactics         | Functional, explainable personal approach and objectives                                      | Tie the actual slot and opponent style to instructions and objectives                                       |
| Live matches and report            | Core loop works; replayable commands, fallback renderer, useful statistics                    | More situational trade-offs; playable extra time; clearer cumulative consequences of decisions              |
| Attributes, training, skills       | Viable progression and real build choices                                                     | Fix playing-time measurement; audit training's contribution and redundant skill overlap                     |
| Transfers, loans, agents           | Substantial scouting/negotiation implementation                                               | Preserve expiry agency; compare likely minutes and fit; repair phone talks                                  |
| Social, rival, dressing room       | Mechanically connected, with authored story arcs                                              | Durable memory and position-appropriate rivalry; make people alter future opportunities                     |
| Fame, sponsors, lifestyle          | Real purchases, obligations, upkeep, staff, and projects                                      | Shared commitment costs and clearer economic choices                                                        |
| Wardrobe and celebrations          | Fits the identity; cosmetic challenge rewards avoid sporting pay-to-win                       | Broaden reward expression for non-scoring careers                                                           |
| National team                      | Selection, caps, windows, and tournaments exist                                               | Put the career player on the pitch for the important matches                                                |
| Awards, retirement, legacy         | Good end-of-career structure; ambitions and farewells exist                                   | Fair shared achievement accounting; extend meaningful prime/decline decisions                               |
| Chronicle and Moments              | Valuable differentiators with export/share                                                    | Accurate totals, defensive/creative highlights, and remembered consequences                                 |
| Settings, accessibility, edit mode | Wide coverage, real routes, keyboard support, motion/text preferences                         | Readability beyond overflow; real-device Safari, touch, and assistive-technology acceptance                 |
| Persistence, offline, release      | Strong engineering and extensive automated coverage                                           | Keep testing populated late careers and interrupted saves/updates; reconcile performance acceptance targets |
| Android                            | Intentionally deferred                                                                        | Complete the web experience and device acceptance before starting the final port milestone                  |

## Missing additions that would improve this game

These are design proposals, not claims that the existing scope requires a large new subsystem in every case. The first four have the strongest return.

1. **Playable major internationals and extra time.** Reuse the existing match engine and save flow. These complete the emotional payoff of systems already implemented.
2. **A lightweight discipline system.** Yellow/red cards, dangerous-tackle risk, and competition suspensions would give aggression, tackling choices, captaincy, rotation, and dressing-room discipline a shared consequence. Signal the risk before selection. Start with the career player's decisions and a modest background model; excessive random dismissals would undermine trust.
3. **Opponent and manager tactical identity.** A pressing side should create different problems from a deep defence. Let personal roles and training prepare for the next opponent. Reuse situation weights and the existing formation/playing-style fields; a full football-management interface is unnecessary.
4. **A weekly commitment budget.** A small number of discretionary in-game commitments gives mentoring, extra training, sponsorship, social life, and recovery a shared cost. Protect core training and avoid making routine maintenance a chore. Make delegation and repeat plans available.
5. **Positional achievement paths.** Keeper and defender Moments, playmaker assist stories, role-specific rival measures, and fair legacy scoring can make replaying a new position feel like a different career.
6. **A purposeful preseason and career transition.** Show the new manager's expectations, competition for places, a development target, and the player's chosen season ambition. Late-career transitions can include changing role, accepting fewer minutes, mentoring, or moving closer to home. Existing reviews, promises, stories, and farewell records can supply most of this.
7. **Persistent narrative facts.** A manager remembers how the player handled a dispute; a youngster remembers mentoring; a club reacts to repeated declarations of loyalty. Use a bounded fact ledger and authored rules, preserving reproducibility and offline play.
8. **Optional session goals alongside real-calendar challenges.** Existing daily and weekly challenges count career actions against a real date, and can be completed through simulated matches. In an injured or benched career, certain objectives may be out of the player's control. Offer an achievable session alternative and explain whether goals require played matches. Keep rewards cosmetic and avoid punishing a player for following their career story.

## Recommended order of work

| Phase | Deliverable                                                                                                          | Why this order                                         | Validation                                                                                                       |
| ----- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| 1     | Correct achievement accounting, stale-minute growth, expiry agency, experience copying, poster caps, and phone talks | Protect trust in outcomes and career ownership         | Focused engine tests, migration/archival cases, export assertions, phone geometry and screenshots                |
| 2     | Align effective role, role promises, coaching, and both skill-effect paths                                           | Make systems explain the same footballer               | Formation mismatch scenarios, trait comparisons, advice tests based on choice quality                            |
| 3     | Playable major internationals and extra time; defensive/assist Moments                                               | Complete existing high-emotion features                | Save/resume/replay, once-only credit, all positions, tournament progression                                      |
| 4     | Tactical identities and bounded commitments                                                                          | Create recurring decisions with real opportunity costs | Multiple tactics and scheduling policies across seeds; compare outcomes and burden                               |
| 5     | Persistent story facts, preseason, and prime/decline arcs                                                            | Sustain interest after the climb                       | Multi-season human playtests and narrative diversity traces                                                      |
| 6     | Reconcile release targets and run real-device acceptance                                                             | Establish a precise web release claim                  | Populated saves, frame timing, interaction latency, offline/update/storage/audio on actual Safari/mobile devices |

Keep save compatibility explicit. Changes to stored career facts, historical scoring, and live match behaviour should have migrations and appropriate rules/session versioning; do not reinterpret a saved match halfway through its command history. Where historical data is unavailable, disclose the limitation rather than inventing retrospective achievements.

## Balance and playtest plan

The next balance pass should compare **distributions and policies**, with the existing harnesses extended rather than replaced.

| Question                                        | Scenarios                                                                                                  | Useful measures                                                                                                                    |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Can different players build satisfying careers? | All positions, countries, archetypes; several seeds; one-club, minutes-first, money-first, ambitious mover | Age at each tier, meaningful minutes, wage, peak ability, legacy outcome, number of disruptive moves                               |
| Does training matter enough?                    | Default, focus, recovery-heavy, mentor, high intensity, extended benching                                  | Attribute growth by source, injuries, minutes lost, fatigue, opportunity cost                                                      |
| Does football judgment matter?                  | Behind/level/ahead late; different builds and opponents                                                    | Win/draw probability, goals prevented, goal involvement, chosen-action regret; avoid treating raw success rate as decision quality |
| Are positions rewarded fairly?                  | Comparable ability, team strength, minutes, and match importance                                           | XP, fame, awards, caps, playable highlights, achievement score by position                                                         |
| Do money and relationships create trade-offs?   | Sponsor overload, limited support budget, repeated public criticism, loyalty, transfer requests            | Foregone commitments, durable opportunities, time at meter caps, recovery after setbacks, spending benefit                         |
| Does a second generation stay believable?       | Full natural retirements and a child career                                                                | Preserved honour scores, world ability/reputation distributions, archived histories, inherited advantage, save size and latency    |
| Does a normal session have a satisfying shape?  | First session, a congested week, an injury spell, prime years, last season                                 | Time to first meaningful decision, repeated text/options, decision burden, memorable events, desire to continue                    |

Start with small seeded samples to find structural failures, then broaden only where variability or an intended balance change warrants it. Treat proposed numerical targets as hypotheses until measured. One seed reaching tier 1 quickly is useful evidence for a playtest question, not enough reason to slow every career.

For human playtests, ask players to explain why they chose an action and recount the last few weeks without looking at the log. If they remember only a rating, a level, and a new club, the systems need stronger consequences and people. If they remember a risky return, a kept promise, a rival encounter, and a decisive save, the existing breadth is producing the intended career story.

## Fresh career profile

A full specialised centre-back profile completed with seed `review-2026-10-20`, using the existing national-world harness and its automated transfer, press, training, point-spending, and shopping policies. The player retired voluntarily at 34 after 18 seasons. This was not a natural forced-retirement or second-generation test.

| Age | Ability | Club/tier at season end     | Appearances that season | Observation                                              |
| --- | ------: | --------------------------- | ----------------------: | -------------------------------------------------------- |
| 17  |    43.1 | Whitby City, tier 5         |                      43 | First season ended above the starting frontier           |
| 20  |    62.7 | Norwich Canaries, tier 1    |                      18 | Reached the top division early                           |
| 21  |    66.0 | Wearside Black Cats, tier 1 |                      11 | A top-tier move did not guarantee minutes                |
| 22  |    68.8 | Greenwich Addicks, tier 3   |                      20 | The career path included a downward step                 |
| 24  |    72.9 | Bremen Greens, tier 1       |                      10 | The eventual long-term club began with limited minutes   |
| 27  |    78.2 | Bremen Greens, tier 1       |                      41 | Became an established regular                            |
| 30  |    80.2 | Bremen Greens, tier 1       |                      48 | Peak measured ability                                    |
| 34  |    74.6 | Bremen Greens, tier 1       |                      41 | Decline occurred without ending the role as a key player |

Final record: **573 club appearances, 27 goals, nine assists, 194 clean sheets, four trophies, and 104 caps across all national levels**. The player earned five monthly awards and one team-of-the-season selection, with no MVP or Golden Ball. Hall of Fame: **912th of 60,967**, score 527. This supports investigating positional achievement fairness; a single career cannot establish the right rank for that record.

The player reached level 80 and fame level 10. Lifetime earnings were 2,150,160 Cr, recorded purchases totalled 502,640 Cr (23.4% of earnings), and savings ended at 560,264 Cr. Fan affection ended between 95 and 100 in every season from age 25 onward. Manager trust remained more variable: below 70 in about 28% of the sampled weeks across the career. The spending policy made no new purchase from ages 26–30, then bought a large project at 31. These distinguish a functioning economy and trust model from a claim that every late-career week has an interesting decision.

All applicable existing single-profile gates passed, including development, playing time, trust, spending, award level, and odds calibration. The specialised-versus-balanced comparison cannot be evaluated from this one run; its gate correctly skips when the comparison group is absent. The misleading top-tier predicate described in R15 remains a separate problem, although this particular career really reached tier 1.

Evidence: [full career profile](../artifacts/review-2026-10-20/career-profile.json), [summary and gate results](../artifacts/review-2026-10-20/career-summary.json), [fresh match profile](../artifacts/review-2026-10-20/match-profile.json). Treat this career as an illustrative reproducible case and combine it with the multi-policy plan above before changing global progression constants.
