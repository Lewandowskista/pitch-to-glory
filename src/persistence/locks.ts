import { CONFIG } from '../engine/config';
import type { SlotId } from '../model/domain';
import { SaveError } from './errors';

/** Where a slot's lease is kept: IndexedDB, through the persistence worker (leaseLock.ts). */
export interface LeaseStore {
  acquire(slot: SlotId, native: boolean): Promise<boolean>;
  release(slot: SlotId): Promise<void>;
}
function validateSlot(slot: number): asserts slot is SlotId {
  if (![1, 2, 3].includes(slot)) throw new SaveError('invalid');
}
/**
 * This tab's hold on its save slots: a native Web Lock where the browser has them, plus the
 * lease that every write checks, renewed on a heartbeat. Main-thread code, free of IndexedDB.
 */
export class SlotLocks {
  private readonly held = new Map<
    SlotId,
    { releaseNative: () => void; timer: ReturnType<typeof setInterval>; native: boolean }
  >();
  private readonly acquiring = new Map<SlotId, Promise<boolean>>();
  constructor(private readonly lease: LeaseStore) {}
  /** Concurrent requests for the same slot in one tab share one acquisition. */
  acquire(slot: SlotId): Promise<boolean> {
    validateSlot(slot);
    const inFlight = this.acquiring.get(slot);
    if (inFlight) return inFlight;
    const attempt = this.acquireOnce(slot).finally(() => this.acquiring.delete(slot));
    this.acquiring.set(slot, attempt);
    return attempt;
  }
  private async acquireOnce(slot: SlotId): Promise<boolean> {
    const existing = this.held.get(slot);
    if (existing) return this.lease.acquire(slot, existing.native);
    let releaseNative = () => {};
    const native = typeof navigator !== 'undefined' && Boolean(navigator.locks);
    if (native) {
      const acquired = await new Promise<boolean>((resolve, reject) => {
        const held = new Promise<void>((release) => {
          releaseNative = release;
        });
        void navigator.locks
          .request(`pitch-to-glory:slot:${slot}`, { ifAvailable: true }, async (lock) => {
            resolve(Boolean(lock));
            if (lock) await held;
          })
          .catch(reject);
      });
      if (!acquired) return false;
    }
    try {
      if (!(await this.lease.acquire(slot, native))) {
        releaseNative();
        return false;
      }
      const timer = setInterval(() => {
        void this.lease
          .acquire(slot, native)
          .then((ok) => {
            if (!ok) void this.release(slot).catch(() => {});
          })
          .catch(() => {});
      }, CONFIG.saves.heartbeatMs);
      this.held.set(slot, { releaseNative, timer, native });
      return true;
    } catch (error) {
      releaseNative();
      throw error;
    }
  }
  async release(slot: SlotId): Promise<void> {
    const held = this.held.get(slot);
    if (!held) return;
    clearInterval(held.timer);
    this.held.delete(slot);
    try {
      await this.lease.release(slot);
    } finally {
      held.releaseNative();
    }
  }
  async releaseAll(): Promise<void> {
    await Promise.all([...this.held.keys()].map((slot) => this.release(slot)));
  }
}
