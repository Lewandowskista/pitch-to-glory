import Dexie from 'dexie';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createMatchSetup, createMatchSession, applyMatchCommand } from '../src/engine/match';
import { generateWorld } from '../src/engine/world/generate';
import { createSave, DEFAULT_SETTINGS, migrateSave, parseSave } from '../src/persistence/schema';
import { SaveDatabase } from '../src/persistence/repository';
import { LocalSaveRepository } from '../src/persistence/localRepository';
import { executePersistenceRequest } from '../src/workers/persistence.worker';
import type { World, WorldState } from '../src/model/domain';
import type { PersistenceOperation } from '../src/persistence/workerClient';

let world: World;
beforeAll(() => {
  world = generateWorld('match-persistence', { format: 'legacy' });
});
const databases: SaveDatabase[] = [];
afterEach(async () => {
  for (const db of databases.splice(0)) await db.delete();
});
function payload(): WorldState {
  const [home, away] = Object.values(world.clubs);
  const setup = createMatchSetup(
    world,
    home!.id,
    away!.id,
    home!.playerIds[0]!,
    'persistent-friendly',
  );
  return {
    kind: 'world',
    world,
    gallery: { seed: world.seed, generation: 0 },
    settings: DEFAULT_SETTINGS,
    matchSession: applyMatchCommand(
      createMatchSession(setup, { role: 'balanced', risk: 'balanced', mentality: 'balanced' }),
      { type: 'kickoff' },
    ),
  };
}
describe('saved interactive matches', () => {
  it('round trips a decision checkpoint and discards outcomes or squads changed outside replay', () => {
    const state = payload();
    while (state.matchSession!.state.match.status === 'live')
      state.matchSession = applyMatchCommand(state.matchSession!, { type: 'advance' });
    const save = createSave(1, 'Match checkpoint', state);
    expect(save.recovery).toBeUndefined();
    expect(parseSave(JSON.stringify(save))).toEqual(save);
    // A forged or stale session is dropped; the world itself is kept and the load explains why.
    const forged = structuredClone(save);
    if (forged.payload.kind !== 'world') throw new Error('Expected world');
    forged.payload.matchSession!.state.match.score[0]++;
    const loaded = migrateSave(forged);
    expect(loaded.recovery).toBe('match-discarded');
    expect(loaded.payload).not.toHaveProperty('matchSession');
    expect(loaded.payload.kind === 'world' && loaded.payload.world).toEqual(world);
    const unrelated = payload();
    const setup = structuredClone(unrelated.matchSession!.setup);
    setup.home.name = 'Forged club';
    unrelated.matchSession = createMatchSession(setup, unrelated.matchSession!.initialTactics);
    expect(createSave(1, 'Forged setup', unrelated).recovery).toBe('match-discarded');
  });
  it('keeps the world and discards a session saved by an older match engine', () => {
    const state = payload();
    const save = createSave(1, 'Old engine', state);
    if (save.payload.kind !== 'world') throw new Error('Expected world');
    const stale = structuredClone(save) as unknown as {
      payload: { matchSession: Record<string, unknown> };
    };
    stale.payload.matchSession.engine = 'match-3';
    const loaded = parseSave(JSON.stringify(stale));
    expect(loaded.recovery).toBe('match-discarded');
    expect(loaded.payload.kind === 'world' && loaded.payload.world).toEqual(world);
    delete stale.payload.matchSession.engine;
    expect(parseSave(JSON.stringify(stale)).recovery).toBe('match-discarded');
  });
  it('rejects writing a session that does not replay, instead of silently dropping it', async () => {
    const db = new SaveDatabase(`match-strict-${Date.now()}`);
    databases.push(db);
    const state = payload();
    const save = createSave(1, 'Strict', state);
    if (save.payload.kind !== 'world') throw new Error('Expected world');
    save.payload.matchSession!.state.match.score[1] = 7;
    await expect(new LocalSaveRepository(db).write(save, null)).rejects.toThrow('invalid');
    expect(await db.saves.get(1)).toBeUndefined();
  });
  it('splits a real version-four database without changing its world or creating a match', async () => {
    const state = payload();
    delete state.matchSession;
    const save = { ...createSave(1, 'Before matchday', state), schemaVersion: 4 };
    const name = `match-v5-${Date.now()}`;
    const old = new Dexie(name);
    old.version(4).stores({ saves: 'slot,updatedAt,revision', leases: 'slot,expires' });
    await old.table('saves').put(save);
    old.close();
    const db = new SaveDatabase(name);
    databases.push(db);
    expect(await db.saves.get(1)).toMatchObject({ layout: 2, kind: 'world', revision: 0 });
    expect((await db.worlds.get(1))?.world).toEqual(world);
    expect(await db.matches.get(1)).toBeUndefined();
    const read = await new LocalSaveRepository(db).read(1);
    expect(read?.schemaVersion).toBe(12);
    expect(read?.payload).toEqual(state);
  });
  it('writes match checkpoints without the world, with ownership and revision checks', async () => {
    const db = new SaveDatabase(`match-worker-${Date.now()}`);
    databases.push(db);
    let sequence = 0;
    const request = (operation: PersistenceOperation, owner = 'match-tab') =>
      executePersistenceRequest(
        { ...operation, requestId: String(++sequence), database: db.name, owner },
        () => db,
      );
    await db.leases.put({ slot: 1, owner: 'match-tab', expires: Date.now() + 60000 });
    const state = payload();
    await request({
      operation: 'create',
      slot: 1,
      name: 'Friendly',
      payload: state,
      expectedRevision: null,
    });
    const matchSession = applyMatchCommand(state.matchSession!, { type: 'advance' });
    const command = {
      operation: 'write-without-world' as const,
      value: {
        slot: 1 as const,
        worldId: world.id,
        updatedAt: new Date().toISOString(),
        gallery: state.gallery,
        settings: { ...state.settings, reducedMotion: true },
        matchSession,
      },
      expectedRevision: 1,
    };
    expect(await request(command, 'other-tab')).toMatchObject({ ok: false, code: 'locked' });
    const result = await request(command);
    expect(result).toMatchObject({
      ok: true,
      value: { revision: 2, payload: { matchSession, settings: { reducedMotion: true } } },
    });
    if (!result.ok || !result.value || Array.isArray(result.value) || !('payload' in result.value))
      throw new Error('Expected receipt');
    expect(result.value.payload).not.toHaveProperty('world');
    expect(await request(command)).toMatchObject({ ok: false, code: 'conflict' });
    expect((await db.worlds.get(1))?.world).toEqual(world);
    expect((await db.matches.get(1))?.session).toEqual(matchSession);
    const read = await new LocalSaveRepository(db).read(1);
    expect(read?.payload.kind === 'world' && read.payload.matchSession).toEqual(matchSession);
    expect(read?.payload.settings.reducedMotion).toBe(true);
    const invalidMatch = structuredClone(matchSession);
    invalidMatch.state.match.minute = 90;
    expect(
      await request({
        ...command,
        value: { ...command.value, matchSession: invalidMatch },
        expectedRevision: 2,
      }),
    ).toMatchObject({ ok: false, code: 'invalid' });
    expect(
      await request({
        ...command,
        value: { ...command.value, worldId: 'world:other' },
        expectedRevision: 2,
      }),
    ).toMatchObject({ ok: false, code: 'invalid' });
    expect((await db.saves.get(1))?.revision).toBe(2);
  });
});
