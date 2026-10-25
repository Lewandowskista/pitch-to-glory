import { recordFailure } from '../diagnostics';
import { SaveError } from './errors';
import { createChunkReceiver, sendChunked } from '../workers/transport';
import { CONFIG } from '../engine/config';
import {
  isLeaseOperation,
  MUTATIONS,
  type PersistenceOperation,
  type PersistenceRequest,
  type PersistenceResponse,
} from './protocol';
export type { PersistenceOperation, PersistenceRequest } from './protocol';

/**
 * A request the persistence worker never answered: it crashed, or stopped answering and was
 * restarted by the watchdog (S9). For a write, whether it committed is unknown (`inDoubt`):
 * the next write checks the stored revision before calling a mismatch a conflict.
 */
export class PersistenceInterrupted extends Error {
  constructor(readonly inDoubt: boolean) {
    super('storage');
  }
}

let worker: Worker | null = null;
let sequence = 0;
let sending: Promise<void> = Promise.resolve();
interface Pending {
  resolve(value: unknown): void;
  reject(error: unknown): void;
  timer: ReturnType<typeof setTimeout>;
  mutation: boolean;
}
const pending = new Map<string, Pending>();

function settle(requestId: string): Pending | undefined {
  const operation = pending.get(requestId);
  if (!operation) return undefined;
  pending.delete(requestId);
  clearTimeout(operation.timer);
  return operation;
}
/** Stop the worker and fail everything it still owed; the next request starts a new one. */
function restart(instance: Worker): void {
  if (worker !== instance) return;
  worker = null;
  instance.terminate();
  for (const [requestId, operation] of [...pending]) {
    settle(requestId);
    operation.reject(new PersistenceInterrupted(operation.mutation));
  }
}
function persistenceWorker(): Worker {
  if (worker) return worker;
  const instance = new Worker(new URL('../workers/persistence.worker.ts', import.meta.url), {
    type: 'module',
  });
  worker = instance;
  const receive = createChunkReceiver<PersistenceResponse>((response) => {
    const operation = settle(response.requestId);
    if (!operation) return;
    if (response.ok) operation.resolve(response.value);
    else
      operation.reject(
        response.code === 'storage' ? new Error('storage') : new SaveError(response.code),
      );
  });
  instance.onmessage = receive;
  instance.onerror = (event) => {
    event.preventDefault();
    recordFailure('worker', event.message || 'The persistence worker stopped', 'persistence');
    restart(instance);
  };
  instance.onmessageerror = () => restart(instance);
  return instance;
}

// In-flight writes settle normally; UI job cancellation never terminates this
// persistent service or interrupts its ownership/revision transaction. Only the watchdog does,
// when a request goes unanswered for far longer than any real one takes.
export function persistenceRequest<T>(
  database: string,
  owner: string | undefined,
  operation: PersistenceOperation,
  transfer: Transferable[] = [],
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
    const lease = isLeaseOperation(operation.operation);
    const timer = setTimeout(
      () => restart(instance),
      lease ? CONFIG.saves.leaseTimeoutMs : CONFIG.saves.requestTimeoutMs,
    );
    pending.set(requestId, {
      resolve: (value) => resolve(value as T),
      reject,
      timer,
      mutation: MUTATIONS.has(operation.operation),
    });
    const request: PersistenceRequest = { ...operation, database, owner, requestId };
    // A lease renewal must not wait behind a large world still being sent.
    if (lease) {
      try {
        instance.postMessage(request);
      } catch (error) {
        settle(requestId);
        reject(error);
      }
      return;
    }
    sending = sending
      .catch(() => {})
      .then(async () => {
        if (!pending.has(requestId) || worker !== instance) return;
        try {
          await sendChunked(instance, request, () => false, transfer);
        } catch (error) {
          settle(requestId)?.reject(error);
        }
      });
  });
}
