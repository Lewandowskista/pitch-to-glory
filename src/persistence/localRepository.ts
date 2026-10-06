import Dexie, { type Table } from 'dexie';
import type { SlotId } from '../model/domain';
import { migrateSave, parseSave, SaveError, validateSlot, type AppSave } from './schema';
export interface Lease {
  slot: SlotId;
  owner: string;
  expires: number;
  mode?: 'native' | 'lease';
}
export class SaveDatabase extends Dexie {
  saves!: Table<AppSave, SlotId>;
  leases!: Table<Lease, SlotId>;
  constructor(name = 'pitch-to-glory') {
    super(name);
    this.version(1).stores({ saves: 'slot,updatedAt', leases: 'slot' });
    this.version(2)
      .stores({ saves: 'slot,updatedAt,revision', leases: 'slot,expires' })
      .upgrade(async (tx) => {
        const records: unknown[] = await tx.table('saves').toArray();
        for (const record of records) await tx.table('saves').put(migrateSave(record));
      });
    this.version(3)
      .stores({ saves: 'slot,updatedAt,revision', leases: 'slot,expires' })
      .upgrade(async (tx) => {
        const records: unknown[] = await tx.table('saves').toArray();
        for (const record of records) await tx.table('saves').put(migrateSave(record));
      });
    this.version(4)
      .stores({ saves: 'slot,updatedAt,revision', leases: 'slot,expires' })
      .upgrade(async (tx) => {
        const records: unknown[] = await tx.table('saves').toArray();
        for (const record of records) await tx.table('saves').put(migrateSave(record));
      });
    this.version(5)
      .stores({ saves: 'slot,updatedAt,revision', leases: 'slot,expires' })
      .upgrade(async (tx) => {
        const records: unknown[] = await tx.table('saves').toArray();
        for (const record of records) await tx.table('saves').put(migrateSave(record));
      });
    this.on('versionchange', () => this.close());
  }
}
export class LocalSaveRepository {
  // Without owner this is a low-level migration/test repository. App writes always supply owner.
  constructor(
    private readonly db: SaveDatabase,
    private readonly owner?: string,
  ) {}
  async read(slot: SlotId): Promise<AppSave | undefined> {
    validateSlot(slot);
    const result = await this.db.saves.get(slot);
    return result ? migrateSave(result) : undefined;
  }
  async list(): Promise<(AppSave | undefined)[]> {
    return Promise.all(([1, 2, 3] as const).map((slot) => this.read(slot)));
  }
  private async assertOwnership(slot: SlotId): Promise<void> {
    if (!this.owner) return;
    const lease = await this.db.leases.get(slot);
    if (!lease || lease.owner !== this.owner || lease.expires <= Date.now())
      throw new SaveError('locked');
  }
  async write(value: AppSave, expectedRevision: number | null): Promise<AppSave> {
    const save = migrateSave(value);
    return this.db.transaction('rw', this.db.saves, this.db.leases, async () => {
      await this.assertOwnership(save.slot);
      const previous = await this.db.saves.get(save.slot);
      if ((previous?.revision ?? null) !== expectedRevision) throw new SaveError('conflict');
      const stored = { ...save, revision: (previous?.revision ?? 0) + 1 };
      await this.db.saves.put(stored);
      return stored;
    });
  }
  async remove(slot: SlotId, expectedRevision: number): Promise<void> {
    validateSlot(slot);
    await this.db.transaction('rw', this.db.saves, this.db.leases, async () => {
      await this.assertOwnership(slot);
      const previous = await this.db.saves.get(slot);
      if (previous?.revision !== expectedRevision) throw new SaveError('conflict');
      await this.db.saves.delete(slot);
    });
  }
  async import(json: string, slot: SlotId, expectedRevision: number | null): Promise<AppSave> {
    validateSlot(slot);
    const imported = parseSave(json);
    return this.write({ ...imported, slot, updatedAt: new Date().toISOString() }, expectedRevision);
  }
}
