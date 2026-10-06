import { describe, expect, it } from 'vitest';
import { generateWorld } from '../src/engine/world/generate';
import { simulateWeek, startNextSeason } from '../src/engine/world/simulate';
import { validateWorld } from '../src/persistence/worldSchema';
import { createSave, DEFAULT_SETTINGS, migrateSave, parseSave } from '../src/persistence/schema';
import Dexie from 'dexie';
import { SaveDatabase, SaveRepository } from '../src/persistence/repository';

describe('national world persistence', () => {
  it('preserves version three worlds and their original rules', () => {
    const world = generateWorld('legacy-version', { format: 'legacy' });
    const save = createSave(1, 'Legacy', {
      kind: 'world',
      world,
      settings: DEFAULT_SETTINGS,
      gallery: { seed: 'art', generation: 0 },
    });
    const migrated = migrateSave({ ...save, schemaVersion: 3 });
    expect(migrated.schemaVersion).toBe(11);
    expect(migrated.payload).toEqual(save.payload);
    expect(world.format).toBeUndefined();
  });
  it('upgrades an actual version-three database without regenerating its world', async () => {
    const world = generateWorld('database-v3', { format: 'legacy' });
    const save = {
      ...createSave(1, 'Legacy', {
        kind: 'world',
        world,
        settings: DEFAULT_SETTINGS,
        gallery: { seed: 'art', generation: 0 },
      }),
      schemaVersion: 3,
    };
    const name = `national-v4-upgrade-${Date.now()}`;
    const old = new Dexie(name);
    old.version(3).stores({ saves: 'slot,updatedAt,revision', leases: 'slot,expires' });
    await old.table('saves').put(save);
    old.close();
    const upgraded = new SaveDatabase(name);
    try {
      const read = await new SaveRepository(upgraded).read(1);
      expect(read?.schemaVersion).toBe(11);
      expect(read?.payload).toEqual(save.payload);
    } finally {
      upgraded.close();
      await upgraded.delete();
    }
  });
  it('round trips full national groups and rejects forged membership and rules', () => {
    const world = generateWorld('national-save');
    const save = createSave(2, 'National', {
      kind: 'world',
      world,
      settings: DEFAULT_SETTINGS,
      gallery: { seed: 'art', generation: 0 },
    });
    expect(parseSave(JSON.stringify(save))).toEqual(save);
    const corrupt = structuredClone(world);
    Object.values(corrupt.leagues)[0]!.clubIds.pop();
    expect(() => validateWorld(corrupt)).toThrow();
    const rules = structuredClone(world);
    Object.values(rules.pyramid!.profiles)[0]!.divisions[0]!.groups[0]!.size = 8;
    expect(() => validateWorld(rules)).toThrow();
    const duplicate = structuredClone(world);
    const fixtures = Object.values(duplicate.fixtures);
    fixtures[1]!.homeId = fixtures[0]!.homeId;
    fixtures[1]!.date = { ...fixtures[0]!.date };
    expect(() => validateWorld(duplicate)).toThrow();
    const skipped = structuredClone(world);
    skipped.pyramid!.completedSteps.push('country:0:resolved');
    expect(() => validateWorld(skipped)).toThrow();
    const capacity = structuredClone(world);
    Object.values(capacity.leagues)[0]!.capacity = 8;
    expect(() => validateWorld(capacity)).toThrow();
    const truncated = structuredClone(world);
    truncated.season.end.week = 46;
    expect(() => validateWorld(truncated)).toThrow();
  }, 30000);
  it('validates weekly checkpoints, resolved playoffs, feeder movement and a new season', () => {
    let world = generateWorld('national-checkpoints');
    while (world.phase === 'active') {
      world = simulateWeek(world);
      validateWorld(world);
    }
    expect(Object.keys(world.pyramid!.ties).length).toBeGreaterThan(0);
    expect(Object.keys(world.pyramid!.phases).length).toBeGreaterThan(0);
    const damaged = structuredClone(world);
    Object.values(damaged.pyramid!.ties)[0]!.aggregate = [999, 999];
    expect(() => validateWorld(damaged)).toThrow();
    const archived = structuredClone(world);
    Object.values(archived.history[0]!.ties!)[0]!.winnerId = 'club:missing';
    expect(() => validateWorld(archived)).toThrow();
    const bonus = structuredClone(world);
    const survival = Object.values(bonus.pyramid!.phases).find(
      (phase) => phase.kind === 'survival',
    )!;
    survival.initialPoints[survival.clubIds[0]!]! += 1;
    expect(() => validateWorld(bonus)).toThrow();
    expect(() => validateWorld(startNextSeason(world))).not.toThrow();
  }, 180000);
});
