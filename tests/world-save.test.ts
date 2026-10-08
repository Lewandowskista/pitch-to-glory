import { describe, expect, it } from 'vitest';
import { createSave, DEFAULT_SETTINGS, migrateSave, parseSave } from '../src/persistence/schema';
import { SaveDatabase, SaveRepository } from '../src/persistence/repository';
import { validateWorld } from '../src/persistence/worldSchema';
import { CREST_SYMBOLS } from '../src/engine/assets/crest';

describe('world milestone save upgrade', () => {
  it('migrates version 2 collections without losing their seed, preferences or revision', () => {
    const v2 = {
      ...createSave(1, 'Original', {
        kind: 'foundation',
        gallery: { seed: 'kept', generation: 4 },
        settings: { ...DEFAULT_SETTINGS, theme: 'dark' },
      }),
      schemaVersion: 2,
      revision: 7,
    };
    const migrated = migrateSave(v2);
    expect(migrated.schemaVersion).toBe(18);
    expect(migrated.payload).toEqual(v2.payload);
    expect(migrated.revision).toBe(7);
  });
  it('round trips a generated world through IndexedDB and a JSON backup', async () => {
    const { generateWorld } = await import('../src/engine/world/generate');
    const world = generateWorld('saved-world', { format: 'legacy' });
    expect(Math.max(...Object.values(world.clubs).map((club) => club.crest.symbol))).toBeLessThan(
      CREST_SYMBOLS.length,
    );
    validateWorld(world);
    const payload = {
      kind: 'world' as const,
      world,
      gallery: { seed: 'art', generation: 0 },
      settings: { ...DEFAULT_SETTINGS },
    };
    const save = createSave(1, 'World', payload);
    const db = new SaveDatabase('world-roundtrip');
    try {
      const repository = new SaveRepository(db);
      const written = await repository.write(save, null);
      expect(await repository.read(1)).toEqual(written);
      expect(parseSave(JSON.stringify(written))).toEqual(written);
      const imported = await repository.import(JSON.stringify(written), 2, null);
      expect(imported.slot).toBe(2);
      expect(imported.payload).toEqual(payload);
    } finally {
      db.close();
      await db.delete();
    }
  });
  it('rejects malformed world foreign keys and non-finite attributes atomically', async () => {
    const { generateWorld } = await import('../src/engine/world/generate');
    const world = generateWorld('validation', { format: 'legacy' });
    const payload = {
      kind: 'world' as const,
      world,
      gallery: { seed: 'art', generation: 0 },
      settings: { ...DEFAULT_SETTINGS },
    };
    const save = createSave(1, 'World', payload);
    const invalidClub = structuredClone(save);
    if (invalidClub.payload.kind !== 'world') throw new Error('world payload required');
    Object.values(invalidClub.payload.world.clubs)[0]!.managerId = 'missing-manager';
    expect(() => migrateSave(invalidClub)).toThrow('invalid');
    const invalidPlayer = structuredClone(save);
    if (invalidPlayer.payload.kind !== 'world') throw new Error('world payload required');
    Object.values(invalidPlayer.payload.world.players)[0]!.attributes.finishing = NaN;
    expect(() => migrateSave(invalidPlayer)).toThrow('invalid');
    const db = new SaveDatabase('world-invalid-import');
    try {
      const repository = new SaveRepository(db);
      const original = await repository.write(save, null);
      await expect(
        repository.import(JSON.stringify(invalidClub), 1, original.revision),
      ).rejects.toThrow('invalid');
      expect(await repository.read(1)).toEqual(original);
    } finally {
      db.close();
      await db.delete();
    }
  });
  it('validates every weekly checkpoint, including transfers, intake and next-season history', async () => {
    const { generateWorld } = await import('../src/engine/world/generate');
    const { simulateWeek, startNextSeason } = await import('../src/engine/world/simulate');
    let world = generateWorld('checkpoint-validation', { format: 'legacy' });
    for (let week = 1; week <= 34; week++) {
      world = simulateWeek(world);
      expect(() => validateWorld(world), `checkpoint ${week}`).not.toThrow();
    }
    expect(() => validateWorld(startNextSeason(world))).not.toThrow();
    const noHistory = structuredClone(world);
    noHistory.history = [];
    expect(() => validateWorld(noHistory)).toThrow();
    const incomplete = structuredClone(world);
    delete incomplete.results[Object.keys(incomplete.results)[0]!];
    expect(() => validateWorld(incomplete)).toThrow();
  }, 120000);
  it('rejects empty cup stages, empty archived tables and invalid fixture schedules', async () => {
    const { generateWorld } = await import('../src/engine/world/generate');
    const world = generateWorld('malformed-structure', { format: 'legacy' });
    const noStages = structuredClone(world);
    Object.values(noStages.competitions)[0]!.stages = [];
    expect(() => validateWorld(noStages)).toThrow();
    const brokenSchedule = structuredClone(world);
    const fixture = Object.values(brokenSchedule.fixtures)[0]!;
    fixture.date.week = 34;
    expect(() => validateWorld(brokenSchedule)).toThrow();
    const archived = structuredClone(world);
    archived.history.push({
      season: 2025,
      tables: Object.fromEntries(Object.keys(world.leagues).map((id) => [id, []])),
      champions: {},
      cupWinners: {},
      movements: [],
    });
    expect(() => validateWorld(archived)).toThrow();
  });
});
