import { afterEach, describe, expect, it } from 'vitest';
import { SaveDatabase } from '../src/persistence/repository';
import { createSave, DEFAULT_SETTINGS } from '../src/persistence/schema';
import { executePersistenceRequest } from '../src/workers/persistence.worker';
import type { PersistenceOperation, PersistenceRequest } from '../src/persistence/workerClient';
import { unpackBackup, type BackupFile } from '../src/persistence/backup';
import { nationalWorld } from './support/world';

const file = (json: string) => new Blob([json]);

const databases: SaveDatabase[] = [];
const setup = () => {
  const database = new SaveDatabase(`worker-persistence-${Date.now()}-${databases.length}`);
  databases.push(database);
  let sequence = 0;
  const request = (operation: PersistenceOperation, owner?: string) =>
    executePersistenceRequest(
      {
        ...operation,
        owner,
        database: database.name,
        requestId: `test-${++sequence}`,
      } satisfies PersistenceRequest,
      () => database,
    );
  const save = createSave(1, 'Worker collection', {
    kind: 'foundation',
    gallery: { seed: 'worker', generation: 0 },
    settings: DEFAULT_SETTINGS,
  });
  return { database, request, save };
};
afterEach(async () => {
  for (const database of databases.splice(0)) await database.delete();
});

describe('persistence worker service', () => {
  it('returns normalized write receipts without echoing the world and rejects corrupt writes', async () => {
    const { request } = setup();
    const world = nationalWorld();
    const payload = {
      kind: 'world' as const,
      world,
      gallery: { seed: 'receipt', generation: 0, ignored: true },
      settings: { ...DEFAULT_SETTINGS, ignored: true },
    };
    const response = await request({
      operation: 'create',
      slot: 1,
      name: 'Career',
      payload,
      expectedRevision: null,
    });
    expect(response).toMatchObject({
      ok: true,
      value: {
        revision: 1,
        payload: {
          kind: 'world',
          gallery: { seed: 'receipt', generation: 0 },
          settings: DEFAULT_SETTINGS,
        },
      },
    });
    if (
      !response.ok ||
      !response.value ||
      Array.isArray(response.value) ||
      !('payload' in response.value)
    )
      throw new Error('Expected write receipt');
    expect(response.value.payload).not.toHaveProperty('world');
    expect(response.value.payload.gallery).not.toHaveProperty('ignored');
    expect(response.value.payload.settings).not.toHaveProperty('ignored');
    const save = createSave(1, 'Career', payload);
    const invalid = { ...save, payload: { ...payload, world: { ...world, phase: 'broken' } } };
    expect(
      await request({ operation: 'write', value: invalid as typeof save, expectedRevision: 1 }),
    ).toMatchObject({ ok: false, code: 'invalid' });
    expect(await request({ operation: 'read', slot: 1 })).toMatchObject({
      ok: true,
      value: { revision: 1, payload: { world: { id: world.id } } },
    });
  });

  it('validates files without writing and exports the committed save in the worker', async () => {
    const { request, save } = setup();
    expect(
      await request({ operation: 'validate', file: file(JSON.stringify(save)) }),
    ).toMatchObject({
      ok: true,
      value: undefined,
    });
    expect(await request({ operation: 'read', slot: 1 })).toMatchObject({
      ok: true,
      value: undefined,
    });
    expect(await request({ operation: 'validate', file: file('bad json') })).toMatchObject({
      ok: false,
      code: 'invalid',
    });
    await request({ operation: 'write', value: save, expectedRevision: null });
    const response = await request({ operation: 'export', slot: 1 });
    if (
      !response.ok ||
      !response.value ||
      Array.isArray(response.value) ||
      !('file' in response.value)
    )
      throw new Error('Expected a backup file');
    const backup: BackupFile = response.value;
    expect(backup).toMatchObject({ name: save.name, compressed: true, nearLimit: false });
    const { json, bytes } = await unpackBackup(backup.file);
    expect(bytes).toBe(backup.bytes);
    expect(JSON.parse(json)).toEqual({ ...save, revision: 1 });
    expect(await request({ operation: 'export', slot: 3 })).toMatchObject({
      ok: false,
      code: 'invalid',
    });
  });
  it('round trips read/list/write/remove without bypassing stored revisions', async () => {
    const { request, save } = setup();
    expect(
      await request({ operation: 'write', value: save, expectedRevision: null }),
    ).toMatchObject({ ok: true, value: { revision: 1 } });
    expect(await request({ operation: 'read', slot: 1 })).toMatchObject({
      ok: true,
      value: { name: save.name, revision: 1 },
    });
    const list = await request({ operation: 'list' });
    expect(list.ok && list.value).toMatchObject([
      { slot: 1, status: 'ready', name: save.name, revision: 1 },
      { slot: 2, status: 'empty' },
      { slot: 3, status: 'empty' },
    ]);
    expect(
      await request({ operation: 'write', value: { ...save, name: 'Stale' }, expectedRevision: 0 }),
    ).toMatchObject({ ok: false, code: 'conflict' });
    expect(await request({ operation: 'remove', slot: 1, expectedRevision: 0 })).toMatchObject({
      ok: false,
      code: 'conflict',
    });
    expect(await request({ operation: 'remove', slot: 1, expectedRevision: 1 })).toMatchObject({
      ok: true,
    });
    expect(await request({ operation: 'read', slot: 1 })).toMatchObject({
      ok: true,
      value: undefined,
    });
  });

  it('rejects missing, expired and foreign leases inside the atomic write path', async () => {
    const { database, request, save } = setup();
    const operation = { operation: 'write' as const, value: save, expectedRevision: null };
    expect(await request(operation, 'tab-a')).toMatchObject({ ok: false, code: 'locked' });
    await database.leases.put({ slot: 1, owner: 'tab-b', expires: Date.now() + 10000 });
    expect(await request(operation, 'tab-a')).toMatchObject({ ok: false, code: 'locked' });
    await database.leases.put({ slot: 1, owner: 'tab-a', expires: Date.now() - 1 });
    expect(await request(operation, 'tab-a')).toMatchObject({ ok: false, code: 'locked' });
    await database.leases.put({ slot: 1, owner: 'tab-a', expires: Date.now() + 10000 });
    expect(await request(operation, 'tab-a')).toMatchObject({ ok: true, value: { revision: 1 } });
  });

  it('keeps each tab’s slot leases, so the main thread never opens IndexedDB', async () => {
    const { request, save } = setup();
    const acquire = (owner: string | undefined, native = false) =>
      request({ operation: 'lease-acquire', slot: 1, native }, owner);
    expect(await acquire(undefined)).toMatchObject({ ok: false, code: 'locked' });
    expect(await acquire('tab-a')).toMatchObject({ ok: true, value: { acquired: true } });
    // Another tab cannot take a live lease, unless it holds the slot's native Web Lock and the
    // lease was taken under one (the earlier holder's page is gone).
    expect(await acquire('tab-b')).toMatchObject({ ok: true, value: { acquired: false } });
    const write = { operation: 'write' as const, value: save, expectedRevision: null };
    expect(await request(write, 'tab-b')).toMatchObject({ ok: false, code: 'locked' });
    expect(await request(write, 'tab-a')).toMatchObject({ ok: true, value: { revision: 1 } });
    expect(await request({ operation: 'lease-release', slot: 1 }, 'tab-a')).toMatchObject({
      ok: true,
      value: undefined,
    });
    expect(await acquire('tab-b', true)).toMatchObject({ ok: true, value: { acquired: true } });
    expect(await acquire('tab-a', true)).toMatchObject({ ok: true, value: { acquired: true } });
    expect(
      await request({ operation: 'lease-acquire', slot: 4 as 1, native: false }, 'tab-a'),
    ).toMatchObject({ ok: false, code: 'invalid' });
  });

  it('validates untrusted imports fully and preserves existing data on rejection', async () => {
    const { request, save } = setup();
    await request({ operation: 'write', value: save, expectedRevision: null });
    expect(
      await request({ operation: 'import', file: file('{broken'), slot: 1, expectedRevision: 1 }),
    ).toMatchObject({ ok: false, code: 'invalid' });
    const invalid = {
      ...save,
      payload: { ...save.payload, settings: { ...DEFAULT_SETTINGS, fontScale: 99 } },
    };
    expect(
      await request({
        operation: 'import',
        file: file(JSON.stringify(invalid)),
        slot: 1,
        expectedRevision: 1,
      }),
    ).toMatchObject({ ok: false, code: 'invalid' });
    expect(
      await request({
        operation: 'import',
        file: file(JSON.stringify({ ...save, schemaVersion: 99 })),
        slot: 1,
        expectedRevision: 1,
      }),
    ).toMatchObject({ ok: false, code: 'future' });
    expect(await request({ operation: 'read', slot: 1 })).toMatchObject({
      ok: true,
      value: { name: save.name, revision: 1 },
    });
    expect(
      await request({
        operation: 'import',
        file: file(JSON.stringify(save)),
        slot: 2,
        expectedRevision: null,
      }),
    ).toMatchObject({ ok: true, value: { slot: 2, revision: 1 } });
  });
});
