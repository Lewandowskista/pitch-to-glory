import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { World } from '../src/model/domain';
import { validateWorld } from '../src/persistence/worldSchema';
import { covers, type CoverageManifest } from '../src/persistence/coverage';
import { SaveDatabase, SaveRepository } from '../src/persistence/repository';
import { createSave, DEFAULT_SETTINGS, parseSave } from '../src/persistence/schema';
import { objectsAt, recordReads } from './support/coverage';
import { populatedWorlds } from './support/populated';

/**
 * Release 1.0 step 4.9 (finding K8). Each validator declares the fields of the type it checks
 * (`src/persistence/coverage.ts`); the typecheck holds the declaration to the type. This test
 * holds the validator to the declaration: on fully populated worlds, every field is present
 * somewhere, and every field declared as checked is read by the validator at its path. Then
 * those worlds go through a save and an export unchanged.
 */
const modules = import.meta.glob<Record<string, unknown>>(
  '../src/persistence/*{Validation,Schema}.ts',
  { eager: true },
);
const manifests = Object.values(modules).flatMap((module) =>
  Object.values(module).filter(
    (value): value is CoverageManifest =>
      typeof value === 'object' && value !== null && 'path' in value && 'fields' in value,
  ),
);

let worlds: { name: string; world: World }[];
const present = new Map<string, Set<string>>();
const read = new Map<string, Set<string>>();
beforeAll(async () => {
  worlds = await populatedWorlds();
  for (const { world } of worlds) {
    const recording = recordReads(world, manifests);
    validateWorld(recording.value);
    for (const manifest of manifests) {
      const seen = present.get(manifest.path) ?? new Set<string>();
      for (const object of objectsAt(world, manifest.path))
        for (const [key, value] of Object.entries(object)) if (value !== undefined) seen.add(key);
      present.set(manifest.path, seen);
      const reads = read.get(manifest.path) ?? new Set<string>();
      for (const key of recording.reads.get(manifest.path) ?? []) reads.add(key);
      read.set(manifest.path, reads);
    }
  }
}, 600000);

describe('validator coverage of persisted types (step 4.9)', () => {
  it('finds a manifest for the most changed types', () => {
    expect(manifests.map((manifest) => manifest.path)).toEqual(
      expect.arrayContaining([
        '',
        'career',
        'career.market',
        'career.honours',
        'career.social',
        'career.style',
        'players.*',
        'clubs.*',
        'contracts.*',
        'international',
        'legacies.*',
      ]),
    );
    expect(new Set(manifests.map((manifest) => manifest.path)).size).toBe(manifests.length);
  });

  it('populates every declared field in the fixtures', () => {
    const missing = manifests.flatMap((manifest) =>
      Object.keys(manifest.fields)
        .filter((field) => !present.get(manifest.path)!.has(field))
        .map((field) => `${manifest.path || 'world'}.${field}`),
    );
    // A new field needs a value in tests/support/populated.ts.
    expect(missing).toEqual([]);
  });

  it('reads every field declared as checked', () => {
    const unread = manifests.flatMap((manifest) =>
      Object.entries(manifest.fields)
        .filter(([field, check]) => check === true && !read.get(manifest.path)!.has(field))
        .map(([field]) => `${manifest.path || 'world'}.${field}`),
    );
    // A field declared as checked must be checked by the validator that declares it.
    expect(unread).toEqual([]);
  });

  it('holds a manifest to its type at compile time', () => {
    type Sample = { required: number; optional?: string };
    // @ts-expect-error -- a field of the type is missing
    covers<Sample>('sample', { required: true });
    // @ts-expect-error -- a field the type does not have
    covers<Sample>('sample', { required: true, optional: true, extra: true });
    expect(covers<Sample>('sample', { required: true, optional: 'derived' }).fields).toEqual({
      required: true,
      optional: 'derived',
    });
  });
});

describe('a fully populated world round-trips (step 4.9)', () => {
  const databases: SaveDatabase[] = [];
  afterAll(async () => {
    for (const db of databases) await db.delete();
  });
  it('saves, loads and exports every populated world without dropping or rejecting anything', async () => {
    for (const [index, { name, world }] of worlds.entries()) {
      const json = JSON.stringify(world);
      const db = new SaveDatabase(`populated-${Date.now()}-${index}`);
      databases.push(db);
      const repo = new SaveRepository(db);
      await repo.write(
        createSave(1, name, {
          kind: 'world',
          world: JSON.parse(json) as World,
          gallery: { seed: 'populated', generation: 0 },
          settings: DEFAULT_SETTINGS,
        }),
        null,
      );
      const loaded = await repo.read(1);
      expect(loaded, name).not.toHaveProperty('recovery');
      expect(loaded!.payload.kind === 'world' && JSON.stringify(loaded!.payload.world), name).toBe(
        json,
      );
      const exported = parseSave((await repo.exportJSON(1)).json);
      expect(exported, name).not.toHaveProperty('recovery');
      expect(
        exported.payload.kind === 'world' && JSON.stringify(exported.payload.world),
        name,
      ).toBe(json);
    }
  }, 600000);
});
