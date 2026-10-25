/**
 * Golden saves (docs/RELEASE-1.0-PLAN.md step 2.2): real files exported by past releases, in
 * tests/fixtures/saves (see its README). Each one is imported as a player would import it, its
 * match in progress finishes under the engine that started it and commits, a week simulates,
 * the world validates, and the save exports and imports back identically.
 *
 * The national fixtures are heavy (a 46 MB world each, about a minute apiece): they belong in
 * the `slow` Vitest project once it exists. The manifest and legacy checks are fast.
 */
import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { brotliDecompressSync } from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';
import type { GoldenSaveEntry, GoldenSaveManifest } from '../scripts/make-golden-save';
import { CONFIG } from '../src/engine/config';
import { applyMatchCommand, createMatchSession } from '../src/engine/match';
import type { MatchSession } from '../src/engine/match/types';
import { autoPlayCommand, careerMatchSetup, defaultTactics } from '../src/engine/career/matches';
import { pendingCareerFixture } from '../src/engine/career/fixtures';
import { careerInvariants } from '../src/engine/career/invariants';
import { LocalSaveRepository, SaveDatabase } from '../src/persistence/localRepository';
import { parseSave, type AppSave } from '../src/persistence/schema';
import { validateWorld } from '../src/persistence/worldSchema';
import { worldOperations } from '../src/workers/operations';
import type { World, WorldState } from '../src/model/domain';

const DIRECTORY = 'tests/fixtures/saves';
const manifest = JSON.parse(
  readFileSync(`${DIRECTORY}/manifest.json`, 'utf8'),
) as GoldenSaveManifest;
/** Fixtures the plan requires (step 2.2); later releases add their own. */
const REQUIRED = [
  'v0.3.0-legacy-match.json.br',
  'v0.3.0-match.json.br',
  'v0.8.0-match.json.br',
  'v0.9.1-match.json.br',
  'v0.9.1-season.json.br',
];
/**
 * How each fixture's match in progress loads today: `resume` replays it under its own engine,
 * `restart` means this build no longer supports that engine, so loading discards the session
 * with the `match-discarded` notice and the fixture is played again from kick-off. The 1.0
 * compatibility cut (step 2.4, decision D3) moved sessions from before match-21 to `restart`
 * (docs/COMPATIBILITY.md).
 */
const SESSIONS: Record<string, 'resume' | 'restart'> = {
  'match-16': 'restart',
  'match-20': 'restart',
  'match-21': 'resume',
};
const MAX_TOTAL_BYTES = 20 * 1024 * 1024;

const databases: SaveDatabase[] = [];
afterEach(async () => {
  for (const db of databases.splice(0)) {
    db.close();
    await db.delete();
  }
});
const read = (entry: GoldenSaveEntry): string =>
  brotliDecompressSync(readFileSync(`${DIRECTORY}/${entry.file}`)).toString('utf8');
const entry = (file: string): GoldenSaveEntry => {
  const found = manifest.fixtures.find((item) => item.file === file);
  if (!found) throw new Error(`${file} is not in the manifest`);
  return found;
};
const worldOf = (save: AppSave): WorldState => {
  if (save.payload.kind !== 'world') throw new Error('Expected a career save');
  return save.payload;
};
/** Everything but the slot, the time it was written and the slot's revision. */
const content = (json: string): string => {
  const {
    slot: _slot,
    updatedAt: _updatedAt,
    revision: _revision,
    ...rest
  } = JSON.parse(json) as Record<string, unknown>;
  void [_slot, _updatedAt, _revision];
  return JSON.stringify(rest);
};

/** Import, finish the match, commit, simulate a week, export, import again and compare. */
async function playThrough(item: GoldenSaveEntry): Promise<void> {
  const json = read(item);
  expect(createHash('sha256').update(json).digest('hex'), 'fixture integrity').toBe(item.sha256);
  const original = JSON.parse(json) as {
    schemaVersion: number;
    payload: { world: World; matchSession?: MatchSession };
  };
  expect(original.schemaVersion).toBe(item.schemaVersion);
  expect(Boolean(original.payload.matchSession)).toBe(item.match !== null);

  // Import into an empty slot, as the Saves screen does, then load it as Continue does.
  const db = new SaveDatabase(`golden-${item.file}-${Date.now()}`);
  databases.push(db);
  const repository = new LocalSaveRepository(db);
  const imported = await repository.import(json, 1, null);
  expect(imported.schemaVersion).toBe(CONFIG.saves.schemaVersion);
  let save = (await repository.read(1))!;
  expect(save.revision).toBe(imported.revision);
  const loaded = worldOf(save);
  const world = loaded.world;
  // Migration and validation keep the release's world as it was written.
  expect(world.date).toMatchObject({ season: item.world.season, week: item.world.week });
  expect(JSON.stringify(world) === JSON.stringify(original.payload.world), 'world kept').toBe(true);

  if (item.match) {
    const expectation = SESSIONS[item.match.engine] ?? 'restart';
    let session: MatchSession;
    if (expectation === 'resume') {
      expect(imported.recovery).toBeUndefined();
      expect(loaded.matchSession, 'session kept').toBeDefined();
      session = loaded.matchSession!;
      expect(session.engine).toBe(item.match.engine);
      expect(session.state.match.minute).toBe(item.match.minute);
      expect(session.commands).toHaveLength(item.match.commands);
      expect(JSON.stringify(session) === JSON.stringify(original.payload.matchSession)).toBe(true);
    } else {
      // The documented notice: the world loads, the match starts again from kick-off.
      expect(imported.recovery).toBe('match-discarded');
      expect(loaded.matchSession).toBeUndefined();
      const fixture = pendingCareerFixture(world)!;
      const setup = careerMatchSetup(world, fixture);
      session = createMatchSession(setup, defaultTactics(world, setup));
    }
    const engine = session.engine;
    while (session.state.match.status !== 'finished') {
      session = applyMatchCommand(session, autoPlayCommand(session));
      expect(session.engine).toBe(engine);
    }
    // The full-time checkpoint the match screen writes (without the world).
    const receipt = await repository.writeWithoutWorld(
      {
        slot: 1,
        worldId: world.id,
        updatedAt: new Date().toISOString(),
        gallery: loaded.gallery,
        settings: loaded.settings,
        matchSession: session,
      },
      save.revision,
    );
    save = { ...save, revision: receipt.revision };
    // The result commits exactly as the world worker commits it, and the session is cleared.
    const fixtureId = session.setup.fixture!.id;
    const { outcome } = worldOperations.commit(world, session);
    expect(world.results[fixtureId], 'result recorded').toBeDefined();
    expect(outcome.record.fixtureId).toBe(fixtureId);
    save = await repository.write(
      {
        ...save,
        payload: { kind: 'world', gallery: loaded.gallery, settings: loaded.settings, world },
        updatedAt: new Date().toISOString(),
      },
      save.revision,
    );
  }

  // One week, as Continue simulates it. A save between matches plays its waiting fixture with
  // the headless policy first; after a committed match nothing is left to play.
  const week = world.date.week;
  const step = worldOperations.week(world, item.match === null);
  expect(step.pendingFixtureId).toBeNull();
  expect(step.world.date.week).toBe(week + 1);
  expect(careerInvariants(step.world)).toEqual([]);
  validateWorld(JSON.parse(JSON.stringify(step.world)));
  save = await repository.write(
    {
      ...save,
      payload: {
        kind: 'world',
        gallery: loaded.gallery,
        settings: loaded.settings,
        world: step.world,
      },
      updatedAt: new Date().toISOString(),
    },
    save.revision,
  );

  // Export, import into another slot and export again: identical but for slot and time.
  const first = await repository.exportJSON(1);
  const { recovery: _recovery, ...reparsed } = parseSave(first.json);
  void _recovery;
  expect(JSON.stringify(reparsed) === first.json, 'export is already canonical').toBe(true);
  await repository.import(first.json, 2, null);
  const second = await repository.exportJSON(2);
  expect(JSON.parse(second.json)).toMatchObject({ slot: 2 });
  expect(content(second.json) === content(first.json), 'round trip').toBe(true);
}

describe('golden saves from past releases', () => {
  it('lists every required release in a manifest that matches the committed files', () => {
    const files = manifest.fixtures.map((item) => item.file);
    expect(files).toEqual(expect.arrayContaining(REQUIRED));
    let total = 0;
    for (const item of manifest.fixtures) {
      const bytes = statSync(`${DIRECTORY}/${item.file}`).size;
      expect(bytes, item.file).toBe(item.bytes);
      expect(item.schemaVersion).toBeLessThanOrEqual(CONFIG.saves.schemaVersion);
      total += bytes;
    }
    expect(total).toBeLessThanOrEqual(MAX_TOTAL_BYTES);
    // Every saved engine has a stated expectation, so a cut in support is a deliberate change.
    for (const item of manifest.fixtures)
      if (item.match) expect(SESSIONS, item.file).toHaveProperty([item.match.engine]);
  });
  it('0.3.0 legacy world mid-match: loads, finishes, commits, simulates and round trips', async () => {
    await playThrough(entry('v0.3.0-legacy-match.json.br'));
  }, 120_000);
  // Heavy: national worlds. Candidates for the `slow` project.
  it('0.3.0 national world mid-match (match-16, restarts): loads, finishes, commits, simulates and round trips [slow]', async () => {
    await playThrough(entry('v0.3.0-match.json.br'));
  }, 600_000);
  it('0.8.0 national world mid-match (match-20, restarts): loads, finishes, commits, simulates and round trips [slow]', async () => {
    await playThrough(entry('v0.8.0-match.json.br'));
  }, 600_000);
  it('0.9.1 national world mid-match (match-21): loads, finishes, commits, simulates and round trips [slow]', async () => {
    await playThrough(entry('v0.9.1-match.json.br'));
  }, 600_000);
  it('0.9.1 national world in its second season: loads, simulates and round trips [slow]', async () => {
    await playThrough(entry('v0.9.1-season.json.br'));
  }, 600_000);
});
