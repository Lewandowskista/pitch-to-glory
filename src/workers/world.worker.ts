import { runWorldJob } from './run';
import { worldOperations } from './operations';
import type { WorkerRequest } from './protocol';
import { createChunkReceiver, sendChunked } from './transport';

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage(response: unknown): void;
};
let current: string | null = null;
let cancelled = false;
let pending: { week: number; resolve(): void } | null = null;
scope.onmessage = createChunkReceiver<WorkerRequest>((data) => {
  if (data.type === 'ack') {
    if (data.requestId === current && data.completedWeeks === pending?.week) {
      const resolve = pending.resolve;
      pending = null;
      resolve();
    }
    return;
  }
  if (data.type === 'cancel') {
    if (data.requestId === current) {
      cancelled = true;
      pending?.resolve();
      pending = null;
    }
    return;
  }
  if (current) {
    scope.postMessage({ requestId: data.requestId, type: 'error', code: 'busy' });
    return;
  }
  current = data.requestId;
  cancelled = false;
  void runWorldJob(
    data,
    {
      emit: (response) => sendChunked(scope, response),
      cancelled: () => cancelled,
      checkpoint: (week) =>
        new Promise<void>((resolve) => {
          pending = { week, resolve };
        }),
      yieldControl: () => new Promise((resolve) => setTimeout(resolve, 0)),
    },
    worldOperations,
  ).finally(() => {
    current = null;
    pending = null;
  });
});
