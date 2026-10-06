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
    if (request.operation === 'match-checkpoint') {
      const current = await repository.read(request.slot);
      if (!current || current.revision !== request.expectedRevision)
        throw new SaveError('conflict');
      if (current.payload.kind !== 'world' || current.payload.world.id !== request.worldId)
        throw new SaveError('invalid');
      const payload = {
        kind: 'world' as const,
        world: current.payload.world,
        gallery: current.payload.gallery,
        settings: current.payload.settings,
      };
      const saved = await repository.write(
        {
          ...current,
          updatedAt: request.updatedAt,
          payload: {
            ...payload,
            ...(request.matchSession ? { matchSession: request.matchSession } : {}),
          },
        },
        request.expectedRevision,
      );
      if (saved.payload.kind !== 'world') throw new SaveError('invalid');
      const receipt = {
        kind: 'world' as const,
        gallery: saved.payload.gallery,
        settings: saved.payload.settings,
        ...(saved.payload.matchSession ? { matchSession: saved.payload.matchSession } : {}),
      };
      return { requestId: request.requestId, ok: true, value: { ...saved, payload: receipt } };
    }
    if (request.operation === 'export') {
      const save = await repository.read(request.slot);
      if (!save) throw new SaveError('invalid');
      return {
        requestId: request.requestId,
        ok: true,
        value: { name: save.name, json: JSON.stringify(save, null, 2) },
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
    if (
      (request.operation === 'write' || request.operation === 'create') &&
      value &&
      !Array.isArray(value) &&
      value.payload.kind === 'world'
    ) {
      return {
        requestId: request.requestId,
        ok: true,
        value: {
          ...value,
          payload: {
            kind: 'world',
            gallery: value.payload.gallery,
            settings: value.payload.settings,
            ...(value.payload.matchSession ? { matchSession: value.payload.matchSession } : {}),
          },
        },
      };
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
