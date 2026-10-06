import type { FoundationState, WorldState, SlotId } from '../model/domain';
import { LocalSaveRepository, SaveDatabase } from './localRepository';
import { persistenceRequest, type SaveWriteReceipt } from './workerClient';
import { createSave, parseSave, SaveError, type AppSave } from './schema';

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
  override async list(): Promise<(AppSave | undefined)[]> {
    if (!this.delegated) return super.list();
    // Observe the full primary-key range without loading large row values.
    // Dexie relays committed worker mutations to this liveQuery dependency.
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
  async writeMatchCheckpoint(value: AppSave, expectedRevision: number): Promise<AppSave> {
    if (!this.delegated || value.payload.kind !== 'world')
      return this.write(value, expectedRevision);
    const receipt = await persistenceRequest<SaveWriteReceipt>(this.database.name, this.tabOwner, {
      operation: 'match-checkpoint',
      slot: value.slot,
      worldId: value.payload.world.id,
      matchSession: value.payload.matchSession ?? null,
      expectedRevision,
      updatedAt: value.updatedAt,
    });
    return this.combineReceipt(receipt, value.payload);
  }
  override remove(slot: SlotId, expectedRevision: number): Promise<void> {
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
  async exportJSON(slot: SlotId): Promise<{ name: string; json: string }> {
    if (this.delegated)
      return persistenceRequest(this.database.name, this.tabOwner, { operation: 'export', slot });
    const save = await super.read(slot);
    if (!save) throw new SaveError('invalid');
    return { name: save.name, json: JSON.stringify(save, null, 2) };
  }
}
