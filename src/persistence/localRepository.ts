import Dexie, { type Table } from 'dexie';
import type {
  GalleryState,
  Settings,
  SlotId,
  World,
  FoundationState,
  WorldState,
} from '../model/domain';
import type { MatchSession } from '../engine/match/types';
import { CONFIG, ENGINE_VERSION } from '../engine/config';
import { applyMatchCommand, createMatchSession } from '../engine/match';
import {
  migrateSave,
  notBefore,
  parseSave,
  SaveError,
  validateFoundation,
  validateSlot,
  type AppSave,
  type SaveRecovery,
} from './schema';
import { summarizeWorld, validSummary, type WorldSummary } from './summary';
import { compactSession, storedSession, type StoredMatchSession } from './matchRecord';
import { SAVE_DATABASE } from './database';
import { applyWorldPatches, patchSize, validPatches, type WorldPatch } from '../workers/worldPatch';
import { decodeWorldBytes, encodeWorld } from '../workers/worldCodec';
import { assertSpaceFor, browserEstimate, type Estimator } from './storage';
import {
  SlotBackups,
  slotBackupIds,
  unpackWorld,
  type BackupData,
  type BackupEntry,
  type BackupKind,
  type BackupListing,
  type BackupScheduler,
  type SlotSnapshot,
} from './backups';
import { dropPart, SALVAGE_PARTS, salvageNotice, type SalvagePart } from './salvage';
export type { WorldSummary } from './summary';
export interface Lease {
  slot: SlotId;
  owner: string;
  expires: number;
  mode?: 'native' | 'lease';
}
/**
 * Small per-slot envelope. The world graph and the match session live in their own
 * tables, so match checkpoints, preference changes and the slot list never read or
 * rewrite a 40–100 MB world.
 */
export interface SaveMeta {
  layout: 2;
  format: 'pitch-to-glory';
  schemaVersion: number;
  engineVersion: string;
  slot: SlotId;
  name: string;
  createdAt: string;
  updatedAt: string;
  revision: number;
  kind: 'foundation' | 'world';
  gallery: GalleryState;
  settings: Settings;
  world: WorldSummary | null;
  /**
   * Changes made in the UI since the world was last written whole (step 3.4): applied in order
   * to the stored world when the slot is read, cleared by the next whole write.
   */
  worldPatches?: WorldPatch[];
  /** Their size in characters of JSON, kept under `CONFIG.saves.maxPatchBytes`. */
  worldPatchBytes?: number;
}
/**
 * A slot's world: UTF-8 JSON `bytes` (written by 1.0, from the world worker's encoding), or a
 * structured `world` object (written before 1.0; still read).
 */
export interface WorldRecord {
  slot: SlotId;
  world?: World;
  bytes?: Uint8Array;
}
/** A slot's match in progress: setup and commands (1.0), or a whole session (before 1.0). */
export interface MatchRecord {
  slot: SlotId;
  session: StoredMatchSession | MatchSession;
}
/** What a read learnt about the slot's storage, for the tab's next write (never persisted). */
export interface StoredState {
  /**
   * Whether the loaded world is exactly the stored one (no migration changed it), so later
   * changes can be stored as patches against it.
   */
  pristine: boolean;
  /** The number and size of the slot's stored patches. */
  patches: number;
  patchBytes: number;
  /**
   * What a salvage load set aside (step 4.4). The stored records are left as they were; the
   * next whole write replaces them, and a `salvage` backup keeps them meanwhile.
   */
  salvaged?: SalvagePart[];
}
export type LoadedSave = AppSave & { stored?: StoredState };
/** A whole world write from its bytes (the world worker's encoding), never parsed here. */
export interface EncodedWorldSave {
  slot: SlotId;
  name: string;
  createdAt: string;
  updatedAt: string;
  gallery: GalleryState;
  settings: Settings;
  worldId: string;
  summary: WorldSummary;
  bytes: Uint8Array;
  matchSession: StoredMatchSession | null;
  /**
   * Whether this world may replace a different one in the slot (saving to a slot). A
   * checkpoint never does.
   */
  replace: boolean;
}
/** A write that keeps the stored world: preferences, the match session and world patches. */
export interface SaveWithoutWorld {
  slot: SlotId;
  worldId: string;
  updatedAt: string;
  gallery: GalleryState;
  settings: Settings;
  matchSession: StoredMatchSession | MatchSession | null;
  /** UI changes to the stored world, appended to the slot's patches. */
  worldPatches?: WorldPatch[];
  /** The world's summary after the patches, for the save card. */
  summary?: WorldSummary;
}
export type SlotListing =
  | { slot: SlotId; status: 'empty' }
  | {
      slot: SlotId;
      status: 'ready';
      name: string;
      createdAt: string;
      updatedAt: string;
      revision: number;
      kind: 'foundation' | 'world';
      gallerySeed: string;
      world: WorldSummary | null;
    }
  | {
      slot: SlotId;
      status: 'error';
      code: 'future' | 'invalid';
      name: string | null;
      revision: number | null;
    };
/** Receipt of a write that did not touch the world graph. */
export type SaveWriteReceipt = Omit<AppSave, 'payload'> & {
  payload: FoundationState | Omit<WorldState, 'world'>;
};
type StoredSave = SaveMeta | (Record<string, unknown> & { slot: SlotId });

const SLOTS = [1, 2, 3] as const;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const isSplit = (record: StoredSave | undefined): record is SaveMeta =>
  isRecord(record) && record.layout === 2;
/** Revision of a stored record, or null when absent or unreadable. */
const revisionOf = (record: unknown): number | null =>
  isRecord(record) && Number.isSafeInteger(record.revision) ? (record.revision as number) : null;

function metaFor(save: AppSave): SaveMeta {
  const { payload } = save;
  return {
    layout: 2,
    format: 'pitch-to-glory',
    schemaVersion: save.schemaVersion,
    engineVersion: save.engineVersion,
    slot: save.slot,
    name: save.name,
    createdAt: save.createdAt,
    updatedAt: save.updatedAt,
    revision: save.revision,
    kind: payload.kind,
    gallery: payload.gallery,
    settings: payload.settings,
    world: payload.kind === 'world' ? summarizeWorld(payload.world) : null,
  };
}
/** Split a legacy single-record save without validating it. Malformed records stay untouched. */
function splitLegacyRecord(
  record: Record<string, unknown>,
): { meta: SaveMeta; world?: WorldRecord; match?: MatchRecord } | null {
  const payload = record.payload;
  if (!isRecord(payload) || !isRecord(payload.gallery) || !isRecord(payload.settings)) return null;
  const kind = payload.kind;
  if (kind !== 'foundation' && kind !== 'world') return null;
  const slot = record.slot as SlotId;
  const world =
    kind === 'world' && isRecord(payload.world) ? (payload.world as unknown as World) : null;
  if (kind === 'world' && !world) return null;
  let summary: WorldSummary | null = null;
  try {
    summary = world ? summarizeWorld(world) : null;
  } catch {
    return null;
  }
  const meta = {
    ...Object.fromEntries(Object.entries(record).filter(([key]) => key !== 'payload')),
    layout: 2,
    kind,
    gallery: payload.gallery,
    settings: payload.settings,
    world: summary,
  } as unknown as SaveMeta;
  return {
    meta,
    ...(world ? { world: { slot, world } } : {}),
    ...(isRecord(payload.matchSession)
      ? { match: { slot, session: payload.matchSession as unknown as MatchSession } }
      : {}),
  };
}
export class SaveDatabase extends Dexie {
  saves!: Table<StoredSave, SlotId>;
  worlds!: Table<WorldRecord, SlotId>;
  matches!: Table<MatchRecord, SlotId>;
  leases!: Table<Lease, SlotId>;
  /** Rotating backups (step 4.3): what each generation is, and its records, apart. */
  backups!: Table<BackupEntry, string>;
  backupData!: Table<BackupData, string>;
  constructor(name = SAVE_DATABASE) {
    super(name);
    // Versions 1–5 stored one full record per slot. Their records are migrated lazily by
    // migrateSave on read; database upgrades never validate, so one damaged slot can
    // never abort an upgrade and lock the player out of the other slots.
    this.version(1).stores({ saves: 'slot,updatedAt', leases: 'slot' });
    this.version(2).stores({ saves: 'slot,updatedAt,revision', leases: 'slot,expires' });
    this.version(3).stores({ saves: 'slot,updatedAt,revision', leases: 'slot,expires' });
    this.version(4).stores({ saves: 'slot,updatedAt,revision', leases: 'slot,expires' });
    this.version(5).stores({ saves: 'slot,updatedAt,revision', leases: 'slot,expires' });
    this.version(6)
      .stores({
        saves: 'slot,updatedAt,revision',
        worlds: 'slot',
        matches: 'slot',
        leases: 'slot,expires',
      })
      .upgrade(async (tx) => {
        const records = (await tx.table('saves').toArray()) as StoredSave[];
        for (const record of records) {
          if (isSplit(record) || !isRecord(record)) continue;
          const split = splitLegacyRecord(record);
          if (!split) continue;
          await tx.table('saves').put(split.meta);
          if (split.world) await tx.table('worlds').put(split.world);
          if (split.match) await tx.table('matches').put(split.match);
        }
      });
    // v7 (release 1.0 step 4.3) adds the rotating backups; nothing stored before changes.
    this.version(7).stores({ backups: 'id,slot', backupData: 'id' });
    this.on('versionchange', () => this.close());
  }
}
/**
 * A stored match session as a whole session. One stored as setup and commands (1.0) is replayed;
 * one stored whole (before 1.0) is returned as it is. Either way the caller then validates it by
 * replay (`matchSessionFor`), which discards one that does not replay and keeps the world.
 */
function restoreSession(value: unknown): unknown {
  if (!isRecord(value) || 'state' in value) return value;
  try {
    const stored = value as unknown as StoredMatchSession;
    let session = createMatchSession(stored.setup, stored.initialTactics);
    for (const command of stored.commands) session = applyMatchCommand(session, command);
    // Saved by another engine: keep its name, so validation discards it as outdated.
    return { ...session, engine: stored.engine };
  } catch {
    // A session that does not replay is discarded by validation, with its notice.
    return value;
  }
}
/** The world a record holds, freshly decoded (so patches can be applied to it). */
function worldOf(record: WorldRecord | undefined): unknown {
  if (!record) return undefined;
  if (record.bytes) {
    try {
      return decodeWorldBytes(record.bytes);
    } catch {
      throw new SaveError('invalid');
    }
  }
  return record.world;
}
/** The world as bytes for storage: the same JSON an export holds. */
const worldBytes = (world: World): Uint8Array => encodeWorld(world).bytes;
const isBytes = (value: unknown): value is Uint8Array =>
  value instanceof Uint8Array ||
  (ArrayBuffer.isView(value) && Object.prototype.toString.call(value) === '[object Uint8Array]');

type SlotRecords = { meta?: StoredSave; world?: WorldRecord; match?: MatchRecord };
/** What a repository uses besides its database. */
export interface RepositoryOptions {
  /** The storage estimate for the preflight and backups (tests pass their own). */
  estimate?: Estimator;
  /** Takes rotating backups after writes and loads (the persistence worker); none without. */
  backups?: BackupScheduler;
}
const RESTORABLE: ReadonlySet<unknown> = new Set<BackupKind>(['season', 'day', 'salvage']);

export class LocalSaveRepository {
  // Without owner this is a low-level migration/test repository. App writes always supply owner.
  constructor(
    protected readonly db: SaveDatabase,
    private readonly owner?: string,
    private readonly options: RepositoryOptions = {},
  ) {}
  private get estimate(): Estimator {
    return this.options.estimate ?? browserEstimate;
  }
  private get backupStore(): SlotBackups {
    return this.options.backups?.backups ?? new SlotBackups(this.db, this.estimate);
  }
  /**
   * Storage preflight (step 4.6): `quota` when the estimate says `bytes` would not fit. Backups
   * give way first, oldest first, so they never cause a save to fail.
   */
  private async preflight(bytes: number): Promise<void> {
    try {
      await assertSpaceFor(bytes, this.estimate);
    } catch (error) {
      if (!(error instanceof SaveError) || !(await this.backupStore.release(bytes))) throw error;
      await assertSpaceFor(bytes, this.estimate);
    }
  }
  /**
   * Assemble, migrate and fully validate one slot, applying its stored patches. Stale match
   * sessions are discarded. When the patches no longer apply or validate, the slot loads
   * without them and says so (`changes-discarded`), rather than not loading at all.
   */
  async read(slot: SlotId): Promise<AppSave | undefined> {
    const loaded = await this.load(slot);
    if (!loaded) return undefined;
    const { stored: _stored, ...save } = loaded;
    void _stored;
    return save;
  }
  /** As `read`, with what the tab needs to know about the slot's storage (`StoredState`). */
  async load(slot: SlotId): Promise<LoadedSave | undefined> {
    validateSlot(slot);
    const records = await this.records(slot);
    if (!records.meta) return undefined;
    const loaded = await this.evaluate(records, () => this.records(slot));
    // A load that passed every check is a state known to load: the day's backup (step 4.3).
    // One that had to set parts aside keeps the records it read as they were, just in case.
    const backups = this.options.backups;
    if (backups && isSplit(records.meta) && (!loaded.recovery || loaded.stored?.salvaged)) {
      const snapshot = snapshotOf(records.meta, records);
      backups.schedule(snapshot, loaded.recovery ? 'salvage' : 'day');
    }
    return loaded;
  }
  /**
   * Assemble, migrate and validate a slot's records (as stored, or a backup's) in the order a
   * load tries them: with the stored patches; without them (`changes-discarded`); then the
   * salvage load (step 4.4, `salvage.ts`): without one optional part at a time and then all of
   * them, with the patches and lastly without. Core data is never dropped, and nothing stored
   * is changed. `fresh` reads the records again when the world is held as an object that an
   * earlier attempt may have changed (bytes decode afresh every time).
   */
  private async evaluate(
    records: SlotRecords,
    fresh: () => Promise<SlotRecords>,
  ): Promise<LoadedSave> {
    const meta = records.meta;
    if (!meta) throw new SaveError('invalid');
    if (!isSplit(meta)) return migrateSave(meta);
    const pristine = meta.schemaVersion === CONFIG.saves.schemaVersion;
    const patches = meta.worldPatches ?? [];
    let current = records;
    let used = false;
    /**
     * One attempt. `built`: the envelope was assembled (the patches applied), whatever the
     * checks then said; `dropped`: the parts it had and set aside. A newer save is refused.
     */
    const attempt = async (withPatches: boolean, parts: readonly SalvagePart[] = []) => {
      if (used && !isBytes(current.world?.bytes)) current = await fresh();
      used = true;
      if (!current.meta || !isSplit(current.meta)) throw new SaveError('invalid');
      let envelope: unknown;
      try {
        envelope = this.envelope(current.meta, current, withPatches ? patches : []);
      } catch {
        return { save: null, dropped: [] as SalvagePart[], built: false };
      }
      const dropped = parts.filter((part) => dropPart(envelope, part));
      // Nothing of these parts to set aside: the outcome cannot change.
      if (parts.length && !dropped.length) return { save: null, dropped, built: true };
      try {
        return { save: migrateSave(envelope), dropped, built: true };
      } catch (error) {
        if (error instanceof SaveError && error.code === 'future') throw error;
        return { save: null, dropped, built: true };
      }
    };
    const stored = (salvaged?: SalvagePart[]): StoredState => ({
      pristine: false,
      patches: 0,
      patchBytes: 0,
      ...(salvaged ? { salvaged } : {}),
    });
    const strict = await attempt(true);
    if (strict.save)
      return {
        ...strict.save,
        stored: {
          pristine,
          patches: patches.length,
          patchBytes: patches.length ? (meta.worldPatchBytes ?? patchSize(patches)) : 0,
        },
      };
    // The patched world failed: load the world as last written whole. Its stored patches stay
    // until the next whole write, which this load forces.
    if (patches.length) {
      const unpatched = await attempt(false);
      if (unpatched.save)
        return { ...unpatched.save, recovery: 'changes-discarded', stored: stored() };
    }
    // Salvage: each part the world has, alone, then all of them together; with the patches
    // when they applied, and lastly without them.
    const withPatches = patches.length > 0 && strict.built;
    // Parts set aside and the latest changes as well: the general notice.
    const notice = (parts: readonly SalvagePart[]): SaveRecovery =>
      patches.length && !withPatches ? 'salvaged' : salvageNotice(parts);
    const present: SalvagePart[] = [];
    for (const part of SALVAGE_PARTS) {
      const result = await attempt(withPatches, [part]);
      present.push(...result.dropped);
      if (result.save) return { ...result.save, recovery: notice([part]), stored: stored([part]) };
    }
    // Then two or more together, the fewest first, so nothing that passes is set aside.
    for (const parts of combinations(present)) {
      const result = await attempt(withPatches, parts);
      if (result.save) return { ...result.save, recovery: notice(parts), stored: stored(parts) };
    }
    if (withPatches && present.length) {
      const result = await attempt(false, present);
      if (result.save) return { ...result.save, recovery: 'salvaged', stored: stored(present) };
    }
    throw new SaveError('invalid');
  }
  private async records(slot: SlotId): Promise<SlotRecords> {
    const [meta, world, match] = await this.db.transaction(
      'r',
      this.db.saves,
      this.db.worlds,
      this.db.matches,
      () =>
        Promise.all([this.db.saves.get(slot), this.db.worlds.get(slot), this.db.matches.get(slot)]),
    );
    return { meta, world, match };
  }
  /** A split slot as one save envelope: world decoded, patches applied, session restored. */
  private envelope(meta: SaveMeta, records: SlotRecords, patches: readonly WorldPatch[]): unknown {
    const {
      layout: _layout,
      kind,
      gallery,
      settings,
      world: _summary,
      worldPatches: _patches,
      worldPatchBytes: _bytes,
      ...envelope
    } = meta;
    void [_layout, _summary, _patches, _bytes];
    let world: unknown;
    if (kind === 'world') {
      world = worldOf(records.world);
      if (patches.length) applyWorldPatches(world, patches);
    }
    return {
      ...envelope,
      payload: {
        kind,
        gallery,
        settings,
        ...(kind === 'world' ? { world } : {}),
        ...(kind === 'world' && records.match
          ? { matchSession: restoreSession(records.match.session) }
          : {}),
      },
    };
  }
  /**
   * One slot's stored records as a single save envelope, neither migrated nor validated: a
   * split slot is reassembled (its patches applied and its session replayed where they can be),
   * an un-split record from an interrupted upgrade is returned as is.
   */
  private assembled(records: SlotRecords): unknown {
    const meta = records.meta;
    if (!meta || !isSplit(meta)) return meta;
    const patches = meta.worldPatches ?? [];
    if (patches.length)
      try {
        return this.envelope(meta, records, patches);
      } catch {
        // Recovery keeps what it can: the world as last written whole.
      }
    try {
      return this.envelope(meta, records, []);
    } catch {
      const { layout: _layout, world: _summary, ...rest } = meta;
      void [_layout, _summary];
      return rest;
    }
  }
  /** Lightweight per-slot status. One damaged or newer slot never hides the others. */
  async list(): Promise<SlotListing[]> {
    const records = await this.db.saves.bulkGet([...SLOTS]);
    return Promise.all(
      SLOTS.map(async (slot, index): Promise<SlotListing> => {
        const record = records[index];
        if (!record) return { slot, status: 'empty' };
        try {
          if (isSplit(record)) {
            if (record.schemaVersion > CONFIG.saves.schemaVersion) throw new SaveError('future');
            const foundation = validateFoundation({
              kind: 'foundation',
              gallery: record.gallery,
              settings: record.settings,
            });
            if (
              typeof record.name !== 'string' ||
              revisionOf(record) === null ||
              !['foundation', 'world'].includes(record.kind) ||
              (record.kind === 'world') !== isRecord(record.world)
            )
              throw new SaveError('invalid');
            return {
              slot,
              status: 'ready',
              name: record.name,
              createdAt: record.createdAt,
              updatedAt: notBefore(record.updatedAt, record.createdAt),
              revision: record.revision,
              kind: record.kind,
              gallerySeed: foundation.gallery.seed,
              world: record.world,
            };
          }
          // An un-split record from an interrupted upgrade: validate it the old way.
          const save = migrateSave(record);
          return {
            slot,
            status: 'ready',
            name: save.name,
            createdAt: save.createdAt,
            updatedAt: save.updatedAt,
            revision: save.revision,
            kind: save.payload.kind,
            gallerySeed: save.payload.gallery.seed,
            world: save.payload.kind === 'world' ? summarizeWorld(save.payload.world) : null,
          };
        } catch (error) {
          return {
            slot,
            status: 'error',
            code: error instanceof SaveError && error.code === 'future' ? 'future' : 'invalid',
            name: isRecord(record) && typeof record.name === 'string' ? record.name : null,
            revision: revisionOf(record),
          };
        }
      }),
    );
  }
  private async assertOwnership(slot: SlotId): Promise<void> {
    if (!this.owner) return;
    const lease = await this.db.leases.get(slot);
    if (!lease || lease.owner !== this.owner || lease.expires <= Date.now())
      throw new SaveError('locked');
  }
  /**
   * Full write of a save object, fully validated: imports and Node tools. The app's own world
   * writes go through `writeWorld` instead, from the world worker's bytes.
   */
  async write(value: AppSave, expectedRevision: number | null): Promise<AppSave> {
    const save = migrateSave(value);
    if (save.recovery) throw new SaveError('invalid');
    return this.store(save, expectedRevision);
  }
  /** Store an already validated save, replacing the slot's world, session and patches. */
  private async store(save: AppSave, expectedRevision: number | null): Promise<AppSave> {
    // Encoded before the transaction: IndexedDB transactions close while a task runs long.
    const bytes = save.payload.kind === 'world' ? worldBytes(save.payload.world) : null;
    if (bytes) await this.preflight(bytes.length);
    let snapshot = null as SlotSnapshot | null;
    const result = await this.db.transaction(
      'rw',
      [this.db.saves, this.db.worlds, this.db.matches, this.db.leases],
      async () => {
        await this.assertOwnership(save.slot);
        const previous = await this.db.saves.get(save.slot);
        // An empty slot and an unreadable record both have revision null.
        if (revisionOf(previous) !== expectedRevision) throw new SaveError('conflict');
        const stored: AppSave = {
          ...save,
          engineVersion: ENGINE_VERSION,
          revision: (revisionOf(previous) ?? 0) + 1,
        };
        const meta = metaFor(stored);
        const session =
          stored.payload.kind === 'world' && stored.payload.matchSession
            ? compactSession(stored.payload.matchSession)
            : null;
        await this.db.saves.put(meta);
        if (stored.payload.kind === 'world') {
          await this.db.worlds.put({ slot: stored.slot, bytes: bytes! });
          if (session) await this.db.matches.put({ slot: stored.slot, session });
          else await this.db.matches.delete(stored.slot);
        } else {
          await this.db.worlds.delete(stored.slot);
          await this.db.matches.delete(stored.slot);
        }
        snapshot = { meta, bytes, match: session };
        return stored;
      },
    );
    // Committed: the season's backup follows, off the save queue, when due (step 4.3).
    if (snapshot) this.options.backups?.schedule(snapshot, 'season');
    return result;
  }
  /**
   * The app's own whole-world write (steps 3.1 and 3.3): the world arrives as the world worker
   * encoded it and is stored as those bytes, without parsing or validating it. The engine made
   * the world, and validation still runs on every load and import (and in the tests), so a
   * world that would not load is caught there, with recovery export and the previous backups to
   * fall back on. What is checked here is cheap: the slot, preferences, the bytes' bounds, the
   * summary and session shapes, and, inside the transaction, ownership, the expected revision
   * and that a checkpoint never replaces another world.
   */
  async writeWorld(
    value: EncodedWorldSave,
    expectedRevision: number | null,
  ): Promise<SaveWriteReceipt> {
    validateSlot(value.slot);
    const foundation = validateFoundation({
      kind: 'foundation',
      gallery: value.gallery,
      settings: value.settings,
    });
    const bytes = value.bytes;
    if (
      typeof value.name !== 'string' ||
      !value.name.trim() ||
      value.name.length > 60 ||
      typeof value.worldId !== 'string' ||
      !value.worldId ||
      !isBytes(bytes) ||
      bytes.length < 2 ||
      bytes[0] !== 0x7b ||
      bytes[bytes.length - 1] !== 0x7d ||
      !validSummary(value.summary, value.worldId) ||
      !Number.isFinite(Date.parse(value.createdAt)) ||
      !Number.isFinite(Date.parse(value.updatedAt))
    )
      throw new SaveError('invalid');
    if (bytes.length > CONFIG.saves.maxFileBytes) throw new SaveError('large');
    const session = value.matchSession ? storedSession(value.matchSession) : null;
    await this.preflight(bytes.length);
    let written = null as SaveMeta | null;
    const receipt = await this.db.transaction(
      'rw',
      [this.db.saves, this.db.worlds, this.db.matches, this.db.leases],
      async () => {
        await this.assertOwnership(value.slot);
        const previous = await this.db.saves.get(value.slot);
        if (revisionOf(previous) !== expectedRevision) throw new SaveError('conflict');
        if (
          !value.replace &&
          (!isSplit(previous) ||
            previous.kind !== 'world' ||
            previous.world?.worldId !== value.worldId)
        )
          throw new SaveError('invalid');
        const createdAt =
          isSplit(previous) && !value.replace ? previous.createdAt : value.createdAt;
        const meta: SaveMeta = {
          layout: 2,
          format: 'pitch-to-glory',
          schemaVersion: CONFIG.saves.schemaVersion,
          engineVersion: ENGINE_VERSION,
          slot: value.slot,
          name: value.name,
          createdAt,
          // A device clock behind the save's creation never stores a time before it.
          updatedAt: notBefore(value.updatedAt, createdAt),
          revision: (revisionOf(previous) ?? 0) + 1,
          kind: 'world',
          gallery: foundation.gallery,
          settings: foundation.settings,
          world: value.summary,
        };
        await this.db.saves.put(meta);
        await this.db.worlds.put({ slot: value.slot, bytes });
        if (session) await this.db.matches.put({ slot: value.slot, session });
        else await this.db.matches.delete(value.slot);
        written = meta;
        return receiptOf(meta);
      },
    );
    // Committed: the season's backup follows, off the save queue, when due (step 4.3).
    if (written) this.options.backups?.schedule({ meta: written, bytes, match: session }, 'season');
    return receipt;
  }
  /**
   * Write everything except the world graph: preferences, gallery, the match session (as setup
   * and commands, checked for shape only; a load replays it) and, from the UI, small patches to
   * the stored world (step 3.4). The stored world must be the one the caller holds (checked by
   * id and revision).
   */
  async writeWithoutWorld(
    value: SaveWithoutWorld,
    expectedRevision: number,
  ): Promise<SaveWriteReceipt> {
    validateSlot(value.slot);
    const foundation = validateFoundation({
      kind: 'foundation',
      gallery: value.gallery,
      settings: value.settings,
    });
    const session = value.matchSession ? storedSession(value.matchSession) : null;
    const patches = value.worldPatches ?? [];
    if (
      !validPatches(patches, CONFIG.saves.maxWorldPatches) ||
      (value.summary !== undefined && !validSummary(value.summary, value.worldId))
    )
      throw new SaveError('invalid');
    const added = patches.length ? patchSize(patches) : 0;
    return this.db.transaction('rw', [this.db.saves, this.db.matches, this.db.leases], async () => {
      await this.assertOwnership(value.slot);
      const previous = await this.db.saves.get(value.slot);
      if (!isSplit(previous) || previous.revision !== expectedRevision)
        throw new SaveError('conflict');
      if (previous.kind !== 'world' || previous.world?.worldId !== value.worldId)
        throw new SaveError('invalid');
      if (session && session.setup.season !== previous.world.season) throw new SaveError('invalid');
      const stored = previous.worldPatches ?? [];
      if (stored.length + patches.length > CONFIG.saves.maxWorldPatches)
        throw new SaveError('large');
      const bytes = (previous.worldPatchBytes ?? 0) + added;
      if (patches.length && bytes > CONFIG.saves.maxPatchBytes) throw new SaveError('large');
      const meta: SaveMeta = {
        ...previous,
        engineVersion: ENGINE_VERSION,
        // A device clock behind the save's creation never stores a time before it.
        updatedAt: notBefore(value.updatedAt, previous.createdAt),
        revision: previous.revision + 1,
        gallery: foundation.gallery,
        settings: foundation.settings,
        ...(value.summary ? { world: value.summary } : {}),
        ...(patches.length
          ? { worldPatches: [...stored, ...patches], worldPatchBytes: bytes }
          : {}),
      };
      await this.db.saves.put(meta);
      if (session) await this.db.matches.put({ slot: value.slot, session });
      else await this.db.matches.delete(value.slot);
      return receiptOf(meta);
    });
  }
  /** Delete a slot with its backups (step 4.3), in one transaction. */
  async remove(slot: SlotId, expectedRevision: number | null): Promise<void> {
    validateSlot(slot);
    await this.db.transaction(
      'rw',
      [
        this.db.saves,
        this.db.worlds,
        this.db.matches,
        this.db.leases,
        this.db.backups,
        this.db.backupData,
      ],
      async () => {
        await this.assertOwnership(slot);
        const previous = await this.db.saves.get(slot);
        if (!previous || revisionOf(previous) !== expectedRevision) throw new SaveError('conflict');
        await this.db.saves.delete(slot);
        await this.db.worlds.delete(slot);
        await this.db.matches.delete(slot);
        await this.db.backups.bulkDelete(slotBackupIds(slot));
        await this.db.backupData.bulkDelete(slotBackupIds(slot));
      },
    );
  }
  /** Every slot's backups, what was skipped and the storage estimate (step 4.3). */
  backups(): Promise<BackupListing> {
    return this.backupStore.list();
  }
  /**
   * Restore a slot from one of its backups (step 4.3): the backup is checked as a load would
   * check it (salvage included) before anything is replaced, then written back as the slot's
   * records under the lease and revision checks, at a revision above both the slot's and the
   * backup's. Returns the loaded save, as a load would.
   */
  async restore(
    slot: SlotId,
    kind: BackupKind,
    expectedRevision: number | null,
  ): Promise<LoadedSave> {
    validateSlot(slot);
    if (!RESTORABLE.has(kind)) throw new SaveError('invalid');
    await this.options.backups?.idle();
    const { data } = await this.backupStore.read(slot, kind);
    const bytes = await unpackWorld(data);
    const records = recordsOf(slot, data, bytes);
    const loaded = await this.evaluate(records, async () => recordsOf(slot, data, bytes));
    if (bytes) await this.preflight(bytes.length);
    const restored = await this.db.transaction(
      'rw',
      [this.db.saves, this.db.worlds, this.db.matches, this.db.leases],
      async () => {
        await this.assertOwnership(slot);
        const previous = await this.db.saves.get(slot);
        if (revisionOf(previous) !== expectedRevision) throw new SaveError('conflict');
        const revision = Math.max(revisionOf(previous) ?? 0, data.meta.revision) + 1;
        const meta: SaveMeta = {
          ...data.meta,
          slot,
          revision,
          // A device clock behind the save's creation never stores a time before it.
          updatedAt: notBefore(new Date().toISOString(), data.meta.createdAt),
        };
        await this.db.saves.put(meta);
        if (records.world) await this.db.worlds.put(records.world);
        else await this.db.worlds.delete(slot);
        if (records.match) await this.db.matches.put(records.match);
        else await this.db.matches.delete(slot);
        return meta;
      },
    );
    return { ...loaded, revision: restored.revision, updatedAt: restored.updatedAt };
  }
  /**
   * One backup as a file, assembled like a recovery copy (neither migrated nor validated), for
   * a player who wants to keep that generation elsewhere.
   */
  async exportBackupGeneration(
    slot: SlotId,
    kind: BackupKind,
  ): Promise<{ name: string; json: string }> {
    validateSlot(slot);
    if (!RESTORABLE.has(kind)) throw new SaveError('invalid');
    const { info, data } = await this.backupStore.read(slot, kind);
    const record = this.assembled(recordsOf(slot, data, await unpackWorld(data)));
    if (!isRecord(record)) throw new SaveError('invalid');
    return { name: info.name, json: JSON.stringify(record) };
  }
  /**
   * Import a file: validated in full once (`parseSave`), then stored. `bytes` is the JSON's
   * UTF-8 size when the caller already knows it (`backup.ts`).
   */
  async import(
    json: string,
    slot: SlotId,
    expectedRevision: number | null,
    bytes?: number,
  ): Promise<AppSave> {
    validateSlot(slot);
    const { recovery, ...imported } = parseSave(json, bytes);
    // Stamped now, or at the file's creation if it was made on a device whose clock ran ahead.
    const saved = await this.store(
      {
        ...imported,
        slot,
        updatedAt: notBefore(new Date().toISOString(), imported.createdAt),
      },
      expectedRevision,
    );
    return recovery ? { ...saved, recovery } : saved;
  }
  /** Compact JSON backup. Pretty-printing roughly doubled file size against the import limit. */
  async exportJSON(slot: SlotId): Promise<{ name: string; json: string }> {
    const save = await this.read(slot);
    if (!save) throw new SaveError('invalid');
    const { recovery: _recovery, ...file } = save;
    void _recovery;
    return { name: save.name, json: JSON.stringify(file) };
  }
  /**
   * Recovery copy of a slot that will not load: its stored records in the backup envelope,
   * without migration or validation, so a failing validator never stands between the player
   * and their data. Reads only; nothing stored is repaired or rewritten.
   */
  async exportRecovery(slot: SlotId): Promise<{ name: string; json: string }> {
    validateSlot(slot);
    const record = this.assembled(await this.records(slot));
    if (!isRecord(record)) throw new SaveError('invalid');
    return {
      name: typeof record.name === 'string' ? record.name : '',
      json: JSON.stringify(record),
    };
  }
}
/** Every combination of two or more parts, the smaller first (three parts: four). */
function combinations(parts: readonly SalvagePart[]): SalvagePart[][] {
  const all: SalvagePart[][] = [[]];
  for (const part of parts) for (const set of [...all]) all.push([...set, part]);
  return all.filter((set) => set.length > 1).sort((a, b) => a.length - b.length);
}
/** What a backup copies of a slot's records as they were read. */
function snapshotOf(meta: SaveMeta, records: SlotRecords): SlotSnapshot {
  const bytes = records.world?.bytes;
  return { meta, bytes: isBytes(bytes) ? bytes : null, match: records.match?.session ?? null };
}
/** A backup's data as a slot's records. */
function recordsOf(slot: SlotId, data: BackupData, bytes: Uint8Array | null): SlotRecords {
  return {
    meta: { ...data.meta, slot },
    ...(bytes ? { world: { slot, bytes } } : {}),
    ...(data.match ? { match: { slot, session: data.match } } : {}),
  };
}
/** A write's receipt: the envelope and preferences, never the world or the session. */
function receiptOf(meta: SaveMeta): SaveWriteReceipt {
  return {
    format: 'pitch-to-glory',
    schemaVersion: CONFIG.saves.schemaVersion,
    engineVersion: meta.engineVersion,
    slot: meta.slot,
    name: meta.name,
    createdAt: meta.createdAt,
    updatedAt: meta.updatedAt,
    revision: meta.revision,
    payload:
      meta.kind === 'world'
        ? { kind: 'world', gallery: meta.gallery, settings: meta.settings }
        : { kind: 'foundation', gallery: meta.gallery, settings: meta.settings },
  };
}
export type { WorldPatch };
