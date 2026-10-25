import type { SlotId } from '../model/domain';
import type { MatchSession } from '../engine/match/types';
import { CONFIG } from '../engine/config';
import { SaveError } from './errors';
import { browserEstimate, freeBytes, type Estimator, type StorageEstimate } from './storage';
import type { StoredMatchSession } from './matchRecord';
import type { SaveDatabase, SaveMeta } from './localRepository';

/**
 * Rotating backups inside IndexedDB (release 1.0 step 4.3). Each slot keeps up to three
 * generations of its stored records (the slot record, the world's bytes and the match session),
 * copied by the persistence worker after the save itself has committed, so a backup never
 * delays or fails a save:
 *
 * - `season`: after the first whole write of a new season (or of another world), the world as
 *   it was written;
 * - `day`: after the first load of a calendar day that passed every check, so it is a state
 *   known to load;
 * - `salvage`: the records a salvage load had to set a part aside from (step 4.4), kept until
 *   the next salvage of the slot, so the original is never lost.
 *
 * The world's bytes are kept gzip-compressed where the browser has `CompressionStream` (a late
 * world: 65 MB of JSON, about 8 MB). Before a backup the worker checks
 * `navigator.storage.estimate()`, and skips it, recording why, unless enough stays free for the
 * saves themselves (`CONFIG.saves.backups`). Metadata (`backups`) and data (`backupData`) are
 * separate tables, so listing backups never reads a world.
 */
export type BackupKind = 'season' | 'day' | 'salvage';
export const BACKUP_KINDS: readonly BackupKind[] = ['season', 'day', 'salvage'];
export interface BackupInfo {
  /** `<slot>:<kind>`: one generation of each kind per slot. */
  id: string;
  slot: SlotId;
  kind: BackupKind;
  /** When the backup was taken (device time). */
  takenAt: string;
  /** The save's name and revision when it was taken. */
  name: string;
  revision: number;
  worldId: string | null;
  season: number | null;
  week: number | null;
  /** The world's JSON in bytes, and what the backup takes in storage. */
  bytes: number;
  stored: number;
}
/** The latest backup a slot skipped, and why: too little storage, or the copy failed. */
export interface BackupSkip {
  id: string;
  slot: SlotId;
  kind: 'skipped';
  at: string;
  wanted: BackupKind;
  reason: 'space' | 'failed';
}
export type BackupEntry = BackupInfo | BackupSkip;
export interface BackupData {
  id: string;
  meta: SaveMeta;
  /** The world's UTF-8 JSON, gzip when `compressed`; null for a gallery. */
  world: Uint8Array | null;
  compressed: boolean;
  match: StoredMatchSession | MatchSession | null;
}
/** What the Saves screen shows: every slot's backups and skips, and the storage estimate. */
export interface BackupListing {
  backups: BackupInfo[];
  skipped: BackupSkip[];
  storage: StorageEstimate | null;
}
/** A slot's stored records at a moment: what a backup copies. */
export interface SlotSnapshot {
  meta: SaveMeta;
  bytes: Uint8Array | null;
  match: StoredMatchSession | MatchSession | null;
}

export const backupId = (slot: SlotId, kind: BackupKind | 'skipped'): string => `${slot}:${kind}`;
/** Every backup record id a slot can have, for deleting them with the slot. */
export const slotBackupIds = (slot: SlotId): string[] => [
  ...BACKUP_KINDS.map((kind) => backupId(slot, kind)),
  backupId(slot, 'skipped'),
];
const isInfo = (entry: BackupEntry | undefined): entry is BackupInfo =>
  entry !== undefined && entry.kind !== 'skipped';
/** The device's calendar day of a time, for one `day` backup a day. */
const localDay = (time: Date) => `${time.getFullYear()}-${time.getMonth() + 1}-${time.getDate()}`;

/** Whether a generation should be replaced by this snapshot. */
export function backupDue(
  kind: BackupKind,
  snapshot: SlotSnapshot,
  existing: BackupInfo | undefined,
  now: Date,
): boolean {
  const summary = snapshot.meta.world;
  const worldId = summary?.worldId ?? null;
  if (!existing || existing.worldId !== worldId) return true;
  if (kind === 'season')
    return summary !== null && existing.season !== null && summary.season > existing.season;
  if (kind === 'day') return localDay(new Date(existing.takenAt)) !== localDay(now);
  return existing.revision !== snapshot.meta.revision;
}

/** Gzip bytes where the browser can; otherwise they are kept as they are. */
async function pack(bytes: Uint8Array): Promise<{ data: Uint8Array; compressed: boolean }> {
  if (typeof CompressionStream !== 'function') return { data: bytes, compressed: false };
  const stream = new Blob([bytes as Uint8Array<ArrayBuffer>])
    .stream()
    .pipeThrough(new CompressionStream('gzip'));
  return { data: new Uint8Array(await new Response(stream).arrayBuffer()), compressed: true };
}
/** A backup's world bytes as stored by a save. */
export async function unpackWorld(data: BackupData): Promise<Uint8Array | null> {
  if (!data.world) return null;
  if (!data.compressed) return data.world;
  if (typeof DecompressionStream !== 'function') throw new SaveError('invalid');
  try {
    const stream = new Blob([data.world as Uint8Array<ArrayBuffer>])
      .stream()
      .pipeThrough(new DecompressionStream('gzip'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    throw new SaveError('invalid');
  }
}

export class SlotBackups {
  constructor(
    private readonly db: SaveDatabase,
    private readonly estimate: Estimator = browserEstimate,
    private readonly now: () => Date = () => new Date(),
  ) {}
  /**
   * Copy a slot's records into the `kind` generation when it is due. Never throws: a failure
   * is recorded as a skip. Returns what happened, for tests.
   */
  async take(
    snapshot: SlotSnapshot,
    kind: BackupKind,
  ): Promise<'taken' | 'not-due' | 'space' | 'failed'> {
    const slot = snapshot.meta.slot;
    try {
      const existing = await this.db.backups.get(backupId(slot, kind));
      const now = this.now();
      if (!backupDue(kind, snapshot, isInfo(existing) ? existing : undefined, now))
        return 'not-due';
      // A world held as an object (a slot last written before 1.0) is copied once it is bytes.
      if (snapshot.meta.kind === 'world' && !snapshot.bytes) return 'not-due';
      const size = snapshot.bytes?.length ?? 0;
      const reserve = Math.max(
        CONFIG.saves.backups.minFreeBytes,
        size * CONFIG.saves.backups.reserveWorlds,
      );
      // Checked before compressing (the worst case) and again with the real size.
      if (!(await this.room(size, reserve))) return this.skip(slot, kind, 'space');
      const packed = snapshot.bytes ? await pack(snapshot.bytes) : null;
      const stored = packed?.data.length ?? 0;
      if (!(await this.room(stored, reserve))) return this.skip(slot, kind, 'space');
      const summary = snapshot.meta.world;
      const id = backupId(slot, kind);
      const info: BackupInfo = {
        id,
        slot,
        kind,
        takenAt: now.toISOString(),
        name: snapshot.meta.name,
        revision: snapshot.meta.revision,
        worldId: summary?.worldId ?? null,
        season: summary?.season ?? null,
        week: summary?.week ?? null,
        bytes: size,
        stored,
      };
      const data: BackupData = {
        id,
        meta: snapshot.meta,
        world: packed?.data ?? null,
        compressed: packed?.compressed ?? false,
        match: snapshot.match,
      };
      await this.db.transaction('rw', this.db.backups, this.db.backupData, async () => {
        await this.db.backupData.put(data);
        await this.db.backups.put(info);
        await this.db.backups.delete(backupId(slot, 'skipped'));
      });
      // The slot was deleted while this copy was made: its backups go with it.
      if (!(await this.db.saves.get(slot))) await this.removeSlot(slot);
      return 'taken';
    } catch {
      return this.skip(slot, kind, 'failed');
    }
  }
  /** Whether `bytes` more leave `reserve` free (true when the browser gives no estimate). */
  private async room(bytes: number, reserve: number): Promise<boolean> {
    const free = await freeBytes(this.estimate);
    return free === null || free - bytes >= reserve;
  }
  private async skip(
    slot: SlotId,
    wanted: BackupKind,
    reason: BackupSkip['reason'],
  ): Promise<'space' | 'failed'> {
    try {
      const entry: BackupSkip = {
        id: backupId(slot, 'skipped'),
        slot,
        kind: 'skipped',
        at: this.now().toISOString(),
        wanted,
        reason,
      };
      await this.db.backups.put(entry);
    } catch {
      // Recording the skip is a courtesy; nothing depends on it.
    }
    return reason;
  }
  async list(): Promise<BackupListing> {
    const entries = await this.db.backups.toArray();
    return {
      backups: entries.filter(isInfo).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
      skipped: entries.filter((entry): entry is BackupSkip => entry.kind === 'skipped'),
      storage: await this.estimate(),
    };
  }
  /** One generation with its data, or `invalid` when it is gone. */
  async read(slot: SlotId, kind: BackupKind): Promise<{ info: BackupInfo; data: BackupData }> {
    const id = backupId(slot, kind);
    const [info, data] = await this.db.transaction('r', this.db.backups, this.db.backupData, () =>
      Promise.all([this.db.backups.get(id), this.db.backupData.get(id)]),
    );
    if (!isInfo(info) || !data) throw new SaveError('invalid');
    return { info, data };
  }
  async removeSlot(slot: SlotId): Promise<void> {
    const ids = slotBackupIds(slot);
    await this.db.transaction('rw', this.db.backups, this.db.backupData, async () => {
      await this.db.backups.bulkDelete(ids);
      await this.db.backupData.bulkDelete(ids);
    });
  }
  /**
   * Make room for a save (step 4.6): delete backups, oldest first, until `bytes` fit with the
   * quota margin, so backups never stand between the player and a save. Returns whether any
   * were deleted.
   */
  async release(bytes: number): Promise<boolean> {
    const entries = (await this.db.backups.toArray())
      .filter(isInfo)
      .sort((a, b) => Date.parse(a.takenAt) - Date.parse(b.takenAt));
    let released = false;
    for (const entry of entries) {
      const free = await freeBytes(this.estimate);
      if (free === null || free >= bytes + CONFIG.saves.quotaMarginBytes) break;
      await this.db.transaction('rw', this.db.backups, this.db.backupData, async () => {
        await this.db.backups.delete(entry.id);
        await this.db.backupData.delete(entry.id);
      });
      released = true;
    }
    return released;
  }
}

/**
 * Runs backups one at a time after the saves that made them due, off the save queue: a save's
 * reply never waits for its backup, and a backup already waiting for the same slot and kind is
 * not queued twice. `done` runs after each one taken (the worker announces it to the tabs).
 */
export class BackupScheduler {
  private chain: Promise<void> = Promise.resolve();
  private readonly waiting = new Set<string>();
  constructor(
    readonly backups: SlotBackups,
    private readonly done: () => void = () => {},
  ) {}
  schedule(snapshot: SlotSnapshot, kind: BackupKind): void {
    const id = backupId(snapshot.meta.slot, kind);
    if (this.waiting.has(id)) return;
    this.waiting.add(id);
    this.chain = this.chain
      .then(async () => {
        this.waiting.delete(id);
        if ((await this.backups.take(snapshot, kind)) !== 'not-due') this.done();
      })
      .catch(() => {
        this.waiting.delete(id);
      });
  }
  /** Resolves when every scheduled backup has finished (tests, and before a restore). */
  idle(): Promise<void> {
    return this.chain;
  }
}
