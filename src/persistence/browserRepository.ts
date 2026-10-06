import type { FoundationState, WorldState, SlotId } from '../model/domain';
import {
  LocalSaveRepository,
  SaveDatabase,
  type SaveWriteReceipt,
  type SlotListing,
} from './localRepository';
import { persistenceRequest } from './workerClient';
import { createSave, parseSave, SaveError, type AppSave } from './schema';

/**
 * Browser repository. Validation, JSON and IndexedDB work run in the persistence worker;
 * Node tests use the same local repository directly.
 */
export class SaveRepository extends LocalSaveRepository {
  constructor(
    private readonly database: SaveDatabase,
    private readonly tabOwner?: string,
    private readonly forceLocal = false,
  ) {
    super(database, tabOwner);
  }
  private get delegated(): boolean {
    return !this.forceLocal && typeof document !== 'undefined' && typeof Worker !== 'undefined';
  }
  override read(slot: SlotId): Promise<AppSave | undefined> {
    return this.delegated
      ? persistenceRequest(this.database.name, this.tabOwner, { operation: 'read', slot })
      : super.read(slot);
  }
  override async list(): Promise<SlotListing[]> {
    if (!this.delegated) return super.list();
    // Observe the primary-key range so Dexie relays committed worker mutations to liveQuery.
    await this.database.saves.count();
    return persistenceRequest(this.database.name, this.tabOwner, { operation: 'list' });
  }
  override async write(value: AppSave, expectedRevision: number | null): Promise<AppSave> {
    return this.delegated
      ? this.combineReceipt(
          await persistenceRequest<SaveWriteReceipt>(this.database.name, this.tabOwner, {
            operation: 'write',
            value,
            expectedRevision,
          }),
          value.payload,
        )
      : super.write(value, expectedRevision);
  }
  override import(json: string, slot: SlotId, expectedRevision: number | null): Promise<AppSave> {
    return this.delegated
      ? persistenceRequest(this.database.name, this.tabOwner, {
          operation: 'import',
          json,
          slot,
          expectedRevision,
        })
      : super.import(json, slot, expectedRevision);
  }
  /**
   * Save preferences and the match session while the world graph is unchanged. Match
   * checkpoints use this every simulated minute, so it never transfers or stores the world.
   */
  async writeWithoutWorldChange(value: AppSave, expectedRevision: number): Promise<AppSave> {
    if (value.payload.kind !== 'world') return this.write(value, expectedRevision);
    const parts = {
      slot: value.slot,
      worldId: value.payload.world.id,
      updatedAt: value.updatedAt,
      gallery: value.payload.gallery,
      settings: value.payload.settings,
      matchSession: value.payload.matchSession ?? null,
    };
    const receipt = this.delegated
      ? await persistenceRequest<SaveWriteReceipt>(this.database.name, this.tabOwner, {
          operation: 'write-without-world',
          value: parts,
          expectedRevision,
        })
      : await super.writeWithoutWorld(parts, expectedRevision);
    return this.combineReceipt(receipt, value.payload);
  }
  override remove(slot: SlotId, expectedRevision: number | null): Promise<void> {
    return this.delegated
      ? persistenceRequest(this.database.name, this.tabOwner, {
          operation: 'remove',
          slot,
          expectedRevision,
        })
      : super.remove(slot, expectedRevision);
  }
  async create(
    slot: SlotId,
    name: string,
    payload: FoundationState | WorldState,
    expectedRevision: number | null,
  ): Promise<AppSave> {
    return this.delegated
      ? this.combineReceipt(
          await persistenceRequest<SaveWriteReceipt>(this.database.name, this.tabOwner, {
            operation: 'create',
            slot,
            name,
            payload,
            expectedRevision,
          }),
          payload,
        )
      : super.write(createSave(slot, name, payload), expectedRevision);
  }
  private combineReceipt(
    receipt: SaveWriteReceipt,
    payload: FoundationState | WorldState,
  ): AppSave {
    if (receipt.payload.kind === 'foundation') return { ...receipt, payload: receipt.payload };
    if (payload.kind !== 'world') throw new SaveError('invalid');
    return { ...receipt, payload: { ...receipt.payload, world: payload.world } };
  }
  async validateJSON(json: string): Promise<void> {
    if (this.delegated)
      return persistenceRequest(this.database.name, this.tabOwner, { operation: 'validate', json });
    parseSave(json);
  }
  override async exportJSON(slot: SlotId): Promise<{ name: string; json: string }> {
    return this.delegated
      ? persistenceRequest(this.database.name, this.tabOwner, { operation: 'export', slot })
      : super.exportJSON(slot);
  }
  /** Serialize an unsaved in-memory snapshot as a backup file, off the main thread. */
  async serialize(slot: SlotId, name: string, payload: FoundationState | WorldState) {
    if (this.delegated)
      return persistenceRequest<{ name: string; json: string }>(this.database.name, this.tabOwner, {
        operation: 'serialize',
        slot,
        name,
        payload,
      });
    const { recovery: _recovery, ...file } = createSave(slot, name, payload);
    void _recovery;
    return { name, json: JSON.stringify(file) };
  }
}
