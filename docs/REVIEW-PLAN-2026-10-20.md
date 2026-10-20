# Review implementation plan — 20 October 2026

Status: approved, with the decisions at the end confirmed on 20 October 2026. This plan addresses the findings R1–R17 and the proposed additions in the [full app review](APP-REVIEW-2026-10-20.md). It follows the review's recommended order. Each step below was checked against the code at `57ebf49`. Work in reviewable phases, keep the app runnable, and stop with a summary after each phase. Track the results in a matching `REVIEW-PROGRESS-2026-10-20.md`.

## Ground rules for every phase

- **Saves.** `CONFIG.saves.schemaVersion` is 20. Every new stored field is optional and gets a migration in `src/persistence/schema.ts` plus a validator update in `careerValidation.ts` or `worldValidation.ts`. Add a save round-trip test and a migration test from a v20 fixture.
- **When rule changes take effect.** Background rule changes (development, finances, discipline, awards) use a world version flag that is adopted in `startNextSeason`, following the `selectionVersion` pattern in `simulate.ts:590` and `selection/world.ts:12`. A season never changes rules partway through.
- **Saved matches.** Any change to live match behaviour adds a `MatchSetup` flag that `engineFor` (`match/types.ts:39`) includes in the engine id. Older sessions are then rejected through `OutdatedMatchSessionError` instead of being replayed under different rules.
- **Balance.** All constants go in `src/engine/config.ts` and are documented in `BALANCING.md` or `MATCH-BALANCING.md`. After any match or progression change, run `npm test`, `npm run profile:match -- --check` and the career profile.
- **UI and accessibility.** New UI uses Tailwind utilities on the shared tokens, i18n strings, keyboard operation and screen-reader labels. Check every new screen at 360, 390, 768, 1366 and 1440 px and at 130% text size.
- **Old records.** Never invent past achievements. Where old data is missing, show the limitation in the UI and in `DECISIONS.md`.

Sizes: **S** is under a day, **M** is one to three days, **L** is a multi-day feature.

---

## Phase 1 — Make outcomes trustworthy and keep the player in control

Covers R13, R14, R12, the forced-retirement part of R9, then R2, R3 and R1. The small, separate fixes come first so they land quickly.

### 1.1 Experience purchases mutate the shared player (R13) — S

- In `lifestyle/actions.ts:31`, add the career player to the `draftWorld` `players` set for `buy-asset` as well as `wardrobe`. `buyAsset` (`lifestyle.ts:314`) then changes the copy.
- Add a test that the input is left unchanged for every public action family that claims structural sharing: lifestyle, market, social, honours and story choices. Each test deep-freezes the input world, runs the action, and checks the result differs only in the expected objects.

**Acceptance:** buying a holiday returns a new player object, and the input player keeps morale 50 and fatigue 40.

### 1.2 Chronicle poster shows the wrong cap total (R14) — S

- Add one summary selector, for example `careerRecordSummary(world, playerId)`. It reads `career.honours.caps` and `internationalGoals` for the active career, and `Legacy.stats` for a retired one. It returns senior caps and youth caps separately.
- Use it in both the Chronicle screen and `posterSvg` (`ChronicleView.tsx:49`), instead of counting `cap` entries.

**Acceptance:** an export test shows 104 caps for a career with 104 caps. A test with a retired parent's legacy shows the parent's real totals. The poster and the screen show the same numbers.

### 1.3 Phone transfer talks layout (R12) — S

- Rework the header at `CareerTransfers.tsx:756`:
  - Back gets its own row above the identity.
  - The crest and title share one row, so the title can use the full remaining width.
  - Fee and culture fit go below that row at full width.
  - The title size scales down on narrow containers, and words no longer break mid-word.
- Add a browser test for 360 × 640 and 390 × 844, in all three engines, at 100% and 130% text. It opens a real offer's talks view and checks:
  - the heading box is at least 60% of the panel width;
  - the heading wraps to no more than three lines;
  - the first contract-terms control is reachable within one screen of scrolling.

  The current phone test in `e2e/market.spec.ts:200` never opens talks.

**Acceptance:** fresh captures at both widths, and the new test passes in Chromium, Firefox and WebKit.

### 1.4 Late-career decline and longevity (R9 lifecycle) — M

Decided 20 October: playing on gets harder because ability falls quickly, not because the game ends the career. Decline-based forced retirement is removed. How the player trained and built their skills determines how late the fast decline starts.

- **One retirement rule.** In `retirementState` (`retirement.ts:78`), the decline branch becomes an advisory `declining` state.
  - Age alone forces retirement, at `forcedAge` 38.
  - `honoursRollover` (`honours/week.ts:98`), the hub's Next season control (`CareerHub.tsx:287`), `applyHonoursAction` and the `next-season` worker job all read one `retirementDecision(world)` function. That fixes the bypass.
  - The hub shows advice when the player is declining, with the retire and farewell options. Nothing is forced until the age limit.
- **Faster late regression.** From a late-career start age (default 33), the career player's decline speeds up each season. This applies to `declinePerSeason` (`training.ts:352`) and to how quickly the caps from `careerCap` fall.
  - For example: ×1.5 at the start age, ×2.25 two seasons later, ×3 after that.
  - Pace and physical attributes decline first. Mental attributes decline least, in line with AGENTS.md §6.
  - The aim is that a typical player is clearly below their best by 35–36, so continuing is a real trade-off.
- **A longevity score from 0 to 1** that moves the start age later (up to about +3 seasons) and softens the speed-up. It combines:
  - physical and conditioning skills already in the tree: `engine`, `iron-man`, `second-wind`, `powerhouse`, `professional`;
  - a career-long record of physical and recovery training sessions, stored as `career.conditioning`;
  - the stamina and strength actually built;
  - hidden professionalism and injury proneness.
- **A new skill.** Add a capstone, for example `evergreen`, to the physical branch. It adds a large amount of longevity but gives no immediate match bonus, so choosing it is a trade-off.
- **Shown on the Profile.** A "Longevity" panel shows the expected age at which decline speeds up and what feeds it. It explains this in the same way the game explains key-moment choices.
- **Rollout.** Adopt this through the same `developmentVersion: 3` season-start switch as 1.5.
  - Existing saves start the conditioning record from the current training plan, not from history that doesn't exist.
  - AI ageing curves don't change.
  - All constants go in `config.ts` and `BALANCING.md`.

**Acceptance:**

- The review's probe (age 33, high peak) continues to age 34, with no bypass.
- A player who trained for fitness keeps clearly more ability at ages 34–36 than an otherwise identical player who didn't.
- Retirement at age 38 still applies.
- The career profile reports the spread of voluntary retirement ages across the policies in 2.4.

### 1.5 Playing-time growth counts old appearances forever (R2) — M

- **Record availability.** Add `career.availability`, a bounded list of the career club's recent fixtures. Each entry is `{season, week, fixtureId, status: 'played' | 'benched' | 'injured' | 'unregistered' | 'suspended', minutes}`, keeping about the last 16.
  - Played fixtures are recorded in `career/matches.ts:272`.
  - Benched fixtures are recorded where `benchedCareerFixtures` (`market/week.ts:46`) already finds them.
  - Injured and unregistered fixtures are recorded during the weekly step.
- **New share calculation.** In `developCareer` (`training.ts:205`), the playing-time share becomes total minutes divided by 90 times the number of _available_ opportunities, over the last 8 opportunities from the last 12 months.
  - Injured, unregistered and suspended fixtures are left out. They do not count against the player.
  - Weeks with no fixture (winter break, off-season) add nothing, so normal breaks have no effect.
  - The existing 0.5 floor stays as the minimum growth rate.
- **Rollout.** Adopt this through `developmentVersion: 3` at the next season start. Existing saves begin with an availability list built from this season's `career.matches`.
- **Test.** Use a real benched state: a career at a club where selection actually leaves the player out, run through the weekly pipeline. Do not use synthetic zero-minute records.

**Acceptance:**

- Eight benched fixtures bring the bonus down to the floor.
- An off-season or an injury spell leaves it unchanged.
- Eight played fixtures afterwards restore it.
- The review's three-seasons-old probe now develops more slowly than the recent-appearances probe.

### 1.6 Contract expiry chooses the next club (R3) — M/L

- Remove the automatic acceptance in `freeTransfer` (`offers.ts:480`). An unsigned offer or a scouting interest must never execute a transfer.
- **A contract decision at season end.** When the season reaches `complete` and the contract expires, the season-complete hub shows a required contract decision. Next season is disabled until it is made. The options are:
  - pre-contract offers from scouting interest at any stage beyond watching, using the normal negotiation flow;
  - the current club's renewal;
  - a **one-season bridge deal** that is always available as the safety option, including for older players. If the current club does not want the player, it comes from a suitable club lower down.
- The decision has a deadline. If time runs out, the stated default applies: the bridge deal, which is never a permanent move. That default is shown up front, so the game never picks a destination without telling the player.
- This avoids adding a "no club" state for the career player, which would affect every system that assumes the player has a `clubId`.
- When signing any contract, show the club option (one extra season) in the terms.
- `extendContract` (`moves.ts:313`) is then used only when the player explicitly accepts the renewal or the bridge deal.

**Acceptance:**

- Scouting interest plus no player command leads to no transfer.
- A 35-year-old with no offers can still continue, through the bridge deal.
- An agreed pre-contract still executes at rollover.
- The deadline stops Continue (see 5.1).

### 1.7 One achievement record for the Hall of Fame (R1) — L

Scope confirmed: the full record option.

- **The record.** Add an achievement record kept for every player and preserved when players are archived: weighted appearances, goals, assists, clean sheets, trophies, awards counted in honour points, Golden Balls and caps. Add it to `Player` and to `ArchivedPlayer` (`domain.ts:357`). `archiveAndPrune` (`lifecycle.ts:392`) copies it rather than dropping it.
- **AI trophies.** When a competition finishes, credit squad members who passed a minimum number of appearances. This fills the unused `PlayerStats.trophies` field.
- **AI caps.** International windows and tournaments add caps to the selected national squads.
- **Awards.** Golden boot, MVP and team of the season are generated for every tier-1 and tier-2 league, not just the career's league (`awards.ts:110`). Young player of the year is generated for every country. Monthly awards stay limited to the career's league for performance, so they are displayed but **left out** of the Hall of Fame score.
- **One scoring function** for active, archived and legacy players:
  - appearances are weighted by the tier they were played in;
  - clean-sheet credit depends on position (goalkeeper full, defender partial);
  - the existing trophy, award and cap weights stay.
  - Legacies keep their full record and are scored with the same function.
- **Older saves.** Adopt this through `achievementVersion: 1` at season start. Records start from existing stats. A note on the Hall of Fame screen says that trophies and caps for other players are counted from season N onward.
- **Calibration.** Add fixture tests: strong goalkeeper, centre-back and striker careers of equal stature should land within an agreed band. The review's centre-back career is a good reference case. Do not add position bonuses that only exist to force the result.

**Acceptance:** identical achievements produce identical scores for career, AI and archived players. Archiving a player does not change their rank. The positional band test passes.

---

## Phase 2 — Make every system describe the same footballer

Covers R6, R5, R7 and the measurement half of R9.

### 2.1 Effective match role (R6) — M/L

- Add `EffectiveRole {position, line, slot, familiarity}`, worked out once per fixture from the real formation through `selectLineup` and `slotFit`, and stored on `MatchSetup`.
- Use it everywhere the engine currently uses the primary position:
  - `matchObjectives` and the initial `shares` (`match/index.ts:301`, `:507`);
  - the half-time role change (`:1462`);
  - `playedSlot` (`:259`), with `learnSlot` (`career/matches.ts:319`) reusing that function instead of repeating it;
  - `deservedRole` and `lineRank` in `market/rules.ts:162–185`. Their fixed 4-3-3 model is kept only as the fallback for saves without formations.
- The primary position stays as the player's identity: profile, rival pairing, awards category.
- Add a flag that `engineFor` includes, so old sessions are not replayed under the new rules.
- **Before a transfer**, the offer detail shows the likely slot, fit, closest competitor and expected share of minutes under the buying club's formation (using `slotCompetition`).

**Acceptance:** in a formation mismatch scenario (a winger fielded as a central midfielder), objectives, involvement shares, rating and familiarity all follow the central midfield role. Promises and selection agree on what the player's job is.

### 2.2 Extra skills stop helping some actions (R5) — M

- Make the impact path stack within limits, the same way the odds path does: `min(traitImpactMax, traitImpact × traitStack^(n−1))`. This replaces the flat value at `decisions.ts:227`.
- Check the threshold against the clamped `reference` value rather than `t.base`, and add a test that pins this behaviour.
- Add a match flag so old sessions are not replayed under the new rules.
- **Skill preview.** The skill sheet shows "what this adds to your build": the change in odds or impact for each affected choice, given the skills already owned.
- **Capstones.** Give 2–3 overlapping capstones a new decision option instead of another multiplier. Candidates:
  - Maestro: a first-time through ball;
  - a goalkeeper distribution capstone: a quick throw that starts a counter;
  - Ball Winner: a press-and-carry.

**Acceptance:** at a reference short pass, Playmaker + Maestro + Tempo Setter gives a higher goal chance than Playmaker alone, within the cap. The odds-calibration gates still pass.

### 2.3 Coaching advice mistakes bad luck for weakness (R7) — M

- Extend `DecisionSample` (`domain.ts:566`) as version 2. Add the situation id, chosen choice id, the chosen choice's expected value, and the best available expected value.
- `coachAdvice` (`coaching.ts:113`) sorts results into three groups:
  - **Variance:** the shortfall is within a binomial confidence bound. The advice says "unlucky", with no training recommendation.
  - **Decision quality:** the player repeatedly picked choices well below the best available. The advice is about choosing differently, not training.
  - **Execution:** the action was the right one but its odds are low because of a specific attribute. Training is recommended.
- Older samples (version 1) are used only for the variance test.

**Acceptance:** the review's probe (8 expected, 5 actual, with correct choices) gives no training recommendation. A player who keeps choosing poorly gets decision advice. A player who is weak on an attribute gets that attribute recommended.

### 2.4 Measure where growth comes from (R9, measurement first) — M

- Record attribute growth by source: passive growth, training, level points and skills. Store it in the development result, and as a breakdown per season in the career profile output.
- Extend `scripts/career-profile.ts` with these policies: default, focused development, recovery-heavy, no point spending, one-club loyalty, aggressive moving, and minutes-first loans. Run all positions over several seeds.
- Record the intended climb and prime-years ranges in `BALANCING.md` as hypotheses.
- Only after that, tune training so the chosen focus visibly shapes the build, for example by passive growth favouring focus attributes. Keep the growth floor.

**Acceptance:** the share of growth from each source is reported. A tuning decision is written down, backed by measurements across policies rather than one seed.

---

## Phase 3 — Complete the big occasions and reward careers that don't score

Covers R4, R8 and proposed addition 1.

### 3.1 Playable extra time and shootouts — M/L

- First, fix the order. Today the player's shootout kick is decided before `finalizeFixture` simulates extra time (`world/finalize.ts:229`), so extra time can make the choice pointless.
- Extend the interactive session:
  - if a knockout is level after 90 minutes, play **extra time** with 1–3 key moments;
  - then play a short **shootout**: the player's own kick, or their saves as a goalkeeper, plus a compact five-round display.
- `finalizeFixture` uses the session's extra-time and shootout results whenever they exist, and keeps the Poisson simulation for AI matches.
- Add a match flag so old sessions are not replayed under the new rules.

### 3.2 Playable major internationals — L

- Generalise `createMatchSetup` (`match/index.ts:195`) to take a `MatchSide` (name, colours, badge, players, formation, strength) built from either a `Club` or a national team. It currently requires `world.clubs`.
- Turn `playTournament` (`international.ts:406`) into a tournament that progresses step by step and is stored in the world. The career player's tournament matches create `pendingFixtureId`-style stops. Each stop offers **Play** or **Simulate**.
- Add `commitInternationalMatch`, which credits caps, goals, rewards and trophies through `credit`. It refuses a fixture that has already been credited, so nothing is counted twice.
- Window friendlies and qualifiers stay simulated by default, with an optional "play important internationals" setting.

**Acceptance:** play a national knockout match and the final with key decisions. Save midway, reload and resume, and check every cap, goal, reward and trophy is credited exactly once. Test all three engines.

### 3.3 Lightweight qualification — M

- Add qualifying groups in the windows before each tournament, for the six world nations plus guest nations. The table decides entry.
- Show the qualifying table on the National screen. Call-ups and qualifier results become part of the story.

### 3.4 Moments, rival and Chronicle for every position (R8) — M

- Extend `captureMoments` (`moments.ts:62`) beyond goals:
  - assists, using `assistId`;
  - penalty saves, in a match or a shootout;
  - late decisive saves with low odds;
  - last-ditch tackles and interceptions when the opponent had a big chance;
  - the shootout-winning kick.

  Add the matching `Moment.kind` values and clip cutting.

- Compare rivals by role (`rival.ts:116`, `:246`, and the `rival-war` storylet at `storylets.ts:243`):
  - goalkeepers: clean sheets, save percentage, rating;
  - defenders: clean sheets, defensive actions, rating;
  - midfielders: goal involvement and passing;
  - forwards: goals and assists.

  Normalise per 90 minutes and weight by tier.

- Add Chronicle milestones: first clean sheet, first penalty saved, clean-sheet and assist milestones, and stories about defensive performances in big matches.

**Acceptance:** a goalkeeper and a centre-back career both collect several Moments in a profile season. `rival-war` resolves sensibly for both. The Moments screen has material for every position.

---

## Phase 4 — Repeated decisions that cost something

Covers R11, R16 and proposed additions 2–4.

### 4.1 Opponent and manager tactical identity — M

- Map `club.playingStyle` to changes in situation weights: pressing sides produce more receiving-under-pressure moments, deep blocks more crossing and long-shot moments. Also map it to manager role requests. Today it is used only for culture fit.
- The pre-match preview explains the matchup.
- Add an optional "prepare for opponent" training focus.
- Add a match flag so old sessions are not replayed under the new rules.

### 4.2 Preferred foot and ambition (R16) — S/M

- **Foot.** Tag choices with the foot used (near or far post, cut inside versus stay wide). Weak-foot options get a penalty that is explained in the choice hint. Add a trainable "Two-footed" skill. Cutting inside on the opposite flank gets a matching bonus.
- **Ambition.** Hidden ambition becomes a stated career preference once revealed, for example "wants a top-tier club by 24". Morale reacts when it is met or ignored. The player always makes the final decision.

### 4.3 Lightweight discipline — M

- Add booking risk to tackle-type choices, shown in the choice hint and scaled by aggression and tackling.
- Add a background card model for AI matches at modest, realistic rates. The `card` event kind already exists in `MatchEvent`.
- Bans build up per competition. Selection respects them, and the availability list records `suspended` (this connects to 1.5).
- Extend the 10,000-match test with card and red-card rate bands.
- Adopt through `disciplineVersion` at season start.

### 4.4 Weekly commitments and club finances (R11) — M/L

- Give each week a small number of optional commitment slots (around three). They cover extra training, mentoring, sponsor appearances, social events, recovery and family time.
- Core training is protected. Repeat plans and delegation keep routine weeks to a single click.
- Sponsor deals gain appearance commitments alongside their performance targets.
- Staff get alternative specialities to choose between, and the benefit of support already bought is shown clearly.
- **Club finances** (`updateFinances`, `simulate.ts:118`):
  - stop the wage budget from only ever rising;
  - let a club's balance go negative;
  - clubs short of money become less certain to renew, recruit less and offer weaker support, in predictable ways.
  - Adopt through `economyVersion` at season start.

**Acceptance:** compare scheduling and spending policies across seeds. They lead to different outcomes, a typical week still takes one click, and nothing involves real-time waiting.

---

## Phase 5 — Story memory and the shape of a career

Covers R10 and proposed additions 6–8.

### 5.1 Continue stops for every important decision — S/M

- Replace `decisionDue = offerDeadlineThisWeek` (`world.worker.ts:59`) with an interruption policy. Continue stops when any consequential decision is due this week, or when one was **created** this week: stories, the promise, sponsor offers, unanswered press, transfer offers and the contract decision from 1.6.
- Add a setting to auto-answer routine press with a chosen tone.
- `advancePreview` (`agenda.ts:228`) uses the same policy.

**Acceptance:** a six-week injury break with a story, a press question and a sponsor offer stops at each one before it can expire.

### 5.2 Lasting story facts — M/L

- Add `career.facts`, a bounded list of entries with kind, subject, season and weight. Kinds include promise kept or broken, public criticism, declared loyalty, mentored player, difficult return, transfer request and captaincy.
- Storylets check these facts in their conditions and change real opportunities, not just wording: limits on manager trust, willingness to renew, captaincy chances, and a former mentee who becomes a manager later in the persistent world.
- Add a cooldown across seasons for each story kind.

### 5.3 Preseason and late-career transitions — M

- Add a preseason screen with the manager's expectations, competition for places (from 2.1), a development target and the player's chosen ambition for the season.
- Late-career options: accept a smaller role, change position, mentor, or move closer to home.

### 5.4 Session goals next to calendar challenges — S

- Label which challenges need match minutes.
- Offer an achievable alternative goal while the player is injured or benched.
- Rewards stay cosmetic only.

---

## Phase 6 — Honest quality gates, current docs, device acceptance

Covers R15 and R17. Work on the gates can start earlier, alongside Phase 2.

1. **Performance checks** (`e2e/performance.spec.ts:25`). Split them into two groups:
   - the product targets, reported: 100 ms per action, 3 s to interactive, 60 fps;
   - the machine-specific regression tolerances, asserted.

   Name both clearly, and never present the tolerances as proof of the targets.

2. **Career profile gates.** The gate named "top tier by 27" currently accepts `tier <= 2`. Make it check `tier === 1`, and add a separately named gate for reaching tier 2. Add confidence intervals and raw distributions.
3. **Match profile gates.**
   - Add specialised goalkeeper builds (`specialise()` currently leaves keepers unchanged, at line 79).
   - Add defensive policy gates based on goals prevented.
   - Add score-aware objectives (behind, level or ahead late in the match).
   - Add formation mismatch, benching and injury scenarios.
   - Check across several seeds.
4. **Docs.**
   - Add a current-state summary at the top of `ARCHITECTURE.md`, `REALISM.md` and `HANDOFF.md`.
   - Mark the milestone notes as history.
   - Mark which review findings are resolved, with links to the evidence.
5. **Device acceptance.** Run `DEVICE-ACCEPTANCE.md` on real Safari for macOS and iOS and on Android Chrome, using populated late-career saves. Cover offline use, updates, storage, audio, frame timing and interaction latency. This needs you or a tester with the devices.
6. **Human playtests.** Run the review's recall protocol after Phases 3 and 5.

---

## Findings to work map

| Finding                           | Priority | Plan step     |
| --------------------------------- | -------- | ------------- |
| R1 Hall of Fame fairness          | P1       | 1.7           |
| R2 Stale playing-time growth      | P1       | 1.5           |
| R3 Expiry chooses the club        | P1       | 1.6           |
| R4 International and extra time   | P1       | 3.1–3.3       |
| R5 Skill impact stacking          | P2       | 2.2           |
| R6 Effective role                 | P2       | 2.1           |
| R7 Coaching variance              | P2       | 2.3           |
| R8 Non-scoring visibility         | P2       | 3.4           |
| R9 Training audit and late career | P2       | 2.4, 1.4      |
| R10 Story memory and Continue     | P2       | 5.1, 5.2      |
| R11 Economy and finances          | P2       | 4.4           |
| R12 Phone transfer talks          | P2       | 1.3           |
| R13 Experience mutation           | P2       | 1.1           |
| R14 Poster caps                   | P2       | 1.2           |
| R15 Quality gates                 | P2       | 6.1–6.3       |
| R16 Foot, ambition, style         | P3       | 4.1, 4.2      |
| R17 Docs entry point              | P3       | 6.4           |
| Additions 1–8                     | —        | 3.x, 4.x, 5.x |

## Decisions (confirmed 20 October 2026)

1. **Late career (1.4):** remove forced retirement based on decline. Discourage playing on through fast regression after a late-career age, which fitness-focused development pushes back. The age limit stays.
2. **Contract expiry (1.6):** a required decision at season end, with a one-season bridge deal as the stated default.
3. **Hall of Fame scope (1.7):** the full achievement record, with AI trophies, AI caps and awards for every top-two-tier league.
4. **Internationals (3.2):** tournament matches playable by default; qualifiers and friendlies simulated unless the player opts in.
5. **Discipline (4.3):** included in this cycle.
