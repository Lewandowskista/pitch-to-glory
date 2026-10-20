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
