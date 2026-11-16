import type { FoundationState, WorldState, SlotId } from '../model/domain';
import type { AppSave } from './schema';
import type {
  EncodedWorldSave,
  LoadedSave,
  SaveWriteReceipt,
  SlotListing,
} from './localRepository';
import type { WorldPatch } from '../workers/worldPatch';
import type { LeaseStore } from './locks';
import type { PersistenceOperation } from './protocol';
import type { BackupFile } from './backup';
import type { BackupKind, BackupListing } from './backups';
import { persistenceRequest } from './workerClient';
import { combineReceipt, withoutWorld } from './receipts';
import { SAVE_CHANNEL } from './database';

/**
 * The tab's save repository. IndexedDB, JSON, validation and migrations all run in the
 * persistence worker; this class only sends requests, so Dexie and the save validators never
 * load on the main thread. Node tests use the local repository (repository.ts) instead.
 */
export class WorkerSaveRepository {
  private readonly listeners = new Set<() => void>();
  constructor(
    private readonly database: string,
    private readonly tabOwner: string,
  ) {}
  private request<T>(operation: PersistenceOperation, transfer?: Transferable[]): Promise<T> {
    return transfer
      ? persistenceRequest<T>(this.database, this.tabOwner, operation, transfer)
      : persistenceRequest<T>(this.database, this.tabOwner, operation);
  }
  /** A change this tab made: its own save lists refresh even without BroadcastChannel. */
  private async changed<T>(result: Promise<T>): Promise<T> {
    const value = await result;
    for (const listener of this.listeners) listener();
    return value;
  }
  /** A slot's save, with what a later write needs to know about its storage. */
  load(slot: SlotId): Promise<LoadedSave | undefined> {
    return this.request({ operation: 'read', slot });
  }
  async read(slot: SlotId): Promise<AppSave | undefined> {
    const loaded = await this.load(slot);
    if (!loaded) return undefined;
    const { stored: _stored, ...save } = loaded;
    void _stored;
    return save;
  }
  list(): Promise<SlotListing[]> {
    return this.request({ operation: 'list' });
  }
  /**
   * The slot list now and after every committed change, from this tab or another (the worker
   * announces each one on SAVE_CHANNEL). Returns the unsubscribe function.
   */
  watch(next: (slots: SlotListing[]) => void, error: (reason: unknown) => void): () => void {
    let active = true;
    let running = false;
    let again = false;
    const refresh = async () => {
      if (running) {
        again = true;
        return;
      }
      running = true;
      try {
        do {
          again = false;
          const slots = await this.list();
          if (active && !again) next(slots);
        } while (active && again);
      } catch (reason) {
        if (active) error(reason);
      } finally {
        running = false;
      }
    };
    const channel =
      typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(SAVE_CHANNEL);
    if (channel)
      channel.onmessage = (event: MessageEvent<{ database?: string }>) => {
        if (event.data?.database === this.database) void refresh();
      };
    const local = () => void refresh();
    this.listeners.add(local);
    void refresh();
    return () => {
      active = false;
      this.listeners.delete(local);
      channel?.close();
    };
  }
  async write(value: AppSave, expectedRevision: number | null): Promise<AppSave> {
    const receipt = await this.changed(
      this.request<SaveWriteReceipt>({ operation: 'write', value, expectedRevision }),
    );
    return combineReceipt(receipt, value.payload);
  }
  /** Import a picked backup file (plain JSON or gzip), read and checked in the worker. */
  import(file: Blob, slot: SlotId, expectedRevision: number | null): Promise<AppSave> {
    return this.changed(this.request({ operation: 'import', file, slot, expectedRevision }));
  }
  /**
   * Save preferences and the match session while the world graph is unchanged. Match
   * checkpoints use this every simulated minute, so it never transfers or stores the world.
   */
  async writeWithoutWorldChange(
    value: AppSave,
    expectedRevision: number,
    worldPatches?: WorldPatch[],
  ): Promise<AppSave> {
    if (value.payload.kind !== 'world') return this.write(value, expectedRevision);
    const receipt = await this.changed(
      this.request<SaveWriteReceipt>({
        operation: 'write-without-world',
        value: withoutWorld({ ...value, payload: value.payload }, worldPatches),
        expectedRevision,
      }),
    );
    return combineReceipt(receipt, value.payload);
  }
  /**
   * A whole world from the world worker's bytes. The bytes move to the persistence worker
   * without a copy (they are unusable here afterwards) and are stored without being parsed.
   */
  writeWorld(value: EncodedWorldSave, expectedRevision: number | null): Promise<SaveWriteReceipt> {
    return this.changed(
      this.request<SaveWriteReceipt>({ operation: 'write-world', value, expectedRevision }, [
        value.bytes.buffer,
      ]),
    );
  }
  remove(slot: SlotId, expectedRevision: number | null): Promise<void> {
    return this.changed(this.request({ operation: 'remove', slot, expectedRevision }));
  }
  async create(
    slot: SlotId,
    name: string,
    payload: FoundationState | WorldState,
    expectedRevision: number | null,
  ): Promise<AppSave> {
    const receipt = await this.changed(
      this.request<SaveWriteReceipt>({
        operation: 'create',
        slot,
        name,
        payload,
        expectedRevision,
      }),
    );
    return combineReceipt(receipt, payload);
  }
  /** Check a picked backup file without storing it. */
  validateFile(file: Blob): Promise<void> {
    return this.request({ operation: 'validate', file });
  }
  /** A slot's backup file, gzip where the browser can compress (`backup.ts`). */
  exportBackup(slot: SlotId): Promise<BackupFile> {
    return this.request({ operation: 'export', slot });
  }
  /** A slot's stored records, unvalidated, for a slot that will not load. */
  exportRecovery(slot: SlotId): Promise<BackupFile> {
    return this.request({ operation: 'export-recovery', slot });
  }
  /** Every slot's rotating backups, skips and the storage estimate (step 4.3). */
  backups(): Promise<BackupListing> {
    return this.request({ operation: 'backups' });
  }
  /** Replace a slot with one of its backups, checked first in the worker. */
  restore(slot: SlotId, backup: BackupKind, expectedRevision: number | null): Promise<LoadedSave> {
    return this.changed(this.request({ operation: 'restore', slot, backup, expectedRevision }));
  }
  /** One backup generation as a file, assembled like a recovery copy. */
  exportGeneration(slot: SlotId, backup: BackupKind): Promise<BackupFile> {
    return this.request({ operation: 'export-generation', slot, backup });
  }
  /** Serialize an unsaved in-memory snapshot as a backup file, off the main thread. */
  serialize(slot: SlotId, name: string, payload: FoundationState | WorldState) {
    return this.request<BackupFile>({
      operation: 'serialize',
      slot,
      name,
      payload,
    });
  }
  /** As `serialize`, without validation: the fallback when the snapshot no longer passes it. */
  serializeUnvalidated(slot: SlotId, name: string, payload: FoundationState | WorldState) {
    return this.request<BackupFile>({
      operation: 'serialize',
      slot,
      name,
      payload,
      unvalidated: true,
    });
  }
}

/** This tab's slot leases, kept in IndexedDB by the persistence worker. */
export class WorkerLeases implements LeaseStore {
  constructor(
    private readonly database: string,
    private readonly tabOwner: string,
  ) {}
  async acquire(slot: SlotId, native: boolean): Promise<boolean> {
    const { acquired } = await persistenceRequest<{ acquired: boolean }>(
      this.database,
      this.tabOwner,
      { operation: 'lease-acquire', slot, native },
    );
    return acquired;
  }
  release(slot: SlotId): Promise<void> {
    return persistenceRequest(this.database, this.tabOwner, { operation: 'lease-release', slot });
  }
}
