# UI redesign: what needs code beyond a reskin

The approved redesign lives on the Claude Design canvas
(https://claude.ai/artifact/SZz5umNafxPhBFebzEjpgS, 69 artboards on 12 pages). The design language
is unchanged (green and gold, Bebas Neue over Inter, 20px cards). This document lists every part
of the design that needs engine, data, persistence or asset-generator work. Anything not listed
here is presentation work in `src/screens`, `src/ui` and `src/styles`. The findings come from a
read-only audit of the code on branch `ux/phase-1` (match engine `match-11`); `main` has since moved to save schema v20, so the art phase bumps it to v21.

## Summary

| Area                                                              | Verdict                                                 | Save impact                                                 | Seed / determinism impact                                                                          |
| ----------------------------------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Match engine (live play, key-moment camera, logical plays, stats) | Biggest piece of work, mostly in the choreography layer | Engine version bump (in-progress matches discarded cleanly) | Outcome streams untouched, except steps M4, M5, M7 and M8, which need the 10,000-match gate re-run |
| Career and world data                                             | About 10 additions, all pure helpers or optional fields | None, or optional fields only                               | One option (objectives on their own stream) changes match seeds                                    |
| Procedural art (avatar, crest, kit, illustrations)                | New renderers plus 3 new avatar parts                   | Schema 20 → 21 (no-op migration, wider validation)          | Must not add draws to the seeded generators                                                        |
| Everything else                                                   | Presentation only                                       | None                                                        | None                                                                                               |

## 1. Match engine

### What already works

The engine has two layers. The **outcome layer** (`src/engine/match/index.ts`, `situations.ts`,
`decisions.ts`) decides goals, decisions, stats and ratings and is calibrated by the 10,000-match
tests. The **choreography layer** (`src/engine/match/motion.ts`) turns those outcomes into
keyframes for all 22 players and the ball on its own RNG streams (`${seed}:motion:…`), so it never
changes a result.

Already in place:

- **22 players in real formations.** There are four shapes (4-3-3, 4-4-2, 4-2-3-1 and 3-5-2) with
  in- and out-of-possession positions (`formations.ts`), chosen from the manager's
  `preferredFormation`.
- **Shape follows the phase of play.** Teams slide with the ball, compress out of possession, two
  players press the carrier, attackers hold the offside line, and runs are speed-capped
  (`motion.ts:238-416`).
- **Passes between real teammates.** Relay passes go to a target (`bringBall`); crosses come from
  wide in the final third; counters use a single pass.
- **An animated outcome after each choice** (`outcomePassage`), with signed factors that add up to
  the success chance.
- **Post-match maps from real simulated data:** heatmap, pass map and shot map (`Maps.tsx`).
- **Line-ups:** each XI with formation, slot and fit notes, plus the bench, in `Preview.tsx`.
- **Contextual key-moment choices by role:** near post, far post, square, take on, lay off, carry,
  through ball, tackle, jockey, intercept, plus the keeper choices.

### What is missing for the design

The design asks for plays that read as football, such as the winger crossing to the striker. That
needs **structured metadata** in the choreography layer, not a new outcome model.

- **No pattern library.** A full-back → winger → cross → striker move happens only by chance through
  relay scoring.
- **Events carry no receiver, action type, flank, zone or xG.** Filler build-up is never logged, so
  commentary cannot narrate it.
- **The key-moment cast is thrown away.** The keeper, presser and runner drawn for the odds
  (`contextFor`, `index.ts:882-928`) are discarded. The teammate for a square pass or lay-off is
  only picked at resolution (`index.ts:1048`). The camera therefore cannot label players, and an
  arrow drawn before the choice could point at the wrong teammate.
- **Choices have no targets** (near/far post point, teammate, carry lane), and nothing marks which
  outcome frames belong to the chosen action.
- **"Track the runner" does not exist**, and "switch" is merged into `cross-switch`.
- **Stats.** xG on screen is a pro-rated pre-match expectation (`Match.tsx:769`). Key passes,
  distance run and the per-minute rating history are not tracked.
- **No cards or fouls.** `'card'` is in the event type but never emitted.
- **No AI substitutions.** The bench is the whole remaining squad, not 7.
- **Weather and pitch** are one combined factor with no intensity ("light rain") and no pitch state
  ("heavy pitch").
- **Moments clips** have no ball height, carrier or action annotations. They keep at most 12 frames,
  so a long build-up can be cut.
- **No squad numbers.** Tokens show the formation slot index.

### Upgrade plan

**Rule:** steps marked _narrative only_ must leave outcomes byte-identical per seed. Steps marked
_re-gate_ change outcomes and need the 10,000-match test, `npm run profile:match` and the fairness
tests re-run. Each step bumps `MATCH_ENGINE_VERSION` (`types.ts:15`). Saved in-progress matches then
fail validation cleanly and are discarded with the world kept, and the fixture replays from its
seed.

| Step | Change                                                                                                                                                                                                                                                                                                                                                                                                                    | Type           | Enables in the design                                                        |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ---------------------------------------------------------------------------- |
| M0   | Outcome-hash test over ~200 seeds × 8 positions (score, events, probabilities, stats, rating; excluding points and frames); motion cost probe in `scripts/match-profile.ts` (budget ≤ 10 ms per match)                                                                                                                                                                                                                    | Harness        | Safety net for every later step                                              |
| M1   | Annotate keyframes and events with a `Beat` (`kind`: pass, cross, switch, through ball, cutback, carry, dribble, shot, header, tackle, intercept, save…; `actorId`, `receiverId`, `zone`, `flank`, `pattern`). Add `receiverId`, `action`, `zone`, `xg` to `MatchEvent`; add `focus {start, end}` to `MatchMotion`                                                                                                        | Narrative only | Last-pass trail, labelled live play, outcome cam cutting "pass then finish"  |
| M2   | New `patterns.ts`: wing play (FB → W → cross → ST), overlap, switch, through ball, counter, cut-back, long ball, recycle. Chosen from slot roles, flank, the shooter's role, the choice and counter keys; `bringBall` and `pass()` follow pattern steps                                                                                                                                                                   | Narrative only | Logical, readable build-up on the live pitch and in clips                    |
| M3   | New `narration.ts`: commentary generated from beats with `{player, receiver, flank, zone, post}` and new key families (`cross.left`, `header.near`…); new i18n keys                                                                                                                                                                                                                                                       | Narrative only | Commentary that matches what is drawn                                        |
| M4   | Key-moment cast and targets: `KeyMoment.zone`, `KeyMoment.cast` (selected, presser, cover, keeper, free, runner, crosser), `DecisionChoice.target` (goal post / teammate / lane / runner). Keep `contextFor`'s opponents; **pre-pick the receiver** on `${seed}:receiver:${minute}`; derive the spot's width from the slot's formation post instead of a random mirror (draw it last); `scene()` places every cast member | **Re-gate**    | Tactical cam: zone framing, named involved players, arrows, near-post marker |
| M5   | New choice `track-runner` in `defend-attack` (append, never insert, so the 10k test's choice index still matches); optionally split `cross-switch`                                                                                                                                                                                                                                                                        | **Re-gate**    | Defensive camera ("Track the runner"); a separate switch                     |
| M6   | Bookkeeping stats, no random draws: per-shot `xg`, shots on target, key passes, tackles attempted, distance run (from keyframe spans), touches, `ratingByMinute`, a dt-weighted heat grid                                                                                                                                                                                                                                 | Narrative only | Live stats panel, rating sparkline with delta, richer heatmap                |
| M7   | Discipline and AI substitutions: yellow cards on `${seed}:discipline:${minute}` (cosmetic first; red cards need recalibration); AI substitutions at 60–80'; bench capped at 7; career minute accounting from substitution events (`career/matches.ts:125-136`)                                                                                                                                                            | **Re-gate**    | Timeline cards ("Carter booked"), real bench of 7                            |
| M8   | Weather intensity (drawn _after_ the existing weather pick) and a derived pitch state; split the conditions factor into weather and pitch                                                                                                                                                                                                                                                                                 | **Re-gate**    | "Light rain · Heavy pitch", "heavy pitch −5%" in the choice reasons          |
| M9   | Moments clip v2 (ball motion, carrier, beat kind, up to 24 frames, names and numbers in the link payload, still under 6,000 characters); keep decoding v1; cut highlights from the pattern's first beat; play through `playback.ts`                                                                                                                                                                                       | Narrative only | Moment replays that show the cross arcing in                                 |
| M10  | Heatmap from the heat grid; optional team pass maps from beats                                                                                                                                                                                                                                                                                                                                                            | Narrative only | Report maps                                                                  |

Type sketches for M1 and M4:

```ts
export type BeatKind =
  | 'pass'
  | 'cross'
  | 'switch'
  | 'through'
  | 'long'
  | 'cutback'
  | 'carry'
  | 'dribble'
  | 'shot'
  | 'header'
  | 'tackle'
  | 'intercept'
  | 'block'
  | 'save'
  | 'clearance'
  | 'restart'
  | 'celebration';
export interface Beat {
  kind: BeatKind;
  actorId: Id;
  receiverId?: Id;
  eventId?: Id;
  pattern?: PatternId;
  zone: 'def' | 'mid' | 'final';
  flank: 'left' | 'centre' | 'right';
}
export interface MomentCast {
  selected: Id;
  presser?: Id;
  cover: Id[];
  keeper?: Id;
  free: Id[];
  runner?: Id;
  crosser?: Id;
}
export type ChoiceTarget =
  | { kind: 'goal'; post: 'near' | 'far' | 'centre'; point: Point }
  | { kind: 'teammate'; playerId: Id; point: Point }
  | { kind: 'lane'; point: Point }
  | { kind: 'runner'; playerId: Id };
```

**Shirt numbers.** Done in phase 2: `Player.squadNumber` is real and persistent (decision 2), and
the pitch tokens, line-ups, club inspector and profile show it. The engine never reads it.

**Performance.** Match commands run on the main thread (`Match.tsx:140-187`). Replays run in workers
at every minute checkpoint, and auto-played fixtures run in the world worker. Keep motion plus
narration at ≤ 10 ms per full match with plain arithmetic. A dedicated match worker is only needed
if one command exceeds about 8 ms. The Pixi scene holds 60 fps comfortably:

- The tactical camera is a scale and translate tween on the world container.
- Name labels are rasterised once per token.
- Arrows and targets go in one `Graphics` layer.

**Tests to update or add.**

- `match-engine.test.ts`: version, i18n coverage, factor sums, fairness, the 10k gate.
- `match-motion.test.ts`: scene geometry.
- `match-persistence.test.ts`: outdated engine discarded.
- `match-accounting.test.ts`: AI substitutions and minutes.
- `match.test.ts`: heatmap source.
- New: outcome-hash invariance, chain coherence (a pass's receiver is the next carrier; crosses
  start wide; headers follow crosses), cast ids on the correct side, a teammate target equal to the
  actual receiver, clip v1/v2 round-trip, card and substitution determinism.
- Document the new engine version in `docs/MATCH-BALANCING.md`.

## 2. Career and world data

None of these needs a save migration. New stored fields are optional, and the validators ignore
unknown keys.

| #   | Design element                                                                 | Change                                                                                                                                                                                                                                                                                                                                                                                                                                   | Files                                                                     |
| --- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| C1  | Overall rating hexagon ("64") and the six-axis radar (PAC/SHO/PAS/DRI/DEF/PHY) | Pure `overallRating(player)` (rounded `playerAbility`) and `attributeSummary(player)` with an axis map in config (separate keeper axes). Use it everywhere: the club inspector today uses an unweighted mean (`ClubInspector.tsx:9-14`) that disagrees with `playerAbility`                                                                                                                                                              | `src/engine/strength.ts` or new `rating.ts`, `config.ts`                  |
| C2  | Hub hero: manager's plan and personal objectives before matchday               | Deterministic `matchPlan(world, fixture)` from the selection slot, club formation, playing style and culture, plus i18n. For objectives, either (a) `previewObjectives` that builds the session with default tactics (accurate once the fixture is pending; form can still change during the week), or (b) a dedicated objectives RNG stream (stable, but changes match seeds: update determinism and replay tests). Recommendation: (a) | `src/engine/career/brief.ts` (new), `match/index.ts:288-341` only for (b) |
| C3  | Live Hall of Fame rank ("#4 of 3,812") mid-career                              | Extract the score logic from `retireCareer` (`honours/retirement.ts:132-152`) into a helper; memoise `hallOfFameRank()`, which loops over all players                                                                                                                                                                                                                                                                                    | `honours/retirement.ts`                                                   |
| C4  | Save-slot cards with the player's portrait                                     | Add `avatar` and `birthSeason` to `WorldSummary.career` in `careerSummary`; card fallback for older slots. This is the slot index record, not the save file, so there is no schema bump                                                                                                                                                                                                                                                  | `src/persistence/localRepository.ts`                                      |
| C5  | Inbox sender and "answer by week N" (optional)                                 | Derivable today from `subjectKey` plus `actionId` (the logic exists in `agenda.ts` `deadlineItems()`). Optional `sender?` and `deadline?` fields, set in `postMessage`, keep the sender stable after a manager change                                                                                                                                                                                                                    | `market/records.ts`, `persistence/marketValidation.ts`                    |
| C6  | Rival timeline press entries                                                   | `'media'` timeline entries are typed and validated but never written; add `addTimeline` in `answerPress`                                                                                                                                                                                                                                                                                                                                 | `social/media.ts:202-217`                                                 |
| C7  | "Around the world" feed: debut, first goal, injury, rivalry                    | These kinds are typed but never emitted; add `recordEvent` calls                                                                                                                                                                                                                                                                                                                                                                         | `career/matches.ts`, `career/training.ts`                                 |
| C8  | Real dates on fixture rows                                                     | Pure `calendarDate(season, week, day)`                                                                                                                                                                                                                                                                                                                                                                                                   | `src/engine/world/calendar.ts` (new)                                      |
| C9  | Familiarity words (Natural / Accomplished / Learning)                          | Threshold constants and a helper                                                                                                                                                                                                                                                                                                                                                                                                         | `config.ts`                                                               |
| C10 | Per-celebration "big-match uses" (only if wanted)                              | Optional `CareerStyle.signatureUsesBy`; today there is one global counter                                                                                                                                                                                                                                                                                                                                                                | `domain.ts`, `lifestyle/week.ts:43`, `lifestyleValidation.ts`             |
| C11 | Backup reminders switch                                                        | `settings.backupReminder` exists and is validated; add the switch in `Settings.tsx`. It is read only by the World season-end banner today                                                                                                                                                                                                                                                                                                | `screens/Settings.tsx`                                                    |

Already supported, with no data work needed: rival comparison, hidden-attribute reveal, skill
prerequisites (per-tier cost and minimum level), morale and form history (160 weeks stored), morale
and culture-fit parts, cliques and leaders, selection reasons, the manager's challenge, all transfer
and talks fields (including the signing-on fee; patience pips are derivable), three answers per
press question, feed filters, the fame ladder, shop categories, sponsor obligation progress, the
full-body wardrobe figure, challenges, the trophy cabinet, records, the Golden Ball top 10,
continental cups, the Chronicle, national caps and tournaments, every calendar entry type, league
zones, and the club inspector.

## 3. Procedural art and data model

| #   | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Save impact                                                                                                                                             | Seed impact                                                                                                                                                                                                                                   |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | Shared art foundation: art colour constants mirroring the tokens (SVG inside `<img>` data URIs cannot read CSS variables; note the generators' gold `#f1cf58` differs from the token `#efcf63`); an **outlined-glyph text helper**, because page fonts are not available inside data-URI SVGs (sponsor names, "EST" ribbons, the armband "C"); an id-namespacing helper for composed SVGs                                                                                                                                                                       | None                                                                                                                                                    | None                                                                                                                                                                                                                                          |
| A2  | Tokens: add mowing stripe `#0a6a4e` and pressed gold `#c9a73c` to `@theme` (plus tertiary `#2d6f8f` if used); replace the three ad-hoc stripe overlays (`CareerHub.tsx:269`, `CareerNew.tsx:991`, `CareerMatchday.tsx:130`); fix the stale font line in `ASSETS.md`                                                                                                                                                                                                                                                                                             | None                                                                                                                                                    | None                                                                                                                                                                                                                                          |
| A3  | **Crest renderer v2**: divisions, drop shadow, inner rim, optional founding-year ribbon, symbol contrast against both field colours. The 15 shapes and 33 symbols already exist; redraw them **in place** (never reorder, append only). Derive the division and founding year from the club id or crest index (no storage) rather than storing them                                                                                                                                                                                                             | None if derived (a stored `Club.founded` would need a v21 backfill)                                                                                     | None if derived; **never** add draws to `generateCrest`, which would reshuffle every club's kits, manager and squad                                                                                                                           |
| A4  | **Kit renderer v2**: named collars (crew, V, polo, grandad, each in two treatments, to keep 8 distinct), cuffs, the **club crest as the badge** (`renderKit` gains a crest parameter), sponsor name from an i18n list indexed by `kit.sponsor`                                                                                                                                                                                                                                                                                                                  | None                                                                                                                                                    | None                                                                                                                                                                                                                                          |
| A5  | **Avatar data model**: optional `iris?`, `nose?`, `mouth?` (8 options each, per AGENTS.md); widen ranges to hair 12, facial hair 9, accessories 9, eyebrows, eyes and faces 8. Update the 0..7 checks in `worldValidation.ts:66-79`, `career/create.ts:82` and `lifestyle/wardrobe.ts:107`; add cosmetic catalogue entries `hair:8-11` and `accessory:8` (otherwise a new career fails to save, `lifestyleValidation.ts:38`); generalise the 8-tile wardrobe grid (`CareerWardrobe.tsx:270`); add wizard part labels; normalise the session-stored wizard draft | **Schema 20 → 21 with a no-op migration**, so older app versions report "future save" rather than "invalid"; update the hard-coded schema-version test assertions | **Keep exactly 8 draws in `generateAvatar`.** Derive the new parts from an id-seeded side stream (`createRng(\`avatar:${id}\`)`; `fork` ignores parent state, so the scope must include the id). Widening ranges remaps looks (cosmetic only) |
| A6  | **`renderAvatar` v2**: `(avatar, age, dress?: { kit, crest })` with a neutral default and a head-only mode. Update the 12 call-site groups: career `PlayerPortrait`, match `Footballer` (use the kit from `chooseMatchKits`, not always home), club inspector, club life, rival, legacy, chronicle poster, wardrobe (preview and option tiles, whose lower-face crop depends on face coordinates), wizard (neutral or trial kit), agents (neutral), edit mode, gallery and menu. Remove the duplicate CSS circles around portraits                              | None                                                                                                                                                    | None                                                                                                                                                                                                                                          |
| A7  | Gear figure: move shorts into `gear.ts`; add `renderFigure` (shirt, shorts, socks, boots, armband) with the avatar head                                                                                                                                                                                                                                                                                                                                                                                                                                         | None                                                                                                                                                    | None                                                                                                                                                                                                                                          |
| A8  | **New illustration modules** (all SVG in code, listed in `ASSETS.md`): `trophies.ts` (league cup, lidded cup, big-eared cup, golden ball, golden boot, medal; mapped from competition id and award kind), `flags.ts` (six countries plus a fallback for legacy worlds), `lifestyle.ts` (six kinds or the 19 shop items), `conditions.ts` (weather and pitch icons), `celebrations.ts` (poses on the figure), `stadium.ts` (club-coloured stadium)                                                                                                               | None                                                                                                                                                    | None                                                                                                                                                                                                                                          |
| A9  | Chronicle poster v2: tokens instead of `#0b3d2c` / `#f1cf58` / `#f9f5e9`, the kit bust and crest, Bebas Neue embedded as a data-URI font in the SVG                                                                                                                                                                                                                                                                                                                                                                                                             | None                                                                                                                                                    | None                                                                                                                                                                                                                                          |
| A10 | Tests and docs: `assets.test.ts` (the symbol-colour regex breaks once a shadow or division group comes first; per-part counts; unique ids), a migration test for v20 → 21, avatar fixtures (optional fields keep the 17 unit and 7 e2e fixtures compiling), `ASSETS.md`, `ARCHITECTURE.md`                                                                                                                                                                                                                                                                      | —                                                                                                                                                       | —                                                                                                                                                                                                                                             |

**Determinism rule for the whole art layer:** no new draws in `generateAvatar`, `generateCrest`,
`generatePlayer` or any other seeded world stream. One extra draw would give every subsequent player
in a club different names and traits, change every agent and the career player's potential, and
make existing saves simulate differently from the upgrade onwards.

## 4. Presentation-only changes worth flagging

These need code, but no engine or data work:

- **Tactical camera framing:** a world-container scale and translate in `pitchScene.ts`; the zone
  comes from the situation spot until M4 lands.
- **Match screen:** dark sidebar with a LIVE tag, the scoreboard bar, the 0–90' timeline with
  markers (goals, half time and key moments are available now; cards after M7).
- **"You" chip and zone letters in league tables, crests in edit-mode list rows, overall-rating
  hexagons.** The hexagons need C1.
- **Tutorial:** dimming around the target (`src/ui/Tutorial.tsx`).
- **Phones:** the More sheet docked above the tab bar (`Shell.tsx`, which needs the bar above the
  modal backdrop); a collapsible wizard summary sheet (`CareerNew.tsx`); training's Reset button
  shown on phones.
- **Sidebar:** the active player's portrait (data already in the store).

## 5. Bugs found during the audit

- **Doubled "a week" in transfer talks.** `agentRead` (`src/i18n/market.ts:167`) is filled with
  `weekly(...)` (`CareerTransfers.tsx:796-799`) and renders "about 1,234 Cr / week a week". Drop
  " a week" from the copy or pass `money()`.
- **Two "overall" calculations disagree.** The club inspector and culture fit use an unweighted mean;
  the rival screen uses position-weighted `playerAbility`. C1 fixes this.
- **Unused types and copy:** `SlotSummary` (`domain.ts:1437`) is dead. The rival `'media'` timeline
  kind and the debut / first-goal / injury / rivalry feed kinds are never produced (C6, C7).

## 6. Decisions (agreed 2026-10-14)

1. **Bottom tab bar on phones during a match: kept.** Navigation never moves (product principle 2),
   and the match saves itself, so leaving is always safe. The pitch gets its room from a compact
   one-line scoreboard and commentary folded behind a "Commentary" toggle on phones. The phone match
   artboards are drawn without the bar; build them with it.
2. **Squad numbers: real, per player, kept.** Add `Player.squadNumber`, assigned without random
   draws: keeper 1, conventional numbers by position (2 RB, 3 LB, 4–6 centre, 7 and 11 wide,
   8 and 10 midfield, 9 striker), then the lowest free number; unique within a club. On a move a
   player keeps his number if it is free at the new club, otherwise he takes the lowest free one;
   youth intake starts at 30. Existing saves are backfilled with the same rules during the v21
   migration. Tokens, line-ups, the tactical camera and clips show the real number.
3. **Pre-match objectives: their own RNG stream.** Objectives are drawn from
   `${seed}:objectives`, keyed only by the fixture and the selected player's position, so what
   the hub shows days earlier is exactly what is set at kickoff. They are shown on the hub only
   when the player is expected to start (selection chance ≥ 50%), with "if you are picked"
   otherwise. Moving the draws out of the preview stream shifts the per-seed weather, so this ships
   inside the first outcome-changing engine bump (phase 6) and is re-gated with it.
4. **Crest division and founding year: calculated.** Both are derived from the club id and crest
   numbers on a side hash (never the world RNG), so they are identical everywhere with no stored
   field or migration. "Draw a new crest" in edit mode changes the division along with the
   shape and symbol. The same `foundedYear(club)` helper feeds the club inspector ("Founded 1887").
   Storing them stays possible later, with these values as the backfill.
5. **Cards: two steps.** First, cosmetic yellow cards in commentary, the timeline and the report,
   weighted by aggression and tackling, with no effect on results (phase 6). Later, as its own phase
   after everything else is stable: full discipline. That means second yellows and reds (10 men,
   with recalibrated goal rates), suspensions feeding team selection and your career, and a
   booking risk on tackle choices in key moments.

## 7. Phases

Each phase leaves the game shippable, with typecheck, lint, unit tests and the critical Playwright
flows passing.

**Status:** phase 1 done (f71f9e5); phase 2 done (squad numbers, save schema v21, portraits,
figure, crests, kits, lettering, illustrations and the poster); phase 3 done (UI kit in
`src/ui/kit` with `docs/UI-KIT.md`, shell, tutorial, save-card portraits, fixture dates, and every
career screen); phase 4 done (World, saved games, settings, edit mode, gallery; switch,
slider and radio-tile kit components). Next: phase 5 (match engine presentation).

| Phase                                     | Contents                                                                                                                                                                                                                                                                                                                 | Outcome-changing?                 | Save impact                                                   |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------- | ------------------------------------------------------------- |
| 1 · Foundations                           | Design tokens (mowing stripe, pressed gold, tertiary blue) replacing ad-hoc overlays; art colour constants; the agent-read copy bug; one overall rating and the six-axis summary (C1) used everywhere, including the club inspector; familiarity words (C9); the backup-reminder switch (C11); the `ASSETS.md` font line | No                                | None                                                          |
| 2 · Art and identity                      | Crest v2 (A3), kit v2 with crest badge and sponsor names (A4), avatar model and renderer v2 (A5, A6), full-body figure (A7), new illustrations (A8), Chronicle poster (A9), squad numbers (decision 2), tests and docs (A10)                                                                                             | No                                | Schema 20 → 21: no-op for avatars, backfill for squad numbers |
| 3 · Shell and the career screens          | New sidebar, top bar, phone tab bar with the docked More sheet, tutorial dimming; shared components from the UI kit; Clubhouse, wizard and every career page, light and dark; the save-card portrait (C4), fixture dates (C8)                                                                                            | No                                | None                                                          |
| 4 · World, saves, settings, edit, gallery | Remaining screens, feedback states, dialogs and banners                                                                                                                                                                                                                                                                  | No                                | None                                                          |
| 5 · Match engine, presentation            | M0 harness, M1 beats, M2 patterns, M3 narration, M6 stats, M9 clips v2, M10 maps, and the new live-play, tactical-camera framing and report screens                                                                                                                                                                      | No: outcome hashes stay identical | Engine version bump: in-progress matches restart cleanly      |
| 6 · Match engine, decisions               | M4 cast and targets, M5 track the runner, objectives stream (decision 3), cosmetic yellow cards, AI substitutions and a bench of 7, M8 weather and pitch; each re-gated against the 10,000-match tests                                                                                                                   | Yes                               | Engine version bump                                           |
| 7 · Career extras                         | Pre-match plan on the hub (C2), live Hall of Fame rank (C3), inbox sender and deadline (C5), rival press timeline (C6), new feed events (C7), per-celebration uses (C10)                                                                                                                                                 | No                                | Optional fields only                                          |
| Later · Discipline                        | Second yellows, red cards, suspensions, booking risk in key moments (decision 5)                                                                                                                                                                                                                                         | Yes                               | Engine bump; optional suspension fields                       |
