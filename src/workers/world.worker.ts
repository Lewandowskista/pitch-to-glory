import { worldOperations } from './operations';
import type { HostRequest, HostResponse } from './protocol';
import { createChunkReceiver } from './transport';
import { createWorldHost } from './hostCore';

// The tab's long-lived world worker (hostCore.ts): it holds the world between jobs.
const scope = self as unknown as {
  onmessage: ((event: MessageEvent) => void) | null;
  postMessage(response: HostResponse, transfer?: Transferable[]): void;
};
const host = createWorldHost(
  (response, transfer) => scope.postMessage(response, transfer ?? []),
  worldOperations,
);
scope.onmessage = createChunkReceiver<HostRequest>(host);
