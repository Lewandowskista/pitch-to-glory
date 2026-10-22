# Review implementation progress — 20 October 2026

Tracks the [implementation plan](REVIEW-PLAN-2026-10-20.md) for the [October 20 review](APP-REVIEW-2026-10-20.md). Each phase records what changed, how it was verified, and what remains open.

## Phase 1 — Make outcomes trustworthy and keep the player in control

Status: implemented. Save schema 21 (one migration covers every Phase 1 field).

| Step | Finding      | Outcome                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ---- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.1  | R13          | Experience purchases copy the career player before changing morale or fatigue. A frozen-input test covers every action family (lifestyle, market, social, honours) and also found and fixed a second leak: retirement reset clique lists on dressing rooms it had not copied.                                                                                                                                                                                                       |
| 1.2  | R14          | One selector, `careerTotals`, gives appearances, goals and caps (all national levels) from the career's honours or the retired legacy. The poster and the screen read it. Tested with 104 caps, a retired parent and a child career.                                                                                                                                                                                                                                                |
| 1.3  | R12          | Transfer talks give Back its own row on narrow panels. The crest sits beside the status label and the club's name spans the full width. Term tiles drop to one column instead of splitting words. A browser test at 360 and 390 px, 100% and 130% text, in all three engines, checks heading width, line count, unbroken words, Back placement and the first term's position.                                                                                                       |
| 1.4  | R9 lifecycle | Decline no longer forces retirement; only age 38 does, through one `retirementState` read by rollover and the hub. From an onset age (33, plus up to 3 for longevity, plus 2 for keepers), soft caps fall and decline speeds up each season. Longevity comes from conditioning skills (including the new Evergreen capstone), a running share of physical training, stamina and strength, and character. It is shown on the Profile, and the hub says when decline is accelerating. |
| 1.5  | R2           | Development rules 2 record the club's fixtures from the player's side (played, benched, injured, unregistered). Playing time is minutes over the last 8 available fixtures within a season's length of weeks. Benching lowers it; injuries, registration and breaks do not count; playing restores it. Tested through the real weekly pipeline.                                                                                                                                     |
| 1.6  | R3           | Contract expiry never moves the player without acceptance. Once the club's option is used, scouting clubs open ordinary pre-contract talks at season end. The hub lists the decision, the contract card shows offers and the default, and Next season confirms the one-season bridge deal. Every contract now shows its club option.                                                                                                                                                |
| 1.7  | R1           | One Hall of Fame record for every player: club contributions weighted by level and line, trophies to everyone in the winning campaign, awards (now in every top-two-tier league and country), and caps for every home nation's starters. The record survives archiving and becomes the legacy's score. Older worlds adopt it at a season start and say from when it is complete.                                                                                                    |

**Rule adoption.** New careers and worlds start with development rules 2 and the achievement record. Saved careers and worlds adopt both when their next season starts, so no season changes rules part-way. Constants and formulas are in `BALANCING.md` (sections "Late career", "Contract expiry", "Hall of Fame: one record").

**Deviation from the plan.** The plan named `developmentVersion: 3` for 1.4 and 1.5. `world.developmentVersion` already means AI potential recalibration, so the career uses its own `career.developmentRules: 2` instead.

### Verification

| Check                                                 | Result                                                                                                                                                                            |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`, `npm run lint`                   | Pass                                                                                                                                                                              |
| `npm test`                                            | 473 passed across 58 files, including the 10,000-match test                                                                                                                       |
| `npm run build`                                       | Pass, every route within its 300 KB gzip budget (entry 283 KB)                                                                                                                    |
| Full Playwright suite                                 | All pass in Chromium, Firefox and WebKit. The first run failed 6 tests; all were two specs that hard-coded save schema 20, now 21. Both were rerun and pass in all three engines. |
| `npm run profile -- --check`                          | All gates pass                                                                                                                                                                    |
| Performance spot check (21,099-player national world) | An international window takes about 65 ms longer with the caps credit; the weekly title check is under 1 ms.                                                                      |

New tests: `action-immutability`, `longevity`, `playing-time`, `contract-expiry` and `achievements`, plus additions to `honours`, `market.spec` (phone talks at 360/390 px and 100/130% text; the expiry decision) and updates to tests that asserted the replaced rules.

### Fresh career profile

Seed `review-2026-10-20`, specialised centre-back, the review's harness and policies, retiring voluntarily at 34. The new rules change growth and moves, so the career took a different path from the review's run; the comparison is illustrative.

|                             | Review run (old rules) |                  This run |
| --------------------------- | ---------------------: | ------------------------: |
| Appearances, goals, assists |             573, 27, 9 |                591, 31, 7 |
| Clean sheets                |                    194 |                       185 |
| Trophies, caps              |                 4, 104 |                     3, 99 |
| Peak ability                |                   80.2 |                        81 |
| Hall of Fame                |  912th of 60,967 (527) | **107th of 60,965 (868)** |

A comparable defender's career now ranks among the top 0.2% instead of around 1.5%, as R1 intended.

**Open observation for step 2.4.** This career played for 19 clubs and loan clubs. From 32 it moved each season as a backup (Naples, Turin, Verona), where the review's run stayed at one club from 24. Whether that comes from the harness's offer policy or from the new late-career curve needs the multi-policy comparison planned in 2.4. It is not yet a confirmed defect.

### Merged with the redesign

Before pushing, `main` turned out to hold 94 commits (release 0.2.0, dated 16 October) that the reviewed checkout did not have: the full redesign, squad numbers, richer match play and discipline. Phase 1 was merged onto it:

- **Save schema.** Upstream's v21 adds squad numbers, so Phase 1's fields move to **v22**.
- **Hall of Fame.** Upstream's sorted, cached ranking table now scores everyone from the shared record. Its reference test was updated to the new rules.
- **Chronicle poster.** The poster moved to `chroniclePoster.ts` and still counted cap entries; the R14 fix was reapplied there.
- **Transfer talks.**
  - The redesigned hero already gives the club's name a full-width row on phones.
  - On phones the hero crest is now smaller.
  - The term tiles split words at 130% text. The cause was the signing-on fee tile's `col-span-2`, which added an implicit column to a one-column grid. It now spans the row with `col-span-full`, in an auto-fill grid.
  - The phone test checks the new markup. It allows a fourth title line at 130% text, and 2.25 screens to the first term on a 360 × 640 phone at 130%.
- **Profile, Skill tree, hub and honours card.** The Longevity panel, soft caps, the Evergreen detail, the bridge-deal confirmation and the decline advice were re-added on the new UI kit.
- **Release.** This is **0.3.0** (`src/i18n/patchNotes.ts`, `CHANGELOG.md`), as `docs/RELEASING.md` requires for every push to `main`.

**Verification after the merge:**

- Format, lint, typecheck and the release check pass.
- 675 unit tests pass across 77 files.
- The full Playwright suite passes in Chromium, Firefox and WebKit (271 passed, 5 skipped); its only failures were the phone talks test, since fixed. The transfer, accessibility and layout specs were rerun and pass.

**Risk.** The Match route's initial JavaScript is 299.8 KB of its 300 KB gzip budget. Upstream alone was 294.5 KB; shared engine chunks grew with Phase 1. The next change that touches the match route needs a bundle-size reduction first.

## Phase 2 — Make every system describe the same footballer

Status: implemented and released as **0.4.0**. Match engine **match-17**; save schema 22 (optional fields only); development rules 3.

| Step | Finding | Outcome                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prep | Budget  | The Match route was at 299.8 of 300 KB. The post-match report now loads lazily, fetched in the background once a match exists: 284.6 KB.                                                                                                                                                                                                                                                                                                  |
| 2.1  | R6      | One effective role: the slot the player starts in (their best fit in the manager's formation, `selectedSlotIndex`) sets role choices, objectives, involvement, shares, half-time role change, back-line rating credit and clean-sheet fame. The hub preview and the manager's plan name the same slot. Role promises come from the competition for that slot. Transfer talks show the slot, fit, who is ahead and the chance of starting. |
| 2.2  | R5      | Skills on choices likely by nature stack on what they lead to (×1.1 per skill, ×1.3 limit). The path stays tied to a choice's base odds, pinned by a test. The skill sheet shows, choice by choice, what a skill adds to the current build. Capstones that unlock new choices are deferred to a content pass: some skills (Maestro) already unlock one, and new choices need animation and commentary.                                    |
| 2.3  | R7      | Advice no longer reads luck. Decisions record what the attributes did to the odds and the expected value given up against the best option. Training is recommended only where attributes cost clear odds; poor choices and bad luck are noted separately.                                                                                                                                                                                 |
| 2.4  | R9      | Growth is recorded by source per season and shown on the profile. The career profile takes seven policies; a 14-career study is below.                                                                                                                                                                                                                                                                                                    |
| Fix  | —       | A match crashed when a first-minute shot was drawn before the pending kickoff (also on match-16). The usual taker now kicks off. Found by the policy study.                                                                                                                                                                                                                                                                               |

### Policy study (seed `policy-a`, centre-back and striker)

Whole attribute points over a career, by source:

| Policy                                | CB playing | CB training | CB points | CB peak | ST playing | ST training | ST points | ST peak |
| ------------------------------------- | ---------: | ----------: | --------: | ------: | ---------: | ----------: | --------: | ------: |
| default                               |        632 |         278 |       345 |    81.5 |        599 |         285 |       375 |    81.1 |
| focused (high intensity)              |        747 |         141 |       308 |    80.8 |        724 |         122 |       356 |    80.4 |
| recovery-heavy                        |        776 |          50 |       335 |    79.2 |        704 |          38 |       432 |    79.2 |
| no points                             |        856 |         356 |         0 |    78.2 |        878 |         350 |         0 |    78.2 |
| loyal (one club)                      |        596 |         265 |       386 |    81.3 |        576 |         258 |       411 |    81.5 |
| minutes-first loans                   |        629 |         282 |       340 |    81.7 |        611 |         269 |       378 |    81.4 |
| mover (any move, asks to leave at 20) |        632 |         278 |       345 |    81.5 |        587 |         288 |       384 |    81.0 |

**Findings.**

- Passive growth from playing supplies about half of all gains, training about a fifth, spent points about a quarter and skills about 5%.
- Training barely changes the destination. Almost no training (the recovery-heavy policy) costs about 2 peak points. A narrow high-intensity focus delivers _fewer_ trained points than the balanced default: focus attributes reach their caps, and passive growth fills the rest.
- Points matter more: never spending them costs about 3 peak points.
- Moving more changes little: the default player already takes every move to a better club, so the centre-back's mover career is identical, and the striker's has 8 clubs instead of 6 with the same development.
- The loyal centre-back never left tiers 4–6 and ranks 911th in the Hall of Fame, against 34th for the default career. Level weighting works as intended.
- Strikers rank 1st or 2nd under most policies, on about 0.6 goals a game and 20+ awards. A centre-back with a comparable career ranks in the top 0.1%.

**Tuning applied (development rules 3, confirmed 21 October).** Passive growth now favours the attributes the training plan focuses on: twice the rate of the rest (`focusRatio`). The weights are normalised over the attributes still below their cap, so the total is unchanged and nothing is wasted once a focused attribute reaches its cap.

- A balanced plan covering all three groups changes nothing, so default careers develop exactly as before.
- Careers adopt rules 3 at their next season start.
- A first version normalised over every attribute. Focused careers then lost growth once their focus attributes hit their caps (centre-back peak 80.2). It was fixed before release.

Peak ability after the retune (seed A, before → after; seed B, after only):

| Career            | Seed A      | Seed B |
| ----------------- | ----------- | -----: |
| CB default        | 81.5 → 81.5 |   84.2 |
| CB focused        | 80.8 → 80.3 |   83.4 |
| CB recovery-heavy | 79.2 → 80.0 |   83.8 |
| ST default        | 81.1 → 81.1 |   85.8 |
| ST focused        | 80.4 → 80.3 |   84.2 |
| ST recovery-heavy | 79.2 → 79.8 |   84.2 |

The climb's pace is preserved within about a point, which is normal career-to-career variation. All career-profile gates pass. `tests/growth.test.ts` shows the focus attributes growing faster than under rules 2. The profile does not yet record attribute shape (focused against unfocused attributes at 25); adding that is the next measurement for step 2.4.

## Phase 3 — Complete the big occasions and reward careers that don't score

**3.1 Playable extra time and shootouts (match-18).** A level knockout plays extra time in the session (1–2 key moments) and settles the shootout there; the world uses the session's result. Sessions from earlier engines replay unchanged.

**3.4 Every position.** Assists, great saves, penalty saves, goal-line clearances and shootout winners become Moments. The rival is judged by clean sheets for keepers and defenders. The Chronicle marks first clean sheets and assists and their milestones.

**3.2 Playable major internationals.**

- The tournament before an even season opens when the season ends and is stored in the world (`international.live`). It plays one round at a time; the career player's nation's match waits for them when they are in the squad and fit.
- The hub shows the match with **Play the match** and **Simulate this match**, the round, and the group table. After the match, **Continue the tournament** plays the rest of the round and brings the next match or the end. The next season can start once the player's part is over; starting it plays out whatever remains.
- A played match uses the full match engine on neutral ground. The nations are built as sides from their colours and squads; guest nations get generated squads at their rating, the same for the whole tournament (`nationalMatch.ts`).
- `commitTournamentMatch` records the result once: a second commit throws, and the report's outcome is kept in the international record, not the club match list. XP follows the club formula (performance and decisions, opposition and occasion); caps, goals and fame count as for a simulated match.
- Every fixture has its own seed, so a tournament simulated at once and one played round by round agree on every match the player does not play.
- A match in progress survives a refresh: the save accepts a tournament session only when it matches the sides this world fields for the waiting match.
- Found during testing: a tournament finished between seasons belongs to the coming season, and the save validator rejected it. Fixed, with a unit test that fails without the fix.
- Not done: a setting to play qualifiers and friendlies in the match engine (they stay simulated).

**3.3 Lightweight qualification.**

- The season before a tournament carries a qualifying campaign: 24 nations in six groups of four, home and away, two matchdays per window. Winners, runners-up and the four best thirds (16) go to the tournament, so a world nation can miss it.
- A senior international's window matches are their nation's qualifiers. Scores come from ratings and a per-fixture seed, so they are the same with or without the call-up.
- The National screen shows the group table (qualifying places marked), the rule and the six matches. Qualifying or missing out goes into the Chronicle and the inbox.
- Sixteen guest nations were added for the pools (real names in real-name worlds, fictional otherwise). Old saves gain them when their first campaign opens at a season start.
- Tests: `tests/qualifying.test.ts` plays a full campaign through the season simulation (groups, fixtures, the table, the tournament field, a called-up player's qualifiers matching the fixtures, the story, save validity). `e2e/tournament.spec.ts` checks the National screen part-way through.

**Verification.** `tests/honours.test.ts` (round-by-round play, determinism, single credit, season-end opening and closing, save validity), `tests/tournament-match.test.ts` (sides, guest squads at rating, commit once), `tests/worker.test.ts` (the tournament job) and `e2e/tournament.spec.ts` (hub → play → refresh → report → continue → simulate the rest → next season) pass in Chromium, Firefox and WebKit, with the match, career and honours flows. Match route 290.7 KB gzip (budget 300 KB): the nations' squad builder loads only when a tournament match is prepared.

## Phase 4 — Repeated decisions that cost something

- **4.1 The opposition's style** (engine match-19): it tilts the situations that reach the player and the odds of the choices it bears on, as a named factor; the briefing explains the matchup; studying the opponent in training (or a scouting analyst) halves its penalties.
- **4.2 Foot and ambition:** shots, crosses and carries use a foot from the flank of the player's post; the weaker one costs odds unless two-footed (a new Two-Footed skill). A revealed ambition is a stated preference with its own morale part.
- **4.3 Discipline link:** a match missed through a ban is recorded as suspended and never lowers playing time.
- **4.4 Commitments, staff and finances:** up to three weekly commitments kept with the training plan (with a suggestion), sponsor appearance obligations, two specialities per member of staff, and a club economy where wages are budgeted from earnings, balances can go into debt and clubs under strain sign, renew, pay and support less.
- Found during testing: in the pitch animation, a keeper could carry the ball upfield when the teammates a move starts with had been sent off (fixed on match-19), and a coaching value stored as −0 changed in a save round trip (fixed).
- Measured: match-19 moves goals by at most two and moments by at most three per position in the outcome snapshot (25 matches each); the 10,000-match distribution holds. The economy's strain rates are in BALANCING.md.
