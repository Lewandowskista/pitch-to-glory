import { CONFIG } from '../engine/config';
import type { SlotId } from '../model/domain';
import type { SaveDatabase } from './repository';
import { validateSlot } from './schema';
export class LeaseLock {
  constructor(
    private readonly db: SaveDatabase,
    private readonly owner: string,
    private readonly now = Date.now,
  ) {}
  async acquire(slot: SlotId, native = false): Promise<boolean> {
    validateSlot(slot);
    return this.db.transaction('rw', this.db.leases, async () => {
      const current = await this.db.leases.get(slot);
      // A newly acquired native Web Lock proves an earlier native holder is gone,
      // even when its page closed before its async IndexedDB cleanup completed.
      if (
        current &&
        current.owner !== this.owner &&
        current.expires > this.now() &&
        !(native && current.mode === 'native')
      )
        return false;
      await this.db.leases.put({
        slot,
        owner: this.owner,
        expires: this.now() + CONFIG.saves.leaseDurationMs,
        mode: native ? 'native' : 'lease',
      });
      return true;
    });
  }
  async owns(slot: SlotId): Promise<boolean> {
    const lease = await this.db.leases.get(slot);
    return lease?.owner === this.owner && lease.expires > this.now();
  }
  async release(slot: SlotId): Promise<void> {
    await this.db.transaction('rw', this.db.leases, async () => {
      const current = await this.db.leases.get(slot);
      if (current?.owner === this.owner) await this.db.leases.delete(slot);
    });
  }
}
export class SlotLocks {
  private readonly lease: LeaseLock;
  private readonly held = new Map<
    SlotId,
    { releaseNative: () => void; timer: ReturnType<typeof setInterval>; native: boolean }
  >();
  private readonly acquiring = new Map<SlotId, Promise<boolean>>();
  constructor(db: SaveDatabase, owner: string) {
    this.lease = new LeaseLock(db, owner);
  }
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
