import { SaveDatabase, LocalSaveRepository } from '../persistence/localRepository';
import { createSave, parseSave, SaveError } from '../persistence/schema';
import type { PersistenceRequest, PersistenceResponse } from '../persistence/workerClient';
import { createChunkReceiver, sendChunked } from './transport';

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
      parseSave(request.json);
      return { requestId: request.requestId, ok: true, value: undefined };
    }
    const repository = new LocalSaveRepository(resolveDatabase(request.database), request.owner);
    if (request.operation === 'write-without-world') {
      const value = await repository.writeWithoutWorld(request.value, request.expectedRevision);
      return { requestId: request.requestId, ok: true, value };
    }
    if (request.operation === 'export') {
      return {
        requestId: request.requestId,
        ok: true,
        value: await repository.exportJSON(request.slot),
      };
    }
    if (request.operation === 'serialize') {
      const { recovery: _recovery, ...file } = createSave(
        request.slot,
        request.name,
        request.payload,
      );
      void _recovery;
      return {
        requestId: request.requestId,
        ok: true,
        value: { name: request.name, json: JSON.stringify(file) },
      };
    }
    const value =
      request.operation === 'read'
        ? await repository.read(request.slot)
        : request.operation === 'list'
          ? await repository.list()
          : request.operation === 'write'
            ? await repository.write(request.value, request.expectedRevision)
            : request.operation === 'create'
              ? await repository.write(
                  createSave(request.slot, request.name, request.payload),
                  request.expectedRevision,
                )
              : request.operation === 'import'
                ? await repository.import(request.json, request.slot, request.expectedRevision)
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
      const { world: _world, ...payload } = value.payload;
      void _world;
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
  let queue: Promise<void> = Promise.resolve();
  const receive = createChunkReceiver<PersistenceRequest>((request) => {
    queue = queue
      .catch(() => {})
      .then(async () => {
        const response = await executePersistenceRequest(request);
        await sendChunked(scope, response);
      });
  });
  scope.onmessage = receive;
}
