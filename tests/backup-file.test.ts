/**
 * Backup files (release 1.0 step 3.7): gzip export with a plain fallback, import of both told
 * apart by their bytes, and the limits, including a decompression bomb.
 */
import { gzipSync } from 'node:zlib';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CONFIG } from '../src/engine/config';
import {
  isGzip,
  packBackup,
  unpackBackup,
  withinUtf8Bytes,
  type BackupFile,
} from '../src/persistence/backup';
import { backupFileName, backupType, recoveryFileName } from '../src/persistence/files';
import { SaveDatabase } from '../src/persistence/repository';
import { createSave, DEFAULT_SETTINGS, parseSave } from '../src/persistence/schema';
import type { PersistenceOperation } from '../src/persistence/protocol';
import { executePersistenceRequest } from '../src/workers/persistence.worker';

const MiB = 2 ** 20;
const limits = CONFIG.saves as { maxFileBytes: number };
const save = createSave(1, 'Ström collection ⚽', {
  kind: 'foundation',
  gallery: { seed: 'backup-ü-😀', generation: 0 },
  settings: DEFAULT_SETTINGS,
});
const json = JSON.stringify(save);
const code = (promise: Promise<unknown>) =>
  promise.then(
    () => 'resolved',
    (error: { code?: string }) => error.code ?? String(error),
  );

const databases: SaveDatabase[] = [];
afterEach(async () => {
  vi.unstubAllGlobals();
  for (const database of databases.splice(0)) await database.delete();
});
function worker() {
  const database = new SaveDatabase(`backup-file-${Date.now()}-${databases.length}`);
  databases.push(database);
  let sequence = 0;
  return (operation: PersistenceOperation) =>
    executePersistenceRequest(
      { ...operation, database: database.name, requestId: `backup-${++sequence}` },
      () => database,
    );
}

describe('backup files', () => {
  it('exports gzip that imports back to the same JSON, measured in UTF-8 bytes', async () => {
    const backup = await packBackup(save.name, json);
    expect(backup).toMatchObject({ name: save.name, compressed: true, nearLimit: false });
    expect(backup.file.type).toBe('application/gzip');
    expect(backup.bytes).toBe(Buffer.byteLength(json, 'utf8'));
    expect(await isGzip(backup.file)).toBe(true);
    const unpacked = await unpackBackup(backup.file);
    expect(unpacked.json === json).toBe(true);
    expect(unpacked.bytes).toBe(backup.bytes);
  });

  it('falls back to plain JSON where the browser cannot compress', async () => {
    const backup = await packBackup(save.name, json, false);
    expect(backup).toMatchObject({ compressed: false, bytes: Buffer.byteLength(json, 'utf8') });
    expect(backup.file.type).toBe('application/json');
    expect(await backup.file.text()).toBe(json);
    expect((await unpackBackup(backup.file)).json).toBe(json);
  });

  it('tells plain from gzip by the magic bytes, never the file name', async () => {
    const gzip = new File([gzipSync(json)], 'renamed.json');
    const plain = new File([json], 'renamed.json.gz');
    expect((await unpackBackup(gzip)).json).toBe(json);
    expect((await unpackBackup(plain)).json).toBe(json);
    expect(await isGzip(new Blob([]))).toBe(false);
    expect(await isGzip(new Blob(['{']))).toBe(false);
  });

  it('refuses damaged gzip as invalid', async () => {
    const whole = gzipSync(json);
    await expect(code(unpackBackup(new Blob([whole.subarray(0, whole.length - 9)])))).resolves.toBe(
      'invalid',
    );
    const garbled = Uint8Array.from(whole);
    garbled.fill(0xff, 10, 40);
    await expect(code(unpackBackup(new Blob([garbled])))).resolves.toBe('invalid');
  });

  it('refuses a decompression bomb as too large while reading it', async () => {
    // 129 MiB of spaces is about 130 KB as gzip.
    const bomb = gzipSync(Buffer.alloc(CONFIG.saves.maxFileBytes + MiB, 0x20), { level: 1 });
    expect(bomb.length).toBeLessThan(MiB);
    await expect(code(unpackBackup(new Blob([bomb])))).resolves.toBe('large');
  }, 60_000);

  it('refuses a gzip file over its own limit before reading it', async () => {
    const big = new Uint8Array(CONFIG.saves.maxCompressedFileBytes + 1);
    big.set([0x1f, 0x8b]);
    await expect(code(unpackBackup(new Blob([big])))).resolves.toBe('large');
  });

  it('refuses plain JSON over the limit, and exports that an import would refuse', async () => {
    const over = 'x'.repeat(CONFIG.saves.maxFileBytes + 1);
    await expect(code(unpackBackup(new Blob([over])))).resolves.toBe('large');
    await expect(code(packBackup('Huge', over))).resolves.toBe('large');
    await expect(code(packBackup('Huge', over, false))).resolves.toBe('large');
    expect(() => parseSave(over)).toThrow(expect.objectContaining({ code: 'large' }));
    expect(() => parseSave(json, CONFIG.saves.maxFileBytes + 1)).toThrow(
      expect.objectContaining({ code: 'large' }),
    );
  }, 60_000);

  it('warns, without refusing, when an export nears the limit', async () => {
    const near = 'x'.repeat(CONFIG.saves.warnExportBytes + 1);
    expect(await packBackup('Near', near, false)).toMatchObject({
      compressed: false,
      nearLimit: true,
      bytes: near.length,
    });
    expect(await packBackup('Fine', 'x'.repeat(CONFIG.saves.warnExportBytes), false)).toMatchObject(
      { nearLimit: false },
    );
  }, 60_000);

  it('counts UTF-8 bytes without encoding, as the encoder would', () => {
    const samples = [
      '',
      'plain ascii',
      'Ströms “quoted” – dash',
      '⚽ and 😀 and 𝄞',
      'lone \ud800 high and \udc00 low',
      'ends high \ud83d',
    ];
    for (const text of samples) {
      const bytes = Buffer.byteLength(text, 'utf8');
      expect(withinUtf8Bytes(text, bytes), text).toBe(true);
      if (bytes > 0) expect(withinUtf8Bytes(text, bytes - 1), text).toBe(false);
    }
    // Past the cheap bounds, it counts.
    const mixed = 'é'.repeat(60) + 'a'.repeat(30);
    expect(withinUtf8Bytes(mixed, 150)).toBe(true);
    expect(withinUtf8Bytes(mixed, 149)).toBe(false);
  });

  it('names backups by date and kind, typed for saving and sharing', () => {
    const now = new Date('2026-10-25T12:00:00Z');
    expect(backupFileName('slot-1', true, now)).toBe('pitch-to-glory-slot-1-2026-10-25.json.gz');
    expect(backupFileName('unsaved', false, now)).toBe('pitch-to-glory-unsaved-2026-10-25.json');
    expect(recoveryFileName('slot-2', true, now)).toBe(
      'pitch-to-glory-slot-2-recovery-2026-10-25.json.gz',
    );
    expect(backupType(true)).toBe('application/gzip');
    expect(backupType(false)).toBe('application/json');
  });
});

describe('backup files in the persistence worker', () => {
  const exported = async (request: ReturnType<typeof worker>): Promise<BackupFile> => {
    const response = await request({ operation: 'export', slot: 1 });
    if (!response.ok || !response.value || !('file' in response.value))
      throw new Error('Expected a backup file');
    return response.value;
  };

  it('imports an older plain backup and a gzip export alike', async () => {
    const request = worker();
    expect(
      await request({
        operation: 'import',
        file: new Blob([json]),
        slot: 1,
        expectedRevision: null,
      }),
    ).toMatchObject({ ok: true, value: { slot: 1, name: save.name } });
    const backup = await exported(request);
    expect(backup.compressed).toBe(true);
    expect(await request({ operation: 'validate', file: backup.file })).toMatchObject({ ok: true });
    expect(
      await request({ operation: 'import', file: backup.file, slot: 2, expectedRevision: null }),
    ).toMatchObject({ ok: true, value: { slot: 2, name: save.name } });
  });

  it('writes and reads plain JSON where compression streams are missing', async () => {
    const request = worker();
    await request({ operation: 'import', file: new Blob([json]), slot: 1, expectedRevision: null });
    const gzip = await exported(request);
    vi.stubGlobal('CompressionStream', undefined);
    vi.stubGlobal('DecompressionStream', undefined);
    const plain = await exported(request);
    expect(plain.compressed).toBe(false);
    expect(await isGzip(plain.file)).toBe(false);
    expect(
      await request({ operation: 'import', file: plain.file, slot: 2, expectedRevision: null }),
    ).toMatchObject({ ok: true });
    // A gzip file cannot be read without them: refused, nothing stored.
    expect(
      await request({ operation: 'import', file: gzip.file, slot: 3, expectedRevision: null }),
    ).toMatchObject({ ok: false, code: 'invalid' });
    expect(await request({ operation: 'read', slot: 3 })).toMatchObject({ value: undefined });
  });

  it('refuses an export that could not be imported again, and imports nothing too large', async () => {
    const request = worker();
    await request({ operation: 'import', file: new Blob([json]), slot: 1, expectedRevision: null });
    const backup = await exported(request);
    const limit = limits.maxFileBytes;
    try {
      limits.maxFileBytes = backup.bytes - 1;
      expect(await request({ operation: 'export', slot: 1 })).toMatchObject({
        ok: false,
        code: 'large',
      });
      expect(await request({ operation: 'export-recovery', slot: 1 })).toMatchObject({
        ok: false,
        code: 'large',
      });
      expect(await request({ operation: 'validate', file: backup.file })).toMatchObject({
        ok: false,
        code: 'large',
      });
      expect(
        await request({
          operation: 'import',
          file: new Blob([json]),
          slot: 2,
          expectedRevision: null,
        }),
      ).toMatchObject({ ok: false, code: 'large' });
    } finally {
      limits.maxFileBytes = limit;
    }
  });
});
