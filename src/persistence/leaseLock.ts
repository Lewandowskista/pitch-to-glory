import { CONFIG } from '../engine/config';
import type { SlotId } from '../model/domain';
import type { SaveDatabase } from './localRepository';
import { validateSlot } from './schema';

/**
 * A slot's lease in IndexedDB: the fallback lock for browsers without Web Locks, and the record
 * every write checks before it commits. Only the persistence worker (and Node tests) open the
 * database; tabs reach it through the worker's lease operations (locks.ts).
 */
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
