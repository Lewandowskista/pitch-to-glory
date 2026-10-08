# Connected systems plan — 8 October 2026

**Goal:** Make the career's systems push back. Every system is now present and most are wired, but almost every consequence is a small number that drifts back toward a midpoint, and the club never acts on the player. After this plan a bad run can become a crisis (dropped, listed, fined, booed), a good run is told back to the player as clearly as a bad one, and every system the player reads about changes something they can feel.

**Status:** Not started. Physical-device acceptance stays skipped (decision of 2026-10-08). [AGENTS.md](../../../AGENTS.md) remains the product authority; this plan builds on the [balance overhaul](2026-10-08-balance-overhaul.md) and must not undo its gates.

**Stack and architecture:** No new runtime dependency. Engine changes stay pure in `src/engine/`; constants go in `src/engine/config.ts`; copy goes in `src/i18n/`; new UI uses Tailwind utilities and shared tokens.

## Evidence

A designer's audit of the working tree on 8 October (code read system by system, with the claims below re-checked by hand; 359 unit tests passing) scored each system's maturity from 1 (barely there) to 5 (complete and deep):

| System                                                   | Score | Why                                                                                                |
| -------------------------------------------------------- | ----- | -------------------------------------------------------------------------------------------------- |
| Match decisions, progression, skills, legacy, Chronicle  | 4     | Real trade-offs and honest odds; content gaps only                                                 |
| Cosmetics and celebrations                               | 4     | Complete; the signature-celebration fame bonus is automatic                                        |
| Match performance → career                               | 3     | A rating reaches 15+ systems, but every effect is soft and the report never says a game went badly |
| Contracts, transfers, selection, fame, sponsors          | 3     | Working, with no club-initiated action and easy targets                                            |
| Lifestyle, media, dressing room, injuries, ageing        | 3     | Real effects with a dominant choice or no lasting pressure                                         |
| National team, awards and Hall of Fame                   | 3     | Internationals simulated with random personal stats; trophy weight ignores the level               |
| Economy, agents, manager relationship, rival, challenges | 2     | Money is unused after a few seasons; agent push is text only; the rival never reacts to the player |
| Fan affection                                            | 1     | Written after every match, read only by morale (±5) and one sponsor check                          |

What a poor match (rating < 5.5) does today: form toward 10 × rating, manager trust −2, fans −1.5, cliques −1.5, angry posts, a critical weekly headline, scouting interest bleeding away, morale down through those parts. What it never does: lower fame, change the squad role, market value, release clause or wage, or make the club act. The worst result of a long slump is a 5–10 point lower start chance, and trust and fans drift back to 60 at 3% a week.

The 17-season striker profile on the same tree (`npm run profile`, `artifacts/profile/profile-ST.json`) shows the frozen role directly: at Braga from 23 to 34 the player sat in the world's 96–99th ability percentile and scored 15–31 goals a season, yet stayed on the "backup" contract signed at 23 for three seasons and "rotation" for the remaining nine, because nothing re-evaluates the role between contracts. Fame rose every season to 1,856 at retirement; the seasonal decay never bound. The model policy never met a setback worth the name, which is what the slump policy in Phase 1 is for.

## Common rules

- **Baseline first.** Commit the balance overhaul (71 modified and 9 new files) before Phase 0 so each phase below is a reviewable change set.
- Write the failing regression or profile gate before the change, as the earlier plans did. Test domain behaviour, not function structure.
- Read `CONFIG.saves.schemaVersion` (17 today) and `MATCH_ENGINE_VERSION` (`match-10` today) at execution time. Bump the schema only when stored contracts change, with migration and validator together; bump the engine version when replayed state changes, keeping legacy replay for saved sessions and Moments.
- New pressure must be **readable**: every consequence the engine applies appears in the report, inbox or hub with its reason, in the same numbers the engine used (the selection-reasons pattern in `careerSelection`).
- Pressure must have **an exit**: every negative state (listed, suspended, demoted, in debt, booed) has a visible way back.
- Add each new dynamic to `npm run profile` with a gate, and document constants and measured values in `docs/BALANCING.md` and `docs/VERIFICATION.md`.
- Two new profile policies are introduced in Phase 1 and used by every later gate: **slump** (picks the lowest-odds choice in every key moment, answers the press provocatively, never trains) and **model** (the current soak policy). A system has teeth when the two diverge measurably.

## Phase 0 — Repair broken links

Defects confirmed in code. No new systems; small, independent fixes.

- [ ] **Fame credited ≠ fame reported.** `commitCareerMatch` calls `performanceFame(me.rating, me.goals)` (`career/matches.ts:182`) while the report passes assists and the back-line clean sheet (`match/index.ts:826`). Pass the same arguments in both; add a test that the report's `fameDelta` equals the committed change.
- [ ] **Holidays have no cooldown.** `buyItem` applies −20 fatigue and +6 morale every purchase (`lifestyle/lifestyle.ts:288-293`). Add `lastExperience` per kind with a cooldown (holiday 8 weeks, family 4) and show the date it is next available. Stored field: schema bump.
- [ ] **The family experience does nothing beyond +3 morale.** Give it the effect its copy implies (for example morale floor +5 for four weeks) or change the copy.
- [ ] **Match injury ignores minutes.** Scale `CONFIG.career.injuries.matchChance` by `minutes / 90` (minimum 0.1) in `career/matches.ts:255`; mirror it for AI players in `world/finalize.ts`.
- [ ] **Key moments ignore the slot played.** `situationWeights(player.primaryPosition, …)` (`match/index.ts:873, 918`) should use the slot the player occupies in the selected formation; apply the familiarity penalty `(100 − familiarity) × 0.1` to governing attributes in that slot. Engine version bump.
- [ ] **Overspend warning disagrees with the engine.** The screen compares upkeep to wage (`CareerLifestyle.tsx:417`); the engine to wage plus sponsor fees (`lifestyle.ts:384`). Use `weeklyIncome` in both.
- [ ] **Boots sponsor exit is free.** Equipping other boots ends a boots deal for −2 fame with no clawback (`lifestyle/wardrobe.ts:97`). While a boots deal is active, lock the boots slot to `sponsorBoots()` (currently never called) and ask before breaking the deal, which then follows the normal failure path.
- [ ] **Dead constants and stale text.** Wire `cliques.transferRequest` and `seniorsTransferRequest` (`config.ts:521-522`) into the transfer-request action; set `agents.connectedPitch` to a value above 1 (it is 1, so the connected agent gets no extra pitches); fix the "must retire at 40" comment in `honours/retirement.ts:10` (the rule is 38).

**Gate:** unit tests for each item; `npm run profile:match` still within its six gates after the slot change.

## Phase 1 — Tell the player what happened

Nothing later lands if the report keeps saying "steady". This phase makes consequences visible before Phase 2 adds harder ones.

- [ ] **Five-band reactions.** Replace the two-way `managerReactionKey`, `fanReactionKey` and `headlineKey` (`match/index.ts:788-796`) with five bands by rating and result (furious, disappointed, steady, pleased, delighted), plus result-aware headlines (poor, defeat, howler from `stats.errors`). Copy in `src/i18n/match.ts`.
- [ ] **"What changed" panel on the report.** A pure `matchConsequences(world, outcome)` returns the deltas a match causes to trust, fans, form, clique affinity, scouting confidence (per tracked club, as a total) and fame, each with its reason. The weekly social and market steps call the same function so the panel and the applied numbers cannot disagree. Show it in `Report.tsx`; on phones, collapsed with the largest two visible.
- [ ] **Weekly digest names trends.** The hub digest (Phase 3.2 of the earlier plan) adds "trust has fallen three weeks running", "two clubs stopped watching you", "fans are turning", from stored history only.
- [ ] **Profile policies.** Add the slump and model policies to `scripts/career-profile.ts` and record their divergence per season (trust, fans, starts, offers, fame).

**Gate:** a report test for each band; the consequences panel matches the stored deltas over a full simulated season; under the slump policy at least one season reports "furious" from the manager.

## Phase 2 — The club acts

The largest gap. Today `contract.role` is only written by signing (`create.ts:138`, `moves.ts`, `offers.ts`), the key-player floor guarantees 75% of starts (`careerSelection`), renewals only improve pay (`market/week.ts:280-283`), and nothing lists, loans out or releases the player.

- [ ] **Squad status, separate from the promise.** Add `market.status: Role`, the club's current view, reviewed at the start of each transfer window and at mid-season: from `deservedRole`, form over the last eight matches, manager trust and culture fit (fit < 40 lowers it one rank). `careerSelection` uses status for its base and keeps the contract role as the promise. Status below the promise is a broken promise through the existing path (`market/week.ts:362-377`: release clause halved, agent push, softer transfer-request cost), now possible for every role. The key floor applies only while status is key. Stored field: schema bump.
- [ ] **Manager meetings.** A status change opens an inbox meeting with two or three responses (accept and fight for a place; demand a move; ask for a loan), each with stated effects on trust and morale. Promotion is announced the same way.
- [ ] **Transfer listing.** The club lists the player when status is backup or youth and trust < 40, or after a transfer request is refused twice. Listed: asking price × 0.7, clubs up to 15 reputation below admitted, an inbox notice, a "Listed" badge on the hub. It ends when status recovers to rotation, or at a move.
- [ ] **Club-initiated loans.** For youth or backup status with fewer than 30% of matchdays selected by mid-season, the club proposes a loan to a lower club. Declining costs trust −5 and keeps the status.
- [ ] **Release.** Listed for two windows with no accepted bid, with wage above `marketWage` at the deserved role: the club offers a mutual termination (severance of 50% of the remaining wage) or the player stays on the fringe (status backup, no selection floor).
- [ ] **Wage pressure on renewal.** When `marketWage` at the deserved role is below the current wage, the club's renewal offer starts at `marketWage`, with role and length to match (decline costs wage, not just pace). Show the reason in the negotiation.
- [ ] **Captaincy as a held role.** Store `club.captainId`, chosen at each season start and on a vacancy from leadership, seniority, manager trust and senior-clique affinity. The career player can be named, keep it or lose it (two "furious" bands in a month, a transfer request, a red card for violent conduct after Phase 3). Captain effects stay as in the match engine (`match/index.ts:420`) and add +0.2 a week to the seniors' clique. Inbox and Chronicle entries for both. Stored field: schema bump.
- [ ] **Transfer requests that last.** While a request is active and for 20 weeks after, trust and fans decay toward 45, not 60; withdrawing does not restore the lost values.

**Gate:** slump policy: status demoted at least once by the end of the second season, and listed or loaned within three; model policy: never listed while status is key; a 31+ decliner's renewal wage below their peak wage; captaincy changes hands at least once in a 17-season model career; unit tests for every transition.

## Phase 3 — Discipline

There are no cards, suspensions or fines anywhere in `src/engine`. It is the most natural bad-game consequence and it touches the match, selection, money, media and sponsors.

- [ ] **Cards in key moments.** Defensive choices (tackle, slide-block, last-ditch) carry a stated card risk from aggression, composure, risk setting and fatigue; failure on a high-risk challenge can be a yellow or a red. The card odds appear in the choice breakdown like any other factor. Engine version bump with legacy replay.
- [ ] **Cards in background play.** `finalizeFixture` draws bookings per side so the world averages about 3.5–4 yellows and 0.10–0.15 reds per match; aggression weights who is booked. Stored in season statistics.
- [ ] **Suspensions.** Five league yellows: one match; ten: two; a red: one to three by type. Suspended players are unavailable to every selector (`selection/lineup.ts`, `careerSelection`). The calendar and hub show suspensions.
- [ ] **Fines and reactions.** A red card costs a fine (one to two weeks' wage), trust −4, fans −2 and a press topic; a second red in a season costs the captaincy. A Chronicle entry for red cards in finals and derbies.
- [ ] **Profile and gates.** Add card rates to `npm run profile:match` and `npm run profile:world`.

**Gate:** world yellows per match 3.2–4.3 and reds 0.08–0.18 over 12 seasons; a career centre-back averages 4–9 yellows a season under the model policy; the slump policy serves at least one suspension in three seasons; score and goal gates unchanged.

## Phase 4 — Fame and money with risk

Fame cannot fall from play, has no effect on wages or scouting, and stops unlocking anything at level 8. Money has no debt and no use after a few seasons. Staff, holidays and the start-up investment are always right.

- [ ] **Fame that can fall.** A rating below 5.0 in a match of importance > 1 costs fame (`(5 − rating) × 3`); red cards (Phase 3) and scandals (below) cost more. Keep the seasonal decay.
- [ ] **Fame that pays.** Wage demands carry an image-rights premium `× (1 + 0.03 × level)` from level 5; scouting visibility gains a fame term; a small fame term enters the Hall of Fame score. Levels 9 and 10 unlock content (a global brand tier and a signature boot line).
- [ ] **Scandals.** A weekly hazard from fame level, the lifestyle held (hypercar, villa) and low professionalism; an inbox event with three responses (apologise, deny, ignore) whose odds and effects on fame, fans, trust and sponsors are stated. Sponsors gain a morality clause: a scandal answered badly can end a deal through the failure path.
- [ ] **Sponsor targets that bite.** The rating obligation scales with the tier (6.4 at tier 6 to 6.9 at tier 1); the image obligation is the season's average fan affection, not the end-of-season value; brands in one category conflict with rivals (accepting one excludes the other for two seasons).
- [ ] **Lifestyle without a dominant purchase.** Staff: two slots from fame level 3, a third at 6, a fourth at 9, with salaries that rise each season the staff member stays. Investments: the start-up's fold chance rises to 2% a season with a visible risk band. Holidays as fixed in Phase 0.
- [ ] **Money that runs out and has a use late on.** Cash may go negative to one month of income, then forced sales, then wage arrestment for upkeep (with an inbox warning at each step). Late-career sinks with lasting effects: fund your first club's academy (fans there +, Hall of Fame +, and a youth-intake bonus visible in the World screen), buy a minority share in a club (inherited as a child-career starting bonus).
- [ ] **Challenges tied to play.** Add challenge kinds measured by decisions rather than counters (win an under-40% key moment, keep a clean sheet as a defender, complete a sponsor obligation) so a session of skipping weeks does not clear them.

**Gate:** at least 35% of career earnings spent under the spending policy; at least one scandal in a 17-season model career with fame level ≥ 7; no lifestyle purchase that improves every measured outcome (a profile comparison of all-staff against two-staff shows a cost); wage at level 9 fame at least 20% above level 3 at equal ability.

## Phase 5 — Relationships with teeth

Fans, the rival and agents are written often and read almost never; three choices are dominant.

- [ ] **Fans who matter.** At home, affection ≥ 80 adds a "fan favourite" factor (× 1.03) to key-moment odds and ≤ 30 a "booed" factor (× 0.97), both shown in the breakdown. Affection ≥ 75 adds 5% to the club's renewal wage; a former club's affection sets the reception on return (press topic and a factor in that match).
- [ ] **A rival who reacts.** Rival growth scales with their minutes (the balance overhaul's open follow-up); the rival is a candidate for the same awards and appears on the shortlist; when the rival signs for a club tracking the player, that club's interest falls by half; provocative press answers about the rival raise intensity, and intensity ≥ 60 makes head-to-head matches importance 1.15.
- [ ] **Agents with a relationship.** Add agent satisfaction (0–100), lowered by declined advice and refused moves, raised by completed deals. A broken promise makes the push mechanical: the agent opens talks with the best fitting club (an interest at confidence 60). Below 20 satisfaction the agent leaves.
- [ ] **Dressing room in selection.** A hostile seniors clique (< 35) takes 0.05 off the start chance (the balance overhaul's open follow-up), shown as a selection reason.
- [ ] **Remove dominant choices.** Half-time "motivate" can backfire when trust < 40 or the team trails by three (stated odds); "humble" after a win costs fame −1 (dull copy); the mentor session uses the mentor's patience (twice a month at most).

**Gate:** slump policy ends at least one season with fans ≤ 30 at its club; the rival wins at least one award the player was shortlisted for across four model careers; at least one agent departure under the slump policy; no press answer is best on every axis in the effect tables (unit test over all topics).

## Phase 6 — Stories and world news

- [ ] **Comeback arc.** After an injury of eight weeks or more, or a demotion, the manager sets a return target (starts or a rating over six matches), on the promise state machine (`career/stories/promise.ts`). Achieved: trust and fans bonus, a Chronicle "comeback" entry.
- [ ] **Club news reaches the player.** Inbox and Chronicle for promotion, relegation, title, continental qualification, and manager changes; club finances below zero freeze renewals at the current wage and can trigger a sale of the best earner (which may be the player).
- [ ] **Internationals from the player's ability.** International goals, assists and rating come from the player's attributes against the opposition, not line shares; international duty can injure; declining a call-up is possible with stated consequences.
- [ ] **Moments beyond goals.** Saves, goal-line clearances and assists qualify as Moments; red cards and comebacks qualify for the Chronicle.
- [ ] **Hall of Fame weights the level.** Trophies weighted by competition (continental > league tier 1 > domestic cup > lower tiers); a trophy needs at least 20% of the campaign's matches, not one appearance (`recordCareerTrophies`).

**Gate:** a model career's Chronicle contains at least one entry from each new kind across 17 seasons; national-team goals correlate with finishing (Spearman > 0.3 over four careers).

## Order and dependencies

Phase 0 first (independent fixes). Phase 1 before Phase 2, so harder consequences are always shown. Phases 3 and 4 depend on Phase 2's status and captaincy for their consequences but not on each other. Phase 5 can run alongside Phase 4. Phase 6 last; the comeback arc needs Phase 2's demotion.

Close each phase with: targeted tests, the full unit suite, `npm run typecheck`, `npm run lint`, the three profiles with their gates, and the affected browser journeys. Update `docs/GAME-DESIGN-REVIEW.md` with a dated addendum when Phase 6 closes, re-scoring every system in the table above.
