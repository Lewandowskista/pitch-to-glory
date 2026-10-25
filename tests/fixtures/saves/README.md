# Golden saves

Real save files written by past releases, so that every change to the save schema, the
validators or the match engine is tested against what players actually have
([release 1.0 plan](../../../docs/RELEASE-1.0-PLAN.md), step 2.2). `tests/golden-saves.test.ts`
imports each one through the same path as a player's import (parse, migrate, validate, write to
IndexedDB), finishes its match in progress under the engine that started it, commits the result,
simulates a week, validates the world and checks that the save exports and imports back
identically.

Each file is the JSON the release's own **Export** writes, compressed with brotli (quality 11,
24-bit window). `manifest.json` records for each one the release and commit, the seed, the world
date, the match in progress (engine, minute, commands, whether a key moment is waiting), the
SHA-256 of the uncompressed JSON and the exact command that made it.

| File                          | Release | Commit    | World                  | Match in progress                     |
| ----------------------------- | ------- | --------- | ---------------------- | ------------------------------------- |
| `v0.3.0-legacy-match.json.br` | 0.3.0   | `55a7f1d` | legacy, 2026 week 21   | `match-16`, striker, minute 30        |
| `v0.3.0-match.json.br`        | 0.3.0   | `55a7f1d` | national, 2026 week 21 | `match-16`, striker, minute 32        |
| `v0.8.0-match.json.br`        | 0.8.0   | `e27de73` | national, 2026 week 21 | `match-20`, midfielder, minute 43     |
| `v0.9.1-match.json.br`        | 0.9.1   | `70704ac` | national, 2026 week 21 | `match-21`, goalkeeper, minute 40     |
| `v0.9.1-season.json.br`       | 0.9.1   | `70704ac` | national, 2027 week 20 | none (second season, between matches) |

All were written under save schema 22. Release 0.10.0 stores the same shape as 0.9.1.

## Adding a fixture for a release

Do this for every release that changes the save schema or the match engine, and at least once a
minor release. Keep the folder under 20 MB (the test checks it); a national world is about 3 MB.

1. Export the release's tree next to your checkout and give it this checkout's packages:

   ```sh
   mkdir -p /tmp/ptg-1.0.0
   git archive <release commit> | tar -x -C /tmp/ptg-1.0.0
   ln -s "$PWD/node_modules" /tmp/ptg-1.0.0/node_modules
   ```

2. From this checkout, play and export it with the release's own code:

   ```sh
   node --max-old-space-size=6144 --import tsx scripts/make-golden-save.ts \
     --root /tmp/ptg-1.0.0 --commit <release commit> \
     --out tests/fixtures/saves/v1.0.0-match.json.br --match 30
   npx prettier --write tests/fixtures/saves/manifest.json
   ```

   `--match <minute>` stops mid-match at the next key moment after that minute; leave it out for
   a save between matches. `--seasons <n>` plays whole seasons first and `--week <n>` picks the
   week (default 21). `--position`, `--archetype`, `--format legacy` and `--seed` vary the career.
   The script only imports the release's engine and save schema, so it also runs from a checkout
   of the release itself (`--root` defaults to the working directory).

3. Add a test for the file in `tests/golden-saves.test.ts`, and the file to `REQUIRED` there. If
   the save's match engine is new, add it to `SESSIONS`.

When a build stops supporting an old match engine (step 2.4, decision D3), set that engine to
`restart` in `SESSIONS`: the test then expects the documented `match-discarded` notice and plays
the fixture again from kick-off. Never delete a fixture to make a test pass.
