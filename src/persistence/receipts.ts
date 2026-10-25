import type { FoundationState, WorldState } from '../model/domain';
import { SaveError } from './errors';
import type { AppSave } from './schema';
import type { SaveWithoutWorld, SaveWriteReceipt } from './localRepository';
import type { WorldPatch } from '../workers/worldPatch';
import { compactSession } from './matchRecord';
import { summarizeWorld } from './summary';

// Helpers shared by the tab's worker-backed repository (browserRepository.ts) and the local
// one (repository.ts). Free of IndexedDB and validation, so the main thread can carry them.

/**
 * What a write that keeps the stored world sends: preferences, the match session as setup and
 * commands (step 3.5), and any patches that bring the stored world up to this one (step 3.4).
 */
export function withoutWorld(
  value: AppSave & { payload: WorldState },
  worldPatches?: WorldPatch[],
): SaveWithoutWorld {
  return {
    slot: value.slot,
    worldId: value.payload.world.id,
    updatedAt: value.updatedAt,
    gallery: value.payload.gallery,
    settings: value.payload.settings,
    matchSession: value.payload.matchSession ? compactSession(value.payload.matchSession) : null,
    ...(worldPatches?.length ? { worldPatches, summary: summarizeWorld(value.payload.world) } : {}),
  };
}
/**
 * A full save from a write receipt and what this tab holds: receipts carry neither the world
 * nor the match session, which this tab already has.
 */
export function combineReceipt(
  receipt: SaveWriteReceipt,
  payload: FoundationState | WorldState,
): AppSave {
  if (receipt.payload.kind === 'foundation') return { ...receipt, payload: receipt.payload };
  if (payload.kind !== 'world') throw new SaveError('invalid');
  return {
    ...receipt,
    payload: {
      kind: 'world',
      gallery: receipt.payload.gallery,
      settings: receipt.payload.settings,
      world: payload.world,
      ...(payload.matchSession ? { matchSession: payload.matchSession } : {}),
    },
  };
}
