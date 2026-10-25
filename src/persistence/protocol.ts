import type { FoundationState, WorldState, SlotId } from '../model/domain';
import type { SaveError } from './errors';
import type { AppSave } from './schema';
import type {
  EncodedWorldSave,
  LoadedSave,
  SaveWithoutWorld,
  SaveWriteReceipt,
  SlotListing,
} from './localRepository';

// The messages between a tab and the persistence worker. Kept apart from the client
// (workerClient.ts), so bundling the worker never bundles the client that starts it.
export type PersistenceOperation =
  | { operation: 'read'; slot: SlotId }
  | { operation: 'list' }
  | { operation: 'write'; value: AppSave; expectedRevision: number | null }
  | { operation: 'write-without-world'; value: SaveWithoutWorld; expectedRevision: number }
  /** A whole world from the world worker's bytes (moved, not copied), stored unparsed. */
  | { operation: 'write-world'; value: EncodedWorldSave; expectedRevision: number | null }
  | {
      operation: 'create';
      slot: SlotId;
      name: string;
      payload: FoundationState | WorldState;
      expectedRevision: number | null;
    }
  | { operation: 'import'; json: string; slot: SlotId; expectedRevision: number | null }
  | { operation: 'validate'; json: string }
  | { operation: 'export'; slot: SlotId }
  /** A slot's stored records, unvalidated, for a slot that will not load. */
  | { operation: 'export-recovery'; slot: SlotId }
  | {
      operation: 'serialize';
      slot: SlotId;
      name: string;
      payload: FoundationState | WorldState;
      /** Skip validation: a recovery copy of a session that no longer passes it. */
      unvalidated?: boolean;
    }
  | { operation: 'remove'; slot: SlotId; expectedRevision: number | null }
  /** This tab's lease on a slot (locks.ts): small, and answered ahead of queued saves. */
  | { operation: 'lease-acquire'; slot: SlotId; native: boolean }
  | { operation: 'lease-release'; slot: SlotId };
/** Operations that change a slot: on success the worker announces them on SAVE_CHANNEL. */
export const MUTATIONS: ReadonlySet<PersistenceOperation['operation']> = new Set([
  'write',
  'write-without-world',
  'write-world',
  'create',
  'import',
  'remove',
]);
/** Lease operations skip the save queue in both directions, as they did on the main thread. */
export const isLeaseOperation = (operation: PersistenceOperation['operation']) =>
  operation === 'lease-acquire' || operation === 'lease-release';
export type PersistenceRequest = PersistenceOperation & {
  requestId: string;
  database: string;
  owner?: string;
};
export type PersistenceResponse =
  | {
      requestId: string;
      ok: true;
      value:
        | AppSave
        | LoadedSave
        | SaveWriteReceipt
        | SlotListing[]
        | { name: string; json: string }
        | { acquired: boolean }
        | undefined;
    }
  | { requestId: string; ok: false; code: SaveError['code'] | 'storage' };
