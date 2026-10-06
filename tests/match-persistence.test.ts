import Dexie from 'dexie';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createMatchSetup, createMatchSession, applyMatchCommand } from '../src/engine/match';
import { generateWorld } from '../src/engine/world/generate';
import { createSave, DEFAULT_SETTINGS, migrateSave, parseSave } from '../src/persistence/schema';
import { SaveDatabase } from '../src/persistence/repository';
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
  it('round trips a decision checkpoint and rejects outcomes and squads changed outside replay', () => {
    const state = payload();
    while (state.matchSession!.state.match.status === 'live')
      state.matchSession = applyMatchCommand(state.matchSession!, { type: 'advance' });
    const save = createSave(1, 'Match checkpoint', state);
    expect(parseSave(JSON.stringify(save))).toEqual(save);
    const forged = structuredClone(save);
    if (forged.payload.kind !== 'world') throw new Error('Expected world');
    forged.payload.matchSession!.state.match.score[0]++;
    expect(() => migrateSave(forged)).toThrow('invalid');
    const unrelated = payload();
    const setup = structuredClone(unrelated.matchSession!.setup);
    setup.home.name = 'Forged club';
    unrelated.matchSession = createMatchSession(setup, unrelated.matchSession!.initialTactics);
    expect(() => createSave(1, 'Forged setup', unrelated)).toThrow('invalid');
  });
  it('upgrades a real version-four database without changing its world or creating a match', async () => {
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
    const migrated = await db.saves.get(1);
    expect(migrated?.schemaVersion).toBe(5);
    expect(migrated?.payload).toEqual(state);
    expect(migrated?.payload).not.toHaveProperty('matchSession');
  });
  it('writes compact match checkpoints with ownership and revision checks and retains world data', async () => {
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
      operation: 'match-checkpoint' as const,
      slot: 1 as const,
      worldId: world.id,
      matchSession,
      expectedRevision: 1,
      updatedAt: new Date().toISOString(),
    };
    expect(await request(command, 'other-tab')).toMatchObject({ ok: false, code: 'locked' });
    const result = await request(command);
    expect(result).toMatchObject({ ok: true, value: { revision: 2, payload: { matchSession } } });
    if (!result.ok || !result.value || Array.isArray(result.value) || !('payload' in result.value))
      throw new Error('Expected receipt');
    expect(result.value.payload).not.toHaveProperty('world');
    expect(await request(command)).toMatchObject({ ok: false, code: 'conflict' });
    const stored = await db.saves.get(1);
    expect(stored?.payload.kind === 'world' && stored.payload.world).toEqual(world);
    const invalidMatch = structuredClone(matchSession);
    invalidMatch.state.match.minute = 90;
    expect(
      await request({ ...command, matchSession: invalidMatch, expectedRevision: 2 }),
    ).toMatchObject({ ok: false, code: 'invalid' });
    expect((await db.saves.get(1))?.revision).toBe(2);
  });
});
