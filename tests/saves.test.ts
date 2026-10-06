import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { SaveDatabase, SaveRepository } from '../src/persistence/repository';
import { createSave, migrateSave, parseSave, DEFAULT_SETTINGS } from '../src/persistence/schema';
import { LeaseLock } from '../src/persistence/locks';
import { CONFIG } from '../src/engine/config';

const databases: SaveDatabase[] = [];
const setup = () => {
  const db = new SaveDatabase(`test-${databases.length}-${Date.now()}`);
  databases.push(db);
  return { db, repo: new SaveRepository(db) };
};
afterEach(async () => {
  for (const db of databases.splice(0)) await db.delete();
});

describe('save schema and migration', () => {
  it('round trips through exported JSON', () => {
    const save = createSave(1, 'Collection', {
      kind: 'foundation',
      gallery: { seed: 'football', generation: 2 },
      settings: DEFAULT_SETTINGS,
    });
    expect(parseSave(JSON.stringify(save))).toEqual(save);
  });
  it('migrates the original seed-only file', () => {
    const old = {
      format: 'pitch-to-glory',
      schemaVersion: 1,
      slot: 2,
      name: 'Old collection',
      seed: 'old',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    };
    expect(migrateSave(old)).toMatchObject({
      schemaVersion: CONFIG.saves.schemaVersion,
      revision: 0,
      payload: {
        kind: 'foundation',
        gallery: { seed: 'old', generation: 0 },
        settings: DEFAULT_SETTINGS,
      },
    });
  });
  it('rejects unsupported versions, malformed files and corrupt nested data', () => {
    const save = createSave(1, 'Test', {
      kind: 'foundation',
      gallery: { seed: 'a', generation: 0 },
      settings: DEFAULT_SETTINGS,
    });
    expect(() => parseSave('{broken')).toThrow();
    expect(() => migrateSave({ ...save, schemaVersion: 99 })).toThrow();
    expect(() => migrateSave({ ...save, slot: 4 })).toThrow();
    expect(() => migrateSave({ ...save, updatedAt: 'bad' })).toThrow();
    expect(() =>
      migrateSave({
        ...save,
        payload: { ...save.payload, settings: { ...DEFAULT_SETTINGS, fontScale: 12 } },
      }),
    ).toThrow();
    expect(() => migrateSave({ ...save, payload: { kind: 'career', world: {} } })).toThrow();
  });
});

describe('IndexedDB repository', () => {
  it('round trips, lists three slots and deletes', async () => {
    const { repo } = setup();
    const save = createSave(1, 'My art', {
      kind: 'foundation',
      gallery: { seed: 'abc', generation: 0 },
      settings: DEFAULT_SETTINGS,
    });
    await repo.write(save, null);
    expect(await repo.read(1)).toEqual({ ...save, revision: 1 });
    expect((await repo.list()).map((listing) => listing.status)).toEqual([
      'ready',
      'empty',
      'empty',
    ]);
    await repo.remove(1, 1);
    expect(await repo.read(1)).toBeUndefined();
  });
  it('rejects stale overwrites and invalid slots', async () => {
    const { repo } = setup();
    const save = createSave(2, 'Safe', {
      kind: 'foundation',
      gallery: { seed: 'a', generation: 0 },
      settings: DEFAULT_SETTINGS,
    });
    await repo.write(save, null);
    await expect(repo.write({ ...save, name: 'Stale' }, 0)).rejects.toThrow();
    expect((await repo.read(2))?.name).toBe('Safe');
    await expect(repo.read(4 as 1)).rejects.toThrow();
  });
  it('imports into a selected slot and rejects invalid files without overwriting', async () => {
    const { repo } = setup();
    const save = createSave(1, 'Import', {
      kind: 'foundation',
      gallery: { seed: 'import', generation: 0 },
      settings: DEFAULT_SETTINGS,
    });
    await repo.import(JSON.stringify(save), 3, null);
    expect(await repo.read(3)).toMatchObject({ slot: 3, name: 'Import', revision: 1 });
    await expect(repo.import('{bad}', 3, 1)).rejects.toThrow();
    expect((await repo.read(3))?.name).toBe('Import');
  });
  it('upgrades an actual v1 Dexie database', async () => {
    const name = `legacy-${Date.now()}`;
    const old = new Dexie(name);
    old.version(1).stores({ saves: 'slot,updatedAt', leases: 'slot' });
    await old.table('saves').put({
      format: 'pitch-to-glory',
      schemaVersion: 1,
      slot: 1,
      name: 'Old',
      seed: 'old',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    });
    old.close();
    const db = new SaveDatabase(name);
    databases.push(db);
    expect(await new SaveRepository(db).read(1)).toMatchObject({
      schemaVersion: CONFIG.saves.schemaVersion,
      payload: { gallery: { seed: 'old' } },
    });
  });
  it('lists every slot independently when one is damaged or from a newer version', async () => {
    const { db, repo } = setup();
    const save = createSave(1, 'Healthy', {
      kind: 'foundation',
      gallery: { seed: 'ok', generation: 0 },
      settings: DEFAULT_SETTINGS,
    });
    await repo.write(save, null);
    await db.saves.put({ ...save, slot: 2, schemaVersion: 99, revision: 4 } as never);
    await db.saves.put({ slot: 3, garbage: true } as never);
    const listing = await repo.list();
    expect(listing[0]).toMatchObject({ status: 'ready', name: 'Healthy' });
    expect(listing[1]).toMatchObject({ status: 'error', code: 'future', revision: 4 });
    expect(listing[2]).toMatchObject({ status: 'error', code: 'invalid', revision: null });
    // A damaged slot can be removed or replaced without touching the healthy one.
    await repo.remove(3, null);
    await repo.write({ ...save, slot: 2, name: 'Replaced' }, 4);
    expect((await repo.read(2))?.name).toBe('Replaced');
    expect((await repo.read(1))?.name).toBe('Healthy');
  });
  it('splits a v5 single-record database without validating it, keeping damaged slots readable', async () => {
    const name = `layout-${Date.now()}`;
    const old = new Dexie(name);
    old.version(5).stores({ saves: 'slot,updatedAt,revision', leases: 'slot,expires' });
    const save = createSave(1, 'Before split', {
      kind: 'foundation',
      gallery: { seed: 'split', generation: 3 },
      settings: DEFAULT_SETTINGS,
    });
    await old.table('saves').put({ ...save, schemaVersion: 5, revision: 2 });
    await old.table('saves').put({ slot: 2, schemaVersion: 5, payload: 'corrupt' });
    old.close();
    const db = new SaveDatabase(name);
    databases.push(db);
    const repo = new SaveRepository(db);
    expect(await repo.read(1)).toMatchObject({
      name: 'Before split',
      revision: 2,
      payload: { gallery: { seed: 'split', generation: 3 } },
    });
    const listing = await repo.list();
    expect(listing.map((slot) => slot.status)).toEqual(['ready', 'error', 'empty']);
  });
  it('atomically prevents two fallback owners, releases and expires leases', async () => {
    const { db } = setup();
    let now = 1000;
    const a = new LeaseLock(db, 'a', () => now);
    const b = new LeaseLock(db, 'b', () => now);
    const results = await Promise.all([a.acquire(1), b.acquire(1)]);
    expect(results.filter(Boolean)).toHaveLength(1);
    const owner = results[0] ? a : b;
    const other = results[0] ? b : a;
    expect(await owner.owns(1)).toBe(true);
    expect(await other.acquire(1)).toBe(false);
    await owner.release(1);
    expect(await other.acquire(1)).toBe(true);
    now += 40000;
    expect(await owner.acquire(1)).toBe(true);
    expect(await other.owns(1)).toBe(false);
    await a.release(1);
    await b.release(1);
  });
  it('recovers a closed native owner without stealing a live fallback lease', async () => {
    const { db } = setup();
    const a = new LeaseLock(db, 'a');
    const b = new LeaseLock(db, 'b');
    expect(await a.acquire(1, true)).toBe(true);
    // The manager only passes native=true after obtaining an exclusive Web Lock.
    expect(await b.acquire(1, true)).toBe(true);
    expect(await a.owns(1)).toBe(false);
    expect(await a.acquire(2)).toBe(true);
    expect(await b.acquire(2, true)).toBe(false);
    await a.release(2);
    await b.release(1);
  });
});
