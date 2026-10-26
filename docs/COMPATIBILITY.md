# Compatibility

What a build of Pitch to Glory can load and replay, and the policy for keeping it that way. The
[1.0 plan](RELEASE-1.0-PLAN.md) (step 2.4, decision D3) set the policy; this page is the record
of what is live. `tests/compatibility.test.ts` reads the table below and fails when it disagrees
with the code.

## Live versions

<!-- compatibility:versions -->

| Item                      | Value      | Where                                                       |
| ------------------------- | ---------- | ----------------------------------------------------------- |
| Save schema               | `23`       | `CONFIG.saves.schemaVersion` (`src/engine/config.ts`)       |
| Match engine              | `match-22` | `MATCH_ENGINE_VERSION` (`src/engine/match/types.ts`)        |
| Previous match engine     | `match-21` | `PREVIOUS_MATCH_ENGINE` (absent while none is kept)         |
| World development version | `2`        | `World.developmentVersion`, `RULE_FLAGS` (`world/rules.ts`) |
| World selection version   | `1`        | `World.selectionVersion`, `CONFIG.selection.version`        |
| World economy version     | `1`        | `World.economyVersion`                                      |
| World achievement record  | `1`        | `World.achievements.version`                                |
| Career development rules  | `3`        | `Career.developmentRules`                                   |
| World identity (national) | `2`        | `World.identityVersion`; legacy worlds have none            |

<!-- /compatibility:versions -->

### Save schema

`CONFIG.saves.schemaVersion` is written into every save. A save from an older schema is migrated
step by step by `src/persistence/schema.ts` (`migrations`, one function per version from 1 to 22),
then validated in full. A save from a newer schema is refused rather than misread. Any change to
the persisted shape needs a schema bump, enforced by `npm run check:save-shape`
([RELEASING.md](RELEASING.md), "Save schema"). Schema 23 is the 1.0 line: it adds no stored
field, and its migration adopts the current rules (below).

### Database

The IndexedDB database (`pitch-to-glory`, `SaveDatabase` in
`src/persistence/localRepository.ts`) has its own version, independent of the save schema.
Version 6 (0.3.0 to 0.10.0) holds `saves`, `worlds`, `matches` and `leases`. Version 7 (1.0,
release plan step 4.3) adds `backups` and `backupData` for the rotating backups and changes
nothing stored: the upgrade only creates the two tables. A build before 1.0 still opens a
version 7 database (Dexie 4 opens a newer database at its installed version), reads and writes
its slots as before and ignores the backups; deleting a slot there leaves that slot's backups
behind until 1.0 replaces or deletes them. A tab that has the database open when another tab
upgrades it closes its connection (`versionchange`) and cannot save until it reloads, as with
every earlier upgrade; release plan step 4.1 coordinates updates across open tabs.

### Match engine

A match in progress is saved as its setup, its initial tactics and its command log
(`MatchSession`), and is checked on load by replaying it in full. Replay is only exact on the
engine that made it, so a setup names its engine by its flags (`setupEngine`) and
`session.engine` must be that engine:

- **`match-22`, the current engine** (release 1.0, Phase 5): `formations` and every flag in
  `CURRENT_SETUP_FLAGS`, which adds `rules22` to match-21's. Every new setup is created on it
  (`createMatchSetup`, and the national match setup through the same flags).
- **`match-21`, the previous engine**, kept so a match saved by 0.9.x or 0.10.0 finishes under
  the rules it started with: every flag in `PREVIOUS_SETUP_FLAGS` and no `rules22`. It plays the
  same code as match-22, with each 1.0 rule switched off (`rules22(setup)` is false). 1.1
  deletes it (policy 2).

A session that fails the check (an earlier engine, a missing flag, or an engine that is not its
setup's) is discarded on load with the `match-discarded` notice; the world is kept and the
fixture plays again from kick-off. A finished match's report kept on the device
(`restoreReport`) is replayed on its setup's engine in the same way.

`decidingHeadline` is a narrative-only setup flag (0.9.1): match-21 sessions saved by 0.9.0 lack
it and keep the late-goal headline rule they started with. It does not change the engine.

### Rule flags

World and career rules that changed after release are versioned with a flag, so a save keeps
playing by its own rules until it adopts the new ones. Each flag, what it switches on, and how an
older save adopts it:

| Flag                       | Current | Meaning                                                                                                                     | Adopted by an older save                                                                                                                                  |
| -------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `World.developmentVersion` | 2       | Potential is peak overall ability; development follows age curves.                                                          | On load: every potential but the career player's is re-estimated once from ability and age.                                                               |
| `World.selectionVersion`   | 1       | Formation-aware selection for background results, the career's place in the side and the match engine.                      | On load. Its only effect is who starts from the next fixture on; results already played stand.                                                            |
| `World.economyVersion`     | 1       | The club economy: debt, wage budgets that follow the books, strain that slows recruiting and renewals.                      | On load: running costs are set from what each club's peers pay now. Balances are kept; strain shows from the next week.                                   |
| `World.achievements`       | 1       | One Hall of Fame record for every player.                                                                                   | On load, part-way through a season if need be (`adoptAchievementsNow`); between seasons, or without complete season statistics, at the next season start. |
| `Career.developmentRules`  | 3       | Late-career decline with longevity, playing time from fixtures the player was available for, focus-weighted passive growth. | On load: conditioning starts from the current plan and availability from recent appearances (benching was not recorded before).                           |
| `World.identityVersion`    | 2       | Real countries and towns, with fictional clubs referencing real ones.                                                       | Never: an identity, not a rule. Legacy worlds keep their fictional countries.                                                                             |

`adoptCurrentRules` (`src/engine/world/rules.ts`) applies them, in the schema 23 migration. It is
deterministic (no random draws), idempotent and returns the flags it adopted. Adoption can change
three things a saved match session holds copies of (club finances, players' potential and Hall of
Fame points); the engine reads none of them, so the migration gives the session's copies the
adopted values and the match still resumes. What adoption part-way through a season means for
records is in [DECISIONS.md](DECISIONS.md) ("The 1.0 compatibility cut").

### Retention

A long world keeps what any screen, record, Chronicle, legacy or Hall of Fame rank reads, and
stops storing the rest ([BALANCING.md](BALANCING.md#retention-release-plan-step-36), release
plan step 3.6). `applyRetention` (`src/engine/world/retention.ts`) runs at every season start
and, for a save from an earlier release, in the schema 23 migration right after
`adoptCurrentRules`. It is deterministic (no random draws) and idempotent. What a save gets when
it loads:

- **Season summaries.** All but the last 15 keep only their champions, division champions and
  cup winners (`SeasonSummary.compact`); their tables, movement and play-offs are dropped. The
  World archive says so for those seasons.
- **Archived players.** Once the world is on the shared Hall of Fame record (version 1), the
  archive keeps everyone the world still names (legacies with their children, teammates and
  mentees, records, awards and their shortlists, managers who played, the career's facts and
  stories, rivals, edits, this season's statistics and discipline) and the 5,000 best Hall of
  Fame records. The rest leave the archive and their scores join `WorldArchive.pruned`, so every
  rank, and every legacy's stored rank, stays exact. A world that adopts the record at its next
  season start (between seasons, or without complete season statistics) is pruned then.
- **Goalkeeping.** An outfield player's untrained goalkeeping, which never changes, is no
  longer stored; it reads back from the player's id with the same values (`keeperAttributesOf`).
  A saved match session's copies of those players drop it too, so the session still resumes.

A save already written by a 1.0 preview at schema 23 skips the migration and gets the same
retention at its next season start. Nothing a player earned is touched: awards keep the rules
they had (a career's, a legacy's and every Golden Ball kept whole, others trimmed at 400), and
Moments and the Chronicle stay bounded per career.

### Legacy worlds

Worlds made before the national pyramid (`World.format` absent or `'legacy'`: six fictional
countries of four eight-club divisions, 34-week seasons) stay loadable and keep their own
sporting rules frozen: league sizes, the quadruple round robin, two up and two down, fixed
reputations, same-position exchanges in the transfer windows and their fictional names. Those
rules live in `src/engine/world/legacy.ts`. They adopt the rule flags above like any world and
play the current match engine. `tests/legacy-compat.test.ts` and the 0.3.0 legacy golden save
cover them.

## What each release supports

- **Saves from every release load.** Every schema from 1 migrates; golden saves exported by
  0.3.0 (national and legacy), 0.8.0 and 0.9.1 are loaded, played on, saved and round-tripped by
  `tests/golden-saves.test.ts`.
- **Matches in progress resume only on the current engine and, while one is kept, the previous
  one.** Any older session restarts from kick-off with a notice.
- **Backup files from every release import.** From 1.0 an export is a gzip file
  (`pitch-to-glory-slot-<n>-<date>.json.gz`; plain `.json` in a browser without
  `CompressionStream`). Import tells the two apart by the file's first bytes, not its name, so
  the plain JSON backups of 0.1.0 to 0.10.0 import as before, renamed or not, and a 1.0 backup
  unpacked by the operating system imports too. Both are held to 128 MiB of uncompressed JSON.
  A release before 1.0 cannot read a gzip backup: export from 1.0 is one way, as with any save
  from a newer schema. `tests/backup-file.test.ts` and the gzip round trip in
  `tests/golden-saves.test.ts` cover this.

| Release        | Schema | Engine                   | Resumes sessions from         | Rule flags adopted                  |
| -------------- | ------ | ------------------------ | ----------------------------- | ----------------------------------- |
| 0.3.0 to 0.9.1 | 22     | `match-16` to `match-21` | every engine since `match-10` | at the next season start            |
| 1.0.0          | 23     | `match-22`               | `match-21`, `match-22`        | on load, once (schema 23 migration) |

Golden save behaviour on this build:

| Fixture                       | Saved session | On load                               |
| ----------------------------- | ------------- | ------------------------------------- |
| `v0.3.0-legacy-match.json.br` | `match-16`    | Restarts from kick-off; rules adopted |
| `v0.3.0-match.json.br`        | `match-16`    | Restarts from kick-off; rules adopted |
| `v0.8.0-match.json.br`        | `match-20`    | Restarts from kick-off                |
| `v0.9.1-match.json.br`        | `match-21`    | Resumes, on the previous engine       |
| `v0.9.1-season.json.br`       | none          | Loads                                 |

## Policy

1. **Keep every save loadable.** A major version is reserved for a save that can no longer load
   ([RELEASING.md](RELEASING.md)); 1.0.0 is not one.
2. **Keep at most one previous match engine, for one minor release.** When a release changes
   match rules it bumps `MATCH_ENGINE_VERSION`, and may keep the engine before it as
   `PREVIOUS_MATCH_ENGINE` behind one setup flag so sessions saved just before the update
   finish. The next minor release deletes that path, its gate and its snapshot table.
3. **Rules change at a season start, or once on load.** A new world or career rule gets one flag;
   new worlds start on it, and older saves adopt it at their next season start. A deliberate
   compatibility cut may adopt flags on load instead, once, as 1.0 does.
4. **Never invent history.** Where a rule cannot be applied to old records it applies from now
   on, and the limitation is written down in [DECISIONS.md](DECISIONS.md) and, where a player
   would notice, in the game.

## How to change things

**A new match engine.** Bump `MATCH_ENGINE_VERSION` and add a setup flag for the new rules
(set by `createMatchSetup` and the national match setup through `CURRENT_SETUP_FLAGS`). To keep
the previous engine for one minor release, export `PREVIOUS_MATCH_ENGINE`, accept it in
`validateMatchSession` for setups without the new flag, gate each changed rule on the flag, and
keep the previous engine's table in `tests/match-outcome-snapshot.test.ts`. Re-record the current
table and the match profile gates. Update the table above, the golden saves `SESSIONS` table and
the patch notes ("a match in progress restarts after the update" when no previous engine is
kept).

**How to change match rules in match-22.** Release 1.0 Phase 5 (steps 5.2 to 5.5) changes
the match under one engine id, `match-22`, so every rule change, however small, is gated on
the one helper `rules22(setup)` (`src/engine/match/types.ts`):

1. Keep the match-21 path byte-for-byte: `rules22(session.setup) ? new : old`, with the old
   branch's draws, streams, order and rounding exactly as they were. A new random draw goes on
   a new stream (``createRng(`${seed}:<new>:…`)``), never on an existing one, unless it is
   inside the match-22 branch alone. A new constant goes in `CONFIG.match` beside the old one.
2. A new field in the session's state or a key moment is optional and written only under
   `rules22`, so a match-21 session's JSON is unchanged (replay compares the whole session).
   Re-record the save shape with `npm run check:save-shape -- --update --same-version`.
3. Re-record `EXPECTED` in `tests/match-outcome-snapshot.test.ts` (`SNAPSHOT_PRINT=1`) and the
   match profile gates, and leave `PREVIOUS` untouched: if a match-21 hash moves, the change
   leaked. The first rule change also drops the test that the two engines still play alike.
4. Check both engines with `tests/support/engines.ts` (`playOnEngines` plays one setup on both;
   `onEngine` moves a setup to either; `expectReplays` checks a session survives a save). The
   0.9.1 golden session (`goldenSession`) must still replay and finish on match-21.

**Step 5.4 (the occasions).** Stoppage time, the bench, in-match injuries, keepers' cards, the
shootout and the touchline answers are match-22 rules. One part reaches the career outside a
session: a player left out of the eleven now plays the fixture from the bench
(`pendingCareerFixture`) instead of the background resolving it without them. It applies from
the first fixture after loading (a fixture is never half-played), like the other rules the 1.0
cut adopts on load; earlier fixtures keep their results.

Replay compares the whole session, so anything the engine writes into it is gated like a rule,
even when it only reads differently: events and their commentary keys (and the number of
variants they draw from), narration lines, headlines and reactions, keyframes and statistics.
Only what the session never stores needs no gate: the copy behind a key (`src/i18n`), the
screens and how the pitch draws the keyframes. Commentary lines are picked in
`src/engine/match/commentary.ts` (step 5.5): a new event kind or context is a new family of keys
there and in `src/i18n/commentary.ts`, already on match-22's selection.

**A new rule flag.** Add the optional field to the domain type with a schema bump, set it in
`generateWorld` or `createCareer`, adopt it in `startNextSeason` for older saves, and add it to
`RULE_FLAGS` and this page. If it can be adopted safely part-way through a season, a future
compatibility cut can move it into `adoptCurrentRules`.

**A migration.** Bump `CONFIG.saves.schemaVersion`, add `migrations[old]` in
`src/persistence/schema.ts` (a no-op if only optional fields were added), re-record the shape
with `npm run check:save-shape -- --update`, and add a migration test from a golden save.

**A golden save.** Export a save from the released build and add it with
`scripts/make-golden-save.ts` (see `tests/fixtures/saves/README.md`).
