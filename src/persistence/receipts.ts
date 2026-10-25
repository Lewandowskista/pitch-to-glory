import type { FoundationState, WorldState } from '../model/domain';
import { SaveError } from './errors';
import type { PersistenceOperation } from './protocol';
import type { AppSave } from './schema';
import type { SaveWriteReceipt } from './localRepository';

// Helpers shared by the tab's worker-backed repository (browserRepository.ts) and the local
// one (repository.ts). Free of IndexedDB and validation, so the main thread can carry them.

/** What a write that keeps the stored world sends: preferences and the match session. */
export function withoutWorld(
  value: AppSave & { payload: WorldState },
): Extract<PersistenceOperation, { operation: 'write-without-world' }>['value'] {
  return {
    slot: value.slot,
    worldId: value.payload.world.id,
    updatedAt: value.updatedAt,
    gallery: value.payload.gallery,
    settings: value.payload.settings,
    matchSession: value.payload.matchSession ?? null,
  };
}
/** A full save from a write receipt and the world this tab already holds. */
export function combineReceipt(
  receipt: SaveWriteReceipt,
  payload: FoundationState | WorldState,
): AppSave {
  if (receipt.payload.kind === 'foundation') return { ...receipt, payload: receipt.payload };
  if (payload.kind !== 'world') throw new SaveError('invalid');
  return { ...receipt, payload: { ...receipt.payload, world: payload.world } };
}
