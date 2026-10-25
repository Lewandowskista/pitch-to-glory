import { afterEach, describe, expect, it, vi } from 'vitest';
import { SaveDatabase, SaveRepository } from '../src/persistence/repository';
import {
  createSave,
  DEFAULT_SETTINGS,
  migrateSave,
  parseSave,
  unvalidatedSave,
  type AppSave,
} from '../src/persistence/schema';
import { executePersistenceRequest } from '../src/workers/persistence.worker';
import type { PersistenceOperation } from '../src/persistence/workerClient';
import { generateWorld } from '../src/engine/world/generate';
import type { World } from '../src/model/domain';

const databases: SaveDatabase[] = [];
const setup = () => {
  const db = new SaveDatabase(`recovery-${Date.now()}-${databases.length}`);
  databases.push(db);
  return { db, repo: new SaveRepository(db) };
};
afterEach(async () => {
  vi.useRealTimers();
  for (const db of databases.splice(0)) await db.delete();
});
let shared: World | null = null;
const world = () => (shared ??= generateWorld('save-recovery', { format: 'legacy' }));
const worldSave = (slot: 1 | 2 | 3 = 1): AppSave =>
  createSave(slot, 'Clock career', {
    kind: 'world',
    world: world(),
    gallery: { seed: 'clock', generation: 0 },
    settings: DEFAULT_SETTINGS,
  });
/** Run with the device clock at `iso`; only Date is faked, so IndexedDB keeps working. */
async function at<T>(iso: string, operation: () => Promise<T> | T): Promise<T> {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(iso));
  try {
    return await operation();
  } finally {
    vi.useRealTimers();
  }
}
const AHEAD = '2031-06-01T12:00:00.000Z';
const BEHIND = '2026-10-25T09:00:00.000Z';

describe('save timestamps after a clock change (S1)', () => {
  it('reads a stamp before creation as written at creation instead of rejecting it', () => {
    const save = createSave(1, 'Skewed', {
      kind: 'foundation',
      gallery: { seed: 'skew', generation: 0 },
      settings: DEFAULT_SETTINGS,
    });
    const skewed = { ...save, createdAt: AHEAD, updatedAt: BEHIND };
    expect(migrateSave(skewed)).toMatchObject({ createdAt: AHEAD, updatedAt: AHEAD });
    expect(parseSave(JSON.stringify(skewed)).updatedAt).toBe(AHEAD);
    // Malformed stamps are still rejected.
    expect(() => migrateSave({ ...save, createdAt: 'yesterday' })).toThrow();
  });

  it('keeps a save made while the clock ran ahead readable, writable and exportable', async () => {
    const { db, repo } = setup();
    // Created while the device clock was years ahead…
    const created = await at(AHEAD, () => repo.write(worldSave(), null));
    // …then the clock is corrected and a match checkpoint writes preferences only.
    const checkpoint = await at(BEHIND, () =>
      repo.writeWithoutWorldChange(
        { ...created, updatedAt: new Date().toISOString() },
        created.revision,
      ),
    );
    expect(checkpoint.updatedAt).toBe(AHEAD);
    expect((await db.saves.get(1))?.updatedAt).toBe(AHEAD);
    await at(BEHIND, async () => {
      const read = await repo.read(1);
      expect(read).toMatchObject({ createdAt: AHEAD, updatedAt: AHEAD, revision: 2 });
      const written = await repo.write(
        { ...read!, updatedAt: new Date().toISOString() },
        read!.revision,
      );
      expect(written).toMatchObject({ updatedAt: AHEAD, revision: 3 });
      const exported = await repo.exportJSON(1);
      expect(parseSave(exported.json)).toMatchObject({ createdAt: AHEAD, revision: 3 });
      expect((await repo.list())[0]).toMatchObject({ status: 'ready', updatedAt: AHEAD });
    });
  });

  it('loads a save already stamped before its creation by an earlier version', async () => {
    const { db, repo } = setup();
    const created = await at(AHEAD, () => repo.write(worldSave(), null));
    // What 0.9.0's preferences-only write stored after the clock went back.
    const meta = (await db.saves.get(1))!;
    await db.saves.put({ ...meta, updatedAt: BEHIND });
    const read = await repo.read(1);
    expect(read).toMatchObject({ createdAt: AHEAD, updatedAt: AHEAD, revision: 1 });
    expect(read!.payload).toEqual(created.payload);
    await expect(
      repo.write({ ...read!, updatedAt: BEHIND }, read!.revision),
    ).resolves.toMatchObject({ updatedAt: AHEAD, revision: 2 });
    await expect(repo.exportJSON(1)).resolves.toMatchObject({ name: 'Clock career' });
  });

  it('imports a file made on a device whose clock ran ahead', async () => {
    const { repo } = setup();
    const file = await at(AHEAD, () =>
      createSave(2, 'From the future', {
        kind: 'foundation',
        gallery: { seed: 'ahead', generation: 1 },
        settings: DEFAULT_SETTINGS,
      }),
    );
    const imported = await at(BEHIND, () => repo.import(JSON.stringify(file), 2, null));
    expect(imported).toMatchObject({ slot: 2, createdAt: AHEAD, updatedAt: AHEAD, revision: 1 });
    expect(await repo.read(2)).toMatchObject({ name: 'From the future', updatedAt: AHEAD });
  });
});

describe('recovery export (S3)', () => {
  const stored = async (db: SaveDatabase, slot: 1 | 2 | 3) =>
    structuredClone(
      await Promise.all([db.saves.get(slot), db.worlds.get(slot), db.matches.get(slot)]),
    );

  it('exports a slot whose world fails validation, leaving every record untouched', async () => {
    const { db, repo } = setup();
    await repo.write(worldSave(), null);
    // A validator regression, or damage: the world no longer passes its checks.
    const record = (await db.worlds.get(1))!;
    await db.worlds.put({ ...record, world: { ...record.world, phase: 'broken' as never } });
    await expect(repo.read(1)).rejects.toMatchObject({ code: 'invalid' });
    await expect(repo.exportJSON(1)).rejects.toMatchObject({ code: 'invalid' });
    // The slot list reads metadata only, so the slot still looks ready.
    expect((await repo.list())[0]).toMatchObject({ status: 'ready' });

    const before = await stored(db, 1);
    const recovery = await repo.exportRecovery(1);
    expect(await stored(db, 1)).toEqual(before);
    expect(recovery.name).toBe('Clock career');
    const file = JSON.parse(recovery.json) as AppSave;
    // The same envelope a backup uses, so a later version can attempt to import it.
    expect(file).toMatchObject({
      format: 'pitch-to-glory',
      slot: 1,
      name: 'Clock career',
      revision: 1,
      payload: { kind: 'world', gallery: { seed: 'clock' }, world: { phase: 'broken' } },
    });
    expect(file).not.toHaveProperty('layout');
    expect(JSON.parse(JSON.stringify(file.payload.kind === 'world' && file.payload.world))).toEqual(
      JSON.parse(JSON.stringify(before[1]!.world)),
    );
    // Repairing the damage makes the very same file import cleanly.
    const repaired = { ...file, payload: { ...file.payload, world: world() } };
    await expect(repo.import(JSON.stringify(repaired), 2, null)).resolves.toMatchObject({
      slot: 2,
    });
  });

  it('exports an unreadable record as stored, and refuses an empty slot', async () => {
    const { db, repo } = setup();
    await db.saves.put({ slot: 3, garbage: true, name: 'Odd' } as never);
    expect((await repo.list())[2]).toMatchObject({ status: 'error', code: 'invalid' });
    const recovery = await repo.exportRecovery(3);
    expect(JSON.parse(recovery.json)).toEqual({ slot: 3, garbage: true, name: 'Odd' });
    expect(await db.saves.get(3)).toEqual({ slot: 3, garbage: true, name: 'Odd' });
    await expect(repo.exportRecovery(2)).rejects.toMatchObject({ code: 'invalid' });
    await expect(repo.exportRecovery(4 as 1)).rejects.toThrow();
  });

  it('runs in the persistence worker, including the unchecked copy of an unsaved session', async () => {
    const { db, repo } = setup();
    await repo.write(worldSave(), null);
    const record = (await db.worlds.get(1))!;
    await db.worlds.put({ ...record, world: { ...record.world, phase: 'broken' as never } });
    let sequence = 0;
    const request = (operation: PersistenceOperation) =>
      executePersistenceRequest(
        { ...operation, database: db.name, requestId: `recovery-${++sequence}` },
        () => db,
      );
    expect(await request({ operation: 'export', slot: 1 })).toMatchObject({
      ok: false,
      code: 'invalid',
    });
    const response = await request({ operation: 'export-recovery', slot: 1 });
    expect(response).toMatchObject({ ok: true, value: { name: 'Clock career' } });
    if (!response.ok || !response.value || !('json' in response.value))
      throw new Error('Expected a recovery file');
    expect(JSON.parse(response.value.json)).toMatchObject({
      payload: { world: { phase: 'broken' } },
    });

    const payload = {
      kind: 'world' as const,
      world: { ...world(), phase: 'broken' as never },
      gallery: { seed: 'clock', generation: 0 },
      settings: DEFAULT_SETTINGS,
    };
    const operation = {
      operation: 'serialize' as const,
      slot: 1 as const,
      name: 'Unsaved',
      payload,
    };
    expect(await request(operation)).toMatchObject({ ok: false, code: 'invalid' });
    const unchecked = await request({ ...operation, unvalidated: true });
    if (!unchecked.ok || !unchecked.value || !('json' in unchecked.value))
      throw new Error('Expected an unchecked file');
    expect(JSON.parse(unchecked.value.json)).toMatchObject({
      format: 'pitch-to-glory',
      name: 'Unsaved',
      payload: { world: { phase: 'broken' } },
    });
    expect(Object.keys(JSON.parse(unchecked.value.json)).sort()).toEqual(
      Object.keys(unvalidatedSave(1, 'Unsaved', payload)).sort(),
    );
  });
});
