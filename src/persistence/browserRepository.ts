import type { FoundationState, WorldState, SlotId } from '../model/domain';
import type { AppSave } from './schema';
import type { SaveWriteReceipt, SlotListing } from './localRepository';
import type { LeaseStore } from './locks';
import type { PersistenceOperation } from './protocol';
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
  private request<T>(operation: PersistenceOperation): Promise<T> {
    return persistenceRequest<T>(this.database, this.tabOwner, operation);
  }
  /** A change this tab made: its own save lists refresh even without BroadcastChannel. */
  private async changed<T>(result: Promise<T>): Promise<T> {
    const value = await result;
    for (const listener of this.listeners) listener();
    return value;
  }
  read(slot: SlotId): Promise<AppSave | undefined> {
    return this.request({ operation: 'read', slot });
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
  import(json: string, slot: SlotId, expectedRevision: number | null): Promise<AppSave> {
    return this.changed(this.request({ operation: 'import', json, slot, expectedRevision }));
  }
  /**
   * Save preferences and the match session while the world graph is unchanged. Match
   * checkpoints use this every simulated minute, so it never transfers or stores the world.
   */
  async writeWithoutWorldChange(value: AppSave, expectedRevision: number): Promise<AppSave> {
    if (value.payload.kind !== 'world') return this.write(value, expectedRevision);
    const receipt = await this.changed(
      this.request<SaveWriteReceipt>({
        operation: 'write-without-world',
        value: withoutWorld({ ...value, payload: value.payload }),
        expectedRevision,
      }),
    );
    return combineReceipt(receipt, value.payload);
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
  validateJSON(json: string): Promise<void> {
    return this.request({ operation: 'validate', json });
  }
  exportJSON(slot: SlotId): Promise<{ name: string; json: string }> {
    return this.request({ operation: 'export', slot });
  }
  /** A slot's stored records, unvalidated, for a slot that will not load. */
  exportRecovery(slot: SlotId): Promise<{ name: string; json: string }> {
    return this.request({ operation: 'export-recovery', slot });
  }
  /** Serialize an unsaved in-memory snapshot as a backup file, off the main thread. */
  serialize(slot: SlotId, name: string, payload: FoundationState | WorldState) {
    return this.request<{ name: string; json: string }>({
      operation: 'serialize',
      slot,
      name,
      payload,
    });
  }
  /** As `serialize`, without validation: the fallback when the snapshot no longer passes it. */
  serializeUnvalidated(slot: SlotId, name: string, payload: FoundationState | WorldState) {
    return this.request<{ name: string; json: string }>({
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
