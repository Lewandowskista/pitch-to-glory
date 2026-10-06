import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('../src/persistence/session', () => ({
  autosave: { flush: vi.fn(), afterWeek: vi.fn() },
  errorCode: () => 'storage',
}));
vi.mock('../src/persistence/runtime', () => ({
  slotLocks: { release: vi.fn(), acquire: vi.fn().mockResolvedValue(true) },
}));
import { autosave } from '../src/persistence/session';
import { useAppStore } from '../src/store';
import { cancelWorldJob, startWorldJob } from '../src/workers/client';
import { slotLocks } from '../src/persistence/runtime';
import { createSave, DEFAULT_SETTINGS } from '../src/persistence/schema';
import type { World } from '../src/model/domain';
import type { WorkerResponse } from '../src/workers/protocol';
import { createChunkReceiver } from '../src/workers/transport';

afterEach(async () => {
  cancelWorldJob();
  await new Promise((resolve) => setTimeout(resolve, 0));
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
describe('browser job lifecycle', () => {
  it('settles a cancelled startup before accepting another job', async () => {
    const instances: unknown[] = [];
    class FakeWorker {
      onmessage = null;
      onerror = null;
      postMessage = vi.fn();
      terminate = vi.fn();
      constructor() {
        instances.push(this);
      }
    }
    vi.stubGlobal('Worker', FakeWorker);
    useAppStore.setState({ world: null, worldJob: null, activeSave: null });
    let releaseFlush: (() => void) | undefined;
    vi.mocked(autosave.flush)
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            releaseFlush = resolve;
          }),
      )
      .mockResolvedValue(undefined);
    const cancelledStartup = startWorldJob('generate', { seed: 'cancelled' });
    cancelWorldJob();
    await Promise.resolve();
    const ignoredWhileCancelling = startWorldJob('generate', { seed: 'too-early' });
    releaseFlush!();
    await Promise.all([cancelledStartup, ignoredWhileCancelling]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(instances).toHaveLength(0);
    expect(useAppStore.getState().worldJob).toBeNull();
    await startWorldJob('generate', { seed: 'fresh' });
    expect(instances).toHaveLength(1);
  });
  it('retains the loaded world if generation is cancelled during old-slot lock cleanup', async () => {
    let deliver: ((event: MessageEvent<WorkerResponse>) => void) | null = null;
    let requestId = '';
    class FakeWorker {
      set onmessage(handler: (event: MessageEvent<WorkerResponse>) => void) {
        deliver = handler;
      }
      onerror = null;
      private receive = createChunkReceiver<{ requestId: string }>((request) => {
        requestId = request.requestId;
      });
      postMessage(data: unknown) {
        this.receive({ data });
      }
      terminate = vi.fn();
    }
    vi.stubGlobal('Worker', FakeWorker);
    const activeSave = createSave(1, 'Loaded', {
      kind: 'foundation',
      gallery: { seed: 'old', generation: 0 },
      settings: { ...DEFAULT_SETTINGS },
    });
    const oldWorld = { id: 'old-world' } as World,
      newWorld = { id: 'new-world' } as World;
    useAppStore.setState({ world: oldWorld, worldJob: null, activeSave });
    vi.mocked(autosave.flush).mockResolvedValue(undefined);
    let release: (() => void) | undefined;
    vi.mocked(slotLocks.release).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    await startWorldJob('generate', { seed: 'new-seed' });
    deliver!({
      data: { requestId, type: 'result', world: newWorld },
    } as MessageEvent<WorkerResponse>);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(release).toBeDefined();
    cancelWorldJob();
    release!();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(useAppStore.getState().world).toBe(oldWorld);
    expect(useAppStore.getState().activeSave).toBe(activeSave);
    expect(slotLocks.acquire).toHaveBeenCalledWith(1);
    expect(useAppStore.getState().worldJob).toBeNull();
  });
});
