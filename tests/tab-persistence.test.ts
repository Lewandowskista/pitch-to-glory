import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('../src/persistence/workerClient', () => ({ persistenceRequest: vi.fn() }));
import { persistenceRequest } from '../src/persistence/workerClient';
import { WorkerLeases, WorkerSaveRepository } from '../src/persistence/browserRepository';
import { SlotLocks, type LeaseStore } from '../src/persistence/locks';
import { SAVE_CHANNEL } from '../src/persistence/database';
import type { PersistenceOperation } from '../src/persistence/protocol';
import type { SlotListing } from '../src/persistence/localRepository';
import type { SlotId } from '../src/model/domain';

const request = vi.mocked(persistenceRequest);
const empty = (revision: number): SlotListing[] => [
  { slot: 1, status: 'error', code: 'invalid', name: null, revision },
  { slot: 2, status: 'empty' },
  { slot: 3, status: 'empty' },
];
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));
afterEach(() => {
  vi.useRealTimers();
  request.mockReset();
});

describe('the tab’s save repository', () => {
  it('only sends requests to the persistence worker, as this tab', async () => {
    request.mockResolvedValue(undefined);
    const saves = new WorkerSaveRepository('db', 'tab-a');
    await saves.read(2);
    const file = new Blob(['{}']);
    await saves.validateFile(file);
    expect(request.mock.calls).toEqual([
      ['db', 'tab-a', { operation: 'read', slot: 2 }],
      ['db', 'tab-a', { operation: 'validate', file }],
    ]);
  });

  it('keeps a watched slot list current after this tab’s and other tabs’ changes', async () => {
    let revision = 0;
    request.mockImplementation(async (_database, _owner, operation: PersistenceOperation) =>
      operation.operation === 'list' ? empty(++revision) : undefined,
    );
    const saves = new WorkerSaveRepository('db', 'tab-a');
    const seen: number[] = [];
    const stop = saves.watch(
      (slots) => seen.push(slots[0]!.status === 'error' ? slots[0]!.revision! : -1),
      () => seen.push(-1),
    );
    await settle();
    expect(seen).toEqual([1]);
    // This tab's change refreshes the list without waiting for the broadcast.
    await saves.remove(3, null);
    await settle();
    expect(seen.at(-1)).toBeGreaterThan(1);
    // Another tab's worker announces its change on the channel.
    const before = seen.length;
    const other = new BroadcastChannel(SAVE_CHANNEL);
    other.postMessage({ database: 'db' });
    other.postMessage({ database: 'another-database' });
    await settle();
    expect(seen.length).toBe(before + 1);
    stop();
    other.postMessage({ database: 'db' });
    await settle();
    expect(seen.length).toBe(before + 1);
    other.close();
  });

  it('asks the worker for leases', async () => {
    request.mockResolvedValueOnce({ acquired: false }).mockResolvedValueOnce(undefined);
    const leases = new WorkerLeases('db', 'tab-a');
    expect(await leases.acquire(1, true)).toBe(false);
    await leases.release(1);
    expect(request.mock.calls).toEqual([
      ['db', 'tab-a', { operation: 'lease-acquire', slot: 1, native: true }],
      ['db', 'tab-a', { operation: 'lease-release', slot: 1 }],
    ]);
  });
});

describe('slot locks', () => {
  it('share one acquisition, renew the lease, and release it', async () => {
    vi.useFakeTimers();
    const calls: string[] = [];
    const lease: LeaseStore = {
      acquire: async (slot: SlotId) => {
        calls.push(`acquire ${slot}`);
        return true;
      },
      release: async (slot: SlotId) => {
        calls.push(`release ${slot}`);
      },
    };
    const locks = new SlotLocks(lease);
    expect(await Promise.all([locks.acquire(1), locks.acquire(1)])).toEqual([true, true]);
    expect(calls).toEqual(['acquire 1']);
    await vi.advanceTimersByTimeAsync(5000);
    expect(calls).toEqual(['acquire 1', 'acquire 1']);
    await locks.releaseAll();
    await vi.advanceTimersByTimeAsync(10000);
    expect(calls).toEqual(['acquire 1', 'acquire 1', 'release 1']);
    expect(() => locks.acquire(4 as SlotId)).toThrow('invalid');
  });

  it('give the slot back when another tab holds its lease', async () => {
    const locks = new SlotLocks({ acquire: async () => false, release: async () => {} });
    expect(await locks.acquire(2)).toBe(false);
  });
});
