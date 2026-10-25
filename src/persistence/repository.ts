import type { FoundationState, WorldState, SlotId } from '../model/domain';
import { LocalSaveRepository, type SaveDatabase } from './localRepository';
import { createSave, parseSave, unvalidatedSave, type AppSave } from './schema';
import { combineReceipt, withoutWorld } from './receipts';
import type { WorldPatch } from '../workers/worldPatch';

// The local save repository with the tab repository's interface (browserRepository.ts), for
// Node tests, tools and migrations. The app never loads this on the main thread: there,
// IndexedDB and validation belong to the persistence worker.
export { SaveDatabase } from './localRepository';

export class SaveRepository extends LocalSaveRepository {
  constructor(database: SaveDatabase, tabOwner?: string) {
    super(database, tabOwner);
  }
  /** As the tab repository: save preferences and the match session, keeping the world. */
  async writeWithoutWorldChange(
    value: AppSave,
    expectedRevision: number,
    worldPatches?: WorldPatch[],
  ): Promise<AppSave> {
    if (value.payload.kind !== 'world') return this.write(value, expectedRevision);
    const receipt = await this.writeWithoutWorld(
      withoutWorld({ ...value, payload: value.payload }, worldPatches),
      expectedRevision,
    );
    return combineReceipt(receipt, value.payload);
  }
  create(
    slot: SlotId,
    name: string,
    payload: FoundationState | WorldState,
    expectedRevision: number | null,
  ): Promise<AppSave> {
    return this.write(createSave(slot, name, payload), expectedRevision);
  }
  async validateJSON(json: string): Promise<void> {
    parseSave(json);
  }
  async serialize(slot: SlotId, name: string, payload: FoundationState | WorldState) {
    const { recovery: _recovery, ...file } = createSave(slot, name, payload);
    void _recovery;
    return { name, json: JSON.stringify(file) };
  }
  async serializeUnvalidated(slot: SlotId, name: string, payload: FoundationState | WorldState) {
    return { name, json: JSON.stringify(unvalidatedSave(slot, name, payload)) };
  }
}
