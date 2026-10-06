import Dexie, { type Table } from 'dexie';
import type {
  Crest,
  GalleryState,
  Settings,
  SlotId,
  World,
  FoundationState,
  WorldState,
} from '../model/domain';
import type { MatchSession } from '../engine/match/types';
import { CONFIG, ENGINE_VERSION } from '../engine/config';
import { validateMatchSession } from '../engine/match';
import {
  migrateSave,
  parseSave,
  SaveError,
  validateFoundation,
  validateSlot,
  type AppSave,
  type SaveRecovery,
} from './schema';
export interface Lease {
  slot: SlotId;
  owner: string;
  expires: number;
  mode?: 'native' | 'lease';
}
export interface WorldSummary {
  worldId: string;
  season: number;
  week: number;
  clubs: number;
  crests: Crest[];
  /** Present for career worlds: the player shown on the save card. */
  career?: { name: string; level: number; clubName: string; crest: Crest };
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
}
export interface WorldRecord {
  slot: SlotId;
  world: World;
}
export interface MatchRecord {
  slot: SlotId;
  session: MatchSession;
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

export function summarizeWorld(world: World): WorldSummary {
  return {
    worldId: world.id,
    season: world.date.season,
    week: world.date.week,
    clubs: Object.values(world.clubs).filter((club) => world.leagues[club.leagueId]).length,
    crests: Object.values(world.clubs)
      .slice(0, 3)
      .map((club) => club.crest),
    ...careerSummary(world),
  };
}
function careerSummary(world: World): Pick<WorldSummary, 'career'> {
  const player = world.career ? world.players[world.career.playerId] : undefined;
  const club = player?.clubId ? world.clubs[player.clubId] : undefined;
  return player && club
    ? {
        career: {
          name: player.name,
          level: world.career!.level,
          clubName: club.name,
          crest: club.crest,
        },
      }
    : {};
}
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
  constructor(name = 'pitch-to-glory') {
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
    this.on('versionchange', () => this.close());
  }
}
export class LocalSaveRepository {
  // Without owner this is a low-level migration/test repository. App writes always supply owner.
  constructor(
    protected readonly db: SaveDatabase,
    private readonly owner?: string,
  ) {}
  /** Assemble, migrate and fully validate one slot. Stale match sessions are discarded. */
  async read(slot: SlotId): Promise<AppSave | undefined> {
    validateSlot(slot);
    const [record, worldRecord, matchRecord] = await this.db.transaction(
      'r',
      this.db.saves,
      this.db.worlds,
      this.db.matches,
      () =>
        Promise.all([this.db.saves.get(slot), this.db.worlds.get(slot), this.db.matches.get(slot)]),
    );
    if (!record) return undefined;
    if (!isSplit(record)) return migrateSave(record);
    const { layout: _layout, kind, gallery, settings, world: _summary, ...envelope } = record;
    void _layout;
    void _summary;
    return migrateSave({
      ...envelope,
      payload: {
        kind,
        gallery,
        settings,
        ...(kind === 'world' ? { world: worldRecord?.world } : {}),
        ...(kind === 'world' && matchRecord ? { matchSession: matchRecord.session } : {}),
      },
    });
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
              updatedAt: record.updatedAt,
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
  /** Full write. Our own writes must be valid: a session that fails validation is rejected. */
  async write(value: AppSave, expectedRevision: number | null): Promise<AppSave> {
    const save = migrateSave(value);
    if (save.recovery) throw new SaveError('invalid');
    return this.db.transaction(
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
        await this.db.saves.put(metaFor(stored));
        if (stored.payload.kind === 'world') {
          await this.db.worlds.put({ slot: stored.slot, world: stored.payload.world });
          if (stored.payload.matchSession)
            await this.db.matches.put({ slot: stored.slot, session: stored.payload.matchSession });
          else await this.db.matches.delete(stored.slot);
        } else {
          await this.db.worlds.delete(stored.slot);
          await this.db.matches.delete(stored.slot);
        }
        return stored;
      },
    );
  }
  /**
   * Write everything except the world graph: preferences, gallery and the match session.
   * The stored world must be the one the caller holds (checked by id and revision).
   */
  async writeWithoutWorld(
    value: {
      slot: SlotId;
      worldId: string;
      updatedAt: string;
      gallery: GalleryState;
      settings: Settings;
      matchSession: MatchSession | null;
    },
    expectedRevision: number,
  ): Promise<SaveWriteReceipt> {
    validateSlot(value.slot);
    const foundation = validateFoundation({
      kind: 'foundation',
      gallery: value.gallery,
      settings: value.settings,
    });
    let session: MatchSession | null = null;
    if (value.matchSession) {
      try {
        session = validateMatchSession(value.matchSession);
      } catch {
        throw new SaveError('invalid');
      }
    }
    return this.db.transaction('rw', [this.db.saves, this.db.matches, this.db.leases], async () => {
      await this.assertOwnership(value.slot);
      const previous = await this.db.saves.get(value.slot);
      if (!isSplit(previous) || previous.revision !== expectedRevision)
        throw new SaveError('conflict');
      if (previous.kind !== 'world' || previous.world?.worldId !== value.worldId)
        throw new SaveError('invalid');
      if (session && session.setup.season !== previous.world.season) throw new SaveError('invalid');
      const meta: SaveMeta = {
        ...previous,
        engineVersion: ENGINE_VERSION,
        updatedAt: value.updatedAt,
        revision: previous.revision + 1,
        gallery: foundation.gallery,
        settings: foundation.settings,
      };
      await this.db.saves.put(meta);
      if (session) await this.db.matches.put({ slot: value.slot, session });
      else await this.db.matches.delete(value.slot);
      return {
        format: 'pitch-to-glory',
        schemaVersion: CONFIG.saves.schemaVersion,
        engineVersion: meta.engineVersion,
        slot: meta.slot,
        name: meta.name,
        createdAt: meta.createdAt,
        updatedAt: meta.updatedAt,
        revision: meta.revision,
        payload: {
          kind: 'world',
          gallery: meta.gallery,
          settings: meta.settings,
          ...(session ? { matchSession: session } : {}),
        },
      };
    });
  }
  async remove(slot: SlotId, expectedRevision: number | null): Promise<void> {
    validateSlot(slot);
    await this.db.transaction(
      'rw',
      [this.db.saves, this.db.worlds, this.db.matches, this.db.leases],
      async () => {
        await this.assertOwnership(slot);
        const previous = await this.db.saves.get(slot);
        if (!previous || revisionOf(previous) !== expectedRevision) throw new SaveError('conflict');
        await this.db.saves.delete(slot);
        await this.db.worlds.delete(slot);
        await this.db.matches.delete(slot);
      },
    );
  }
  async import(json: string, slot: SlotId, expectedRevision: number | null): Promise<AppSave> {
    validateSlot(slot);
    const { recovery, ...imported } = parseSave(json);
    const saved = await this.write(
      { ...imported, slot, updatedAt: new Date().toISOString() },
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
}
export type { SaveRecovery };
