import { SaveDatabase, LocalSaveRepository } from '../persistence/localRepository';
import { createSave, parseSave, SaveError, unvalidatedSave } from '../persistence/schema';
import {
  isLeaseOperation,
  MUTATIONS,
  type PersistenceRequest,
  type PersistenceResponse,
} from '../persistence/protocol';
import { LeaseLock } from '../persistence/leaseLock';
import { SAVE_CHANNEL } from '../persistence/database';
import { createChunkReceiver, sendChunked } from './transport';
import { packBackup, unpackBackup } from '../persistence/backup';

const databases = new Map<string, SaveDatabase>();
function databaseFor(name: string): SaveDatabase {
  const previous = databases.get(name);
  if (previous) return previous;
  const database = new SaveDatabase(name);
  databases.set(name, database);
  return database;
}

export async function executePersistenceRequest(
  request: PersistenceRequest,
  resolveDatabase = databaseFor,
): Promise<PersistenceResponse> {
  try {
    if (request.operation === 'validate') {
      const { json, bytes } = await unpackBackup(request.file);
      parseSave(json, bytes);
      return { requestId: request.requestId, ok: true, value: undefined };
    }
    if (request.operation === 'lease-acquire' || request.operation === 'lease-release') {
      if (!request.owner) throw new SaveError('locked');
      const lease = new LeaseLock(resolveDatabase(request.database), request.owner);
      if (request.operation === 'lease-release') {
        await lease.release(request.slot);
        return { requestId: request.requestId, ok: true, value: undefined };
      }
      const acquired = await lease.acquire(request.slot, request.native);
      return { requestId: request.requestId, ok: true, value: { acquired } };
    }
    const repository = new LocalSaveRepository(resolveDatabase(request.database), request.owner);
    if (request.operation === 'write-without-world') {
      const value = await repository.writeWithoutWorld(request.value, request.expectedRevision);
      return { requestId: request.requestId, ok: true, value };
    }
    if (request.operation === 'write-world') {
      const value = await repository.writeWorld(request.value, request.expectedRevision);
      return { requestId: request.requestId, ok: true, value };
    }
    // Exports leave as backup files, compressed here (step 3.7), never on the tab's thread.
    if (request.operation === 'export' || request.operation === 'export-recovery') {
      const { name, json } =
        request.operation === 'export'
          ? await repository.exportJSON(request.slot)
          : await repository.exportRecovery(request.slot);
      return { requestId: request.requestId, ok: true, value: await packBackup(name, json) };
    }
    if (request.operation === 'serialize') {
      const { recovery: _recovery, ...file } = request.unvalidated
        ? unvalidatedSave(request.slot, request.name, request.payload)
        : createSave(request.slot, request.name, request.payload);
      void _recovery;
      return {
        requestId: request.requestId,
        ok: true,
        value: await packBackup(request.name, JSON.stringify(file)),
      };
    }
    if (request.operation === 'import') {
      const { json, bytes } = await unpackBackup(request.file);
      return {
        requestId: request.requestId,
        ok: true,
        value: await repository.import(json, request.slot, request.expectedRevision, bytes),
      };
    }
    const value =
      request.operation === 'read'
        ? await repository.load(request.slot)
        : request.operation === 'list'
          ? await repository.list()
          : request.operation === 'write'
            ? await repository.write(request.value, request.expectedRevision)
            : request.operation === 'create'
              ? await repository.write(
                  createSave(request.slot, request.name, request.payload),
                  request.expectedRevision,
                )
              : await repository
                  .remove(request.slot, request.expectedRevision)
                  .then(() => undefined);
    // Write receipts never echo the world back to the UI thread, which already holds it.
    if (
      (request.operation === 'write' || request.operation === 'create') &&
      value &&
      !Array.isArray(value) &&
      value.payload.kind === 'world'
    ) {
      const { world: _world, matchSession: _session, ...payload } = value.payload;
      void [_world, _session];
      return { requestId: request.requestId, ok: true, value: { ...value, payload } };
    }
    return { requestId: request.requestId, ok: true, value };
  } catch (error) {
    return {
      requestId: request.requestId,
      ok: false,
      code: error instanceof SaveError ? error.code : 'storage',
    };
  }
}

// Node tests call the executor directly. Only the dedicated browser worker owns
// this message service; the local repository remains available for migrations.
if (typeof self !== 'undefined' && typeof document === 'undefined') {
  const scope = self as unknown as {
    onmessage: ((event: MessageEvent) => void) | null;
    postMessage(message: unknown): void;
  };
  // Tabs refresh their save lists when a slot changes, in this tab or another.
  const channel =
    typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(SAVE_CHANNEL);
  let queue: Promise<void> = Promise.resolve();
  /**
   * Every request gets a reply (S9): a failure anywhere, even in sending the reply, answers
   * `ok: false` rather than leaving the tab's autosave waiting.
   */
  const reply = async (request: PersistenceRequest) => {
    let response: PersistenceResponse;
    try {
      response = await executePersistenceRequest(request);
    } catch {
      response = { requestId: request.requestId, ok: false, code: 'storage' };
    }
    if (response.ok && MUTATIONS.has(request.operation))
      try {
        channel?.postMessage({ database: request.database });
      } catch {
        // The announcement only refreshes save lists; the write itself succeeded.
      }
    try {
      await sendChunked(scope, response);
    } catch {
      scope.postMessage({ requestId: request.requestId, ok: false, code: 'storage' });
    }
  };
  const receive = createChunkReceiver<PersistenceRequest>((request) => {
    if (!request || typeof request.requestId !== 'string') return;
    // Leases touch only their own store, so they never wait behind a large save (as when the
    // tab kept them itself); their small replies go out whole, beside any chunked reply.
    if (isLeaseOperation(request.operation)) {
      void reply(request);
      return;
    }
    queue = queue.catch(() => {}).then(() => reply(request));
  });
  scope.onmessage = receive;
}
