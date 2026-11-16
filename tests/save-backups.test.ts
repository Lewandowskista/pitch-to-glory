import { afterEach, describe, expect, it, vi } from 'vitest';
import { SaveDatabase, SaveRepository } from '../src/persistence/repository';
import { LocalSaveRepository } from '../src/persistence/localRepository';
import { createSave, DEFAULT_SETTINGS, parseSave, type AppSave } from '../src/persistence/schema';
import {
  BackupScheduler,
  SlotBackups,
  backupDue,
  type BackupInfo,
  type SlotSnapshot,
} from '../src/persistence/backups';
import { isQuotaError, type StorageEstimate } from '../src/persistence/storage';
import { SaveError } from '../src/persistence/errors';
import { CONFIG } from '../src/engine/config';
import { encodeWorld } from '../src/workers/worldCodec';
import { summarizeWorld } from '../src/persistence/summary';
import { executePersistenceRequest } from '../src/workers/persistence.worker';
import type { PersistenceOperation, PersistenceRequest } from '../src/persistence/workerClient';
import { unpackBackup } from '../src/persistence/backup';
import type { World } from '../src/model/domain';
import { nationalCareer } from './support/world';

const MiB = 1024 * 1024;
const databases: SaveDatabase[] = [];
afterEach(async () => {
  vi.useRealTimers();
  for (const db of databases.splice(0)) await db.delete();
});

let shared: string | null = null;
/** A fresh copy of the shared career world. */
const careerWorld = (): World => {
  shared ??= JSON.stringify(nationalCareer());
  return JSON.parse(shared) as World;
};
const OWNER = 'backup-tab';

/**
 * A repository with backups, a storage estimate the test controls (`free`, in bytes, or null
 * for a browser that gives none; backups count against it) and a clock it can move.
 */
function setup(options: { free?: number | null } = {}) {
  const db = new SaveDatabase(`backups-${Date.now()}-${databases.length}`);
  databases.push(db);
  const state = { free: options.free === undefined ? 4096 * MiB : options.free, now: new Date() };
  const estimate = async (): Promise<StorageEstimate | null> => {
    if (state.free === null) return null;
    const stored = (await db.backups.toArray()).reduce(
      (sum, entry) => sum + ('stored' in entry ? entry.stored : 0),
      0,
    );
    return { quota: 8192 * MiB, usage: 8192 * MiB - state.free + stored };
  };
  const backups = new SlotBackups(db, estimate, () => state.now);
  const scheduler = new BackupScheduler(backups);
  const repo = new LocalSaveRepository(db, undefined, { estimate, backups: scheduler });
  const plain = new SaveRepository(db);
  return { db, repo, plain, scheduler, backups, state, estimate };
}
const careerSave = (world: World = careerWorld(), slot: 1 | 2 | 3 = 1): AppSave =>
  createSave(slot, 'Backed-up career', {
    kind: 'world',
    world,
    gallery: { seed: 'backups', generation: 0 },
    settings: DEFAULT_SETTINGS,
  });
/** The app's whole write of a world, from its bytes (a checkpoint when `replace` is false). */
function writeWorld(
  repo: LocalSaveRepository,
  world: World,
  expected: number | null,
  replace = false,
  slot: 1 | 2 | 3 = 1,
) {
  const now = new Date().toISOString();
  return repo.writeWorld(
    {
      slot,
      name: 'Backed-up career',
      createdAt: now,
      updatedAt: now,
      gallery: { seed: 'backups', generation: 0 },
      settings: DEFAULT_SETTINGS,
      worldId: world.id,
      summary: summarizeWorld(world),
      bytes: encodeWorld(world).bytes,
      matchSession: null,
      replace,
    },
    expected,
  );
}
const infos = async (db: SaveDatabase) =>
  (await db.backups.toArray()).filter((entry): entry is BackupInfo => entry.kind !== 'skipped');

describe('rotating backups (step 4.3)', () => {
  it('keeps one season generation, replaced only when the stored season moves on', async () => {
    const { db, repo, scheduler } = setup();
    const world = careerWorld();
    await writeWorld(repo, world, null, true);
    await scheduler.idle();
    let [season] = await infos(db);
    expect(season).toMatchObject({
      id: '1:season',
      kind: 'season',
      slot: 1,
      revision: 1,
      season: world.date.season,
      worldId: world.id,
    });
    // Compressed: a fraction of the world's JSON.
    expect(season!.stored).toBeLessThan(season!.bytes / 3);
    // Another week of the same season: no new copy.
    world.date.week += 1;
    await writeWorld(repo, world, 1);
    await scheduler.idle();
    expect((await infos(db)).map((entry) => entry.revision)).toEqual([1]);
    // The next season: the generation is replaced.
    world.date.season += 1;
    world.date.week = 1;
    await writeWorld(repo, world, 2);
    await scheduler.idle();
    [season] = await infos(db);
    expect(season).toMatchObject({ kind: 'season', revision: 3, season: world.date.season });
    expect(await db.backups.count()).toBe(1);
  });

  it('takes the day generation after the first load of a day that passes every check', async () => {
    const { db, repo, scheduler, state } = setup();
    await repo.write(careerSave(), null);
    await scheduler.idle();
    await repo.load(1);
    await scheduler.idle();
    const day = (await db.backups.get('1:day')) as BackupInfo;
    expect(day).toMatchObject({ kind: 'day', revision: 1 });
    // Written again, loaded again the same day: the day's copy stays the first.
    const saved = await repo.read(1);
    await repo.write(saved!, 1);
    await repo.load(1);
    await scheduler.idle();
    expect(await db.backups.get('1:day')).toMatchObject({ revision: 1, takenAt: day.takenAt });
    // A day later it follows the slot.
    state.now = new Date(state.now.getTime() + 26 * 3600 * 1000);
    await repo.load(1);
    await scheduler.idle();
    expect(await db.backups.get('1:day')).toMatchObject({ revision: 2 });
    expect((await repo.backups()).backups.map((entry) => entry.id)).toEqual(['1:day', '1:season']);
  });

  it('decides which generation is due', () => {
    const now = new Date('2026-10-26T12:00:00Z');
    const snapshot = {
      meta: { slot: 1, revision: 5, world: { worldId: 'w', season: 2027, week: 3 } },
    } as unknown as SlotSnapshot;
    const info = (patch: Partial<BackupInfo>): BackupInfo => ({
      id: '1:x',
      slot: 1,
      kind: 'season',
      takenAt: now.toISOString(),
      name: 'x',
      revision: 4,
      worldId: 'w',
      season: 2027,
      week: 1,
      bytes: 1,
      stored: 1,
      ...patch,
    });
    expect(backupDue('season', snapshot, undefined, now)).toBe(true);
    expect(backupDue('season', snapshot, info({}), now)).toBe(false);
    expect(backupDue('season', snapshot, info({ season: 2026 }), now)).toBe(true);
    // Another world in the slot replaces every generation.
    expect(backupDue('season', snapshot, info({ worldId: 'other' }), now)).toBe(true);
    expect(backupDue('day', snapshot, info({}), now)).toBe(false);
    expect(backupDue('day', snapshot, info({ takenAt: '2026-10-24T12:00:00.000Z' }), now)).toBe(
      true,
    );
    expect(backupDue('salvage', snapshot, info({ revision: 5 }), now)).toBe(false);
    expect(backupDue('salvage', snapshot, info({ revision: 4 }), now)).toBe(true);
  });

  it('skips a backup when storage is short, says why, and never fails the save', async () => {
    const { db, repo, scheduler, state } = setup({ free: 40 * MiB });
    const saved = await repo.write(careerSave(), null);
    expect(saved.revision).toBe(1);
    await scheduler.idle();
    expect(await infos(db)).toEqual([]);
    const listing = await repo.backups();
    expect(listing.skipped).toEqual([
      expect.objectContaining({ slot: 1, kind: 'skipped', wanted: 'season', reason: 'space' }),
    ]);
    expect(listing.storage).toMatchObject({ quota: 8192 * MiB });
    // With room again, the next due backup is taken and the skip forgotten.
    state.free = 4096 * MiB;
    await repo.load(1);
    await scheduler.idle();
    const after = await repo.backups();
    expect(after.backups.map((entry) => entry.kind)).toEqual(['day']);
    expect(after.skipped).toEqual([]);
  });

  it('keeps space for the saves: reserves twice the world beyond the minimum', async () => {
    const world = careerWorld();
    const size = encodeWorld(world).bytes.length;
    const reserve = Math.max(CONFIG.saves.backups.minFreeBytes, size * 2);
    // Room for the compressed copy, but not with the reserve kept: skipped.
    const { db, repo, scheduler } = setup({ free: reserve + 1024 });
    await repo.write(careerSave(world), null);
    await scheduler.idle();
    expect(await infos(db)).toEqual([]);
    // A browser without an estimate: taken.
    const open = setup({ free: null });
    await open.repo.write(careerSave(world), null);
    await open.scheduler.idle();
    expect((await infos(open.db)).map((entry) => entry.kind)).toEqual(['season']);
  });

  it('deletes a slot’s backups with the slot, and a copy that outlived its slot', async () => {
    const { db, repo, scheduler, backups } = setup();
    await repo.write(careerSave(careerWorld(), 1), null);
    await repo.write(careerSave(careerWorld(), 2), null);
    await scheduler.idle();
    await repo.load(1);
    await scheduler.idle();
    expect((await db.backups.toArray()).map((entry) => entry.id).sort()).toEqual([
      '1:day',
      '1:season',
      '2:season',
    ]);
    await repo.remove(1, 1);
    expect((await db.backups.toArray()).map((entry) => entry.id)).toEqual(['2:season']);
    expect((await db.backupData.toArray()).map((entry) => entry.id)).toEqual(['2:season']);
    // A copy finished after its slot was deleted removes itself.
    const meta = (await db.saves.get(2)) as SlotSnapshot['meta'];
    await repo.remove(2, 1);
    await backups.take({ meta: { ...meta, revision: 9 }, bytes: null, match: null }, 'salvage');
    expect(await db.backups.count()).toBe(0);
  });

  it('runs one backup at a time, after the save, and never queues the same one twice', async () => {
    const { db, scheduler, backups } = setup();
    const take = vi.spyOn(backups, 'take');
    const meta = {
      ...(await (async () => {
        const repo = new SaveRepository(db);
        await repo.write(careerSave(), null);
        return (await db.saves.get(1)) as SlotSnapshot['meta'];
      })()),
    };
    const snapshot: SlotSnapshot = { meta, bytes: null, match: null };
    scheduler.schedule(snapshot, 'season');
    scheduler.schedule(snapshot, 'season');
    scheduler.schedule(snapshot, 'day');
    await scheduler.idle();
    expect(take.mock.calls.map(([, kind]) => kind)).toEqual(['season', 'day']);
  });
});

describe('restore from a backup (step 4.3)', () => {
  /** A slot whose world no longer passes its checks, with its season backup from before. */
  async function damaged() {
    const context = setup();
    const { db, repo, scheduler } = context;
    await repo.write(careerSave(), null);
    await scheduler.idle();
    const record = (await db.worlds.get(1))!;
    const world = JSON.parse(new TextDecoder().decode(record.bytes)) as World;
    world.phase = 'broken' as World['phase'];
    await db.worlds.put({ slot: 1, bytes: encodeWorld(world).bytes });
    await expect(repo.load(1)).rejects.toMatchObject({ code: 'invalid' });
    return context;
  }

  it('restores a slot that will not load from its backup, checked first', async () => {
    const { db, repo } = await damaged();
    const restored = await repo.restore(1, 'season', 1);
    expect(restored).toMatchObject({ slot: 1, revision: 2, name: 'Backed-up career' });
    expect(restored.payload.kind === 'world' && restored.payload.world.phase).toBe('active');
    const loaded = await repo.read(1);
    expect(loaded).toMatchObject({ revision: 2 });
    expect(loaded!.payload).toEqual(restored.payload);
    expect((await db.saves.get(1))!.revision).toBe(2);
  });

  it('refuses a stale revision, a missing generation and a backup that fails too', async () => {
    const { db, repo } = await damaged();
    await expect(repo.restore(1, 'season', 7)).rejects.toMatchObject({ code: 'conflict' });
    await expect(repo.restore(1, 'day', 1)).rejects.toMatchObject({ code: 'invalid' });
    await expect(repo.restore(1, 'bogus' as unknown as 'season', 1)).rejects.toMatchObject({
      code: 'invalid',
    });
    // Damage the backup as well: nothing is replaced.
    const data = (await db.backupData.get('1:season'))!;
    await db.backupData.put({ ...data, world: new Uint8Array([1, 2, 3]) });
    const before = Buffer.from((await db.worlds.get(1))!.bytes!);
    await expect(repo.restore(1, 'season', 1)).rejects.toMatchObject({ code: 'invalid' });
    expect(before.equals(Buffer.from((await db.worlds.get(1))!.bytes!))).toBe(true);
    expect((await db.saves.get(1))!.revision).toBe(1);
  });

  it('restores under the owner’s lease only', async () => {
    const { db, scheduler } = await damaged();
    const leased = new LocalSaveRepository(db, OWNER, { backups: scheduler });
    await expect(leased.restore(1, 'season', 1)).rejects.toMatchObject({ code: 'locked' });
    await db.leases.put({ slot: 1, owner: OWNER, expires: Date.now() + 60000 });
    await expect(leased.restore(1, 'season', 1)).resolves.toMatchObject({ revision: 2 });
  });

  it('exports one generation as a file without checking it', async () => {
    const { repo } = await damaged();
    const { name, json } = await repo.exportBackupGeneration(1, 'season');
    expect(name).toBe('Backed-up career');
    expect(parseSave(json)).toMatchObject({ name: 'Backed-up career', revision: 1 });
  });

  it('answers backups, restore and generation exports through the worker', async () => {
    const { db, scheduler } = await damaged();
    let sequence = 0;
    const request = (operation: PersistenceOperation) =>
      executePersistenceRequest(
        {
          ...operation,
          database: db.name,
          requestId: `backup-${++sequence}`,
        } satisfies PersistenceRequest,
        () => db,
        () => scheduler,
      );
    const listing = await request({ operation: 'backups' });
    expect(listing).toMatchObject({ ok: true, value: { backups: [{ id: '1:season' }] } });
    const exported = await request({ operation: 'export-generation', slot: 1, backup: 'season' });
    expect(exported.ok).toBe(true);
    if (exported.ok) {
      const { json } = await unpackBackup((exported.value as { file: Blob }).file);
      expect(JSON.parse(json)).toMatchObject({ name: 'Backed-up career' });
    }
    const restored = await request({
      operation: 'restore',
      slot: 1,
      backup: 'season',
      expectedRevision: 1,
    });
    expect(restored).toMatchObject({ ok: true, value: { revision: 2 } });
    expect(await request({ operation: 'read', slot: 1 })).toMatchObject({ ok: true });
  });
});

describe('storage preflight and quota errors (step 4.6)', () => {
  it('never refuses a save on the estimate alone (WebKit counts space already freed)', async () => {
    const { db, repo } = setup({ free: 1 * MiB });
    await writeWorld(repo, careerWorld(), null, true);
    expect(await db.saves.count()).toBe(1);
  });

  it('lets backups give way, oldest first, when the browser refuses a save', async () => {
    const { db, repo, scheduler, state } = setup({ free: null });
    await repo.write(careerSave(careerWorld(), 1), null);
    await repo.write(careerSave(careerWorld(), 2), null);
    await scheduler.idle();
    const backedUp = await infos(db);
    expect(backedUp).toHaveLength(2);
    const size = encodeWorld(careerWorld()).bytes.length;
    // Backups count as used: the world fits only once the oldest (slot 1's) is gone.
    const newer = backedUp.find((entry) => entry.slot === 2)!;
    state.free = size + CONFIG.saves.quotaMarginBytes + newer.stored + 1;
    vi.spyOn(db.worlds, 'put').mockRejectedValueOnce(
      new DOMException('full', 'QuotaExceededError'),
    );
    const saved = await writeWorld(repo, careerWorld(), 1);
    expect(saved.revision).toBe(2);
    expect((await infos(db)).map((entry) => entry.slot)).toEqual([2]);
  });

  it('reports quota when the browser refuses a save and no backup can give way', async () => {
    const { db, repo } = setup({ free: null });
    vi.spyOn(db.worlds, 'put').mockRejectedValue(new DOMException('full', 'QuotaExceededError'));
    await expect(writeWorld(repo, careerWorld(), null, true)).rejects.toSatisfy(isQuotaError);
    expect(await db.saves.count()).toBe(0);
  });

  it('maps IndexedDB’s QuotaExceededError to quota, also inside an aborted transaction', async () => {
    expect(isQuotaError(new DOMException('full', 'QuotaExceededError'))).toBe(true);
    expect(isQuotaError({ name: 'AbortError', inner: { name: 'QuotaExceededError' } })).toBe(true);
    expect(isQuotaError(new SaveError('large'))).toBe(false);
    expect(isQuotaError(new Error('storage'))).toBe(false);
    const { db } = setup({ free: null });
    vi.spyOn(db.worlds, 'put').mockRejectedValue(new DOMException('full', 'QuotaExceededError'));
    const save = careerSave();
    const response = await executePersistenceRequest(
      {
        operation: 'write',
        value: save,
        expectedRevision: null,
        database: db.name,
        requestId: 'quota-1',
      },
      () => db,
    );
    expect(response).toEqual({ requestId: 'quota-1', ok: false, code: 'quota' });
    expect(await db.saves.count()).toBe(0);
  });
});
