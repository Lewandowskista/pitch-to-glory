import type { FoundationState, WorldState, SlotId } from '../model/domain';
import type { SaveError } from './errors';
import type { AppSave } from './schema';
import type { BackupFile } from './backup';
import type { BackupKind, BackupListing } from './backups';
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
  /**
   * A backup file, plain JSON or gzip (`backup.ts`), read here: the tab passes the picked file
   * without reading it.
   */
  | { operation: 'import'; file: Blob; slot: SlotId; expectedRevision: number | null }
  | { operation: 'validate'; file: Blob }
  /** Exports answer with a `BackupFile`, compressed here where the browser can. */
  | { operation: 'export'; slot: SlotId }
  /** A slot's stored records, unvalidated, for a slot that will not load. */
  | { operation: 'export-recovery'; slot: SlotId }
  /** Every slot's rotating backups, what was skipped and the storage estimate (step 4.3). */
  | { operation: 'backups' }
  /** Replace a slot with one of its backups, checked first; answers the loaded save. */
  | { operation: 'restore'; slot: SlotId; backup: BackupKind; expectedRevision: number | null }
  /** One backup generation as a file, assembled like a recovery copy. */
  | { operation: 'export-generation'; slot: SlotId; backup: BackupKind }
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
  'restore',
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
        | BackupFile
        | BackupListing
        | { acquired: boolean }
        | undefined;
    }
  | { requestId: string; ok: false; code: SaveError['code'] | 'storage' };
