import type { FoundationState, GalleryState, Settings, WorldState, SlotId } from '../model/domain';
import { SaveError, type AppSave } from './schema';
import { createChunkReceiver, sendChunked } from '../workers/transport';
import type { MatchSession } from '../engine/match/types';
import type { SaveWriteReceipt, SlotListing } from './localRepository';
export type { SaveWriteReceipt } from './localRepository';

export type PersistenceOperation =
  | { operation: 'read'; slot: SlotId }
  | { operation: 'list' }
  | { operation: 'write'; value: AppSave; expectedRevision: number | null }
  | {
      operation: 'write-without-world';
      value: {
        slot: SlotId;
        worldId: string;
        updatedAt: string;
        gallery: GalleryState;
        settings: Settings;
        matchSession: MatchSession | null;
      };
      expectedRevision: number;
    }
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
  | {
      operation: 'serialize';
      slot: SlotId;
      name: string;
      payload: FoundationState | WorldState;
    }
  | { operation: 'remove'; slot: SlotId; expectedRevision: number | null };
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
        AppSave | SaveWriteReceipt | SlotListing[] | { name: string; json: string } | undefined;
    }
  | { requestId: string; ok: false; code: SaveError['code'] | 'storage' };

let worker: Worker | null = null;
let sequence = 0;
let sending: Promise<void> = Promise.resolve();
const pending = new Map<string, { resolve(value: unknown): void; reject(error: unknown): void }>();

function persistenceWorker(): Worker {
  if (worker) return worker;
  const instance = new Worker(new URL('../workers/persistence.worker.ts', import.meta.url), {
    type: 'module',
  });
  worker = instance;
  const receive = createChunkReceiver<PersistenceResponse>((response) => {
    const operation = pending.get(response.requestId);
    if (!operation) return;
    pending.delete(response.requestId);
    if (response.ok) operation.resolve(response.value);
    else
      operation.reject(
        response.code === 'storage' ? new Error('storage') : new SaveError(response.code),
      );
  });
  instance.onmessage = receive;
  const failed = () => {
    if (worker !== instance) return;
    worker = null;
    instance.terminate();
    for (const operation of pending.values()) operation.reject(new Error('storage'));
    pending.clear();
  };
  instance.onerror = (event) => {
    event.preventDefault();
    failed();
  };
  instance.onmessageerror = failed;
  return instance;
}

// In-flight writes settle normally; UI job cancellation never terminates this
// persistent service or interrupts its ownership/revision transaction.
export function persistenceRequest<T>(
  database: string,
  owner: string | undefined,
  operation: PersistenceOperation,
): Promise<T> {
  const requestId = `persistence-${++sequence}`;
  return new Promise<T>((resolve, reject) => {
    let instance: Worker;
    try {
      instance = persistenceWorker();
    } catch (error) {
      reject(error);
      return;
    }
    pending.set(requestId, { resolve: (value) => resolve(value as T), reject });
    const request: PersistenceRequest = { ...operation, database, owner, requestId };
    sending = sending
      .catch(() => {})
      .then(async () => {
        if (!pending.has(requestId) || worker !== instance) return;
        try {
          await sendChunked(instance, request);
        } catch (error) {
          pending.get(requestId)?.reject(error);
          pending.delete(requestId);
        }
      });
  });
}
