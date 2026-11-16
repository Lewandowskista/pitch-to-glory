import { SaveError } from './errors';

/**
 * How full the device's storage is, for the persistence worker (release 1.0 steps 4.3 and 4.6):
 * the space check before a backup, making room for a save the browser refused, and the
 * mapping of IndexedDB's quota errors. WebKit's estimate counts space IndexedDB has already
 * freed, so it never refuses a save on its own. `navigator.storage.estimate()` is available in workers;
 * where it is missing or fails, nothing is known (`null`) and writes go ahead, as before.
 */
export interface StorageEstimate {
  usage: number;
  quota: number;
}
/** Reads the storage estimate; tests pass their own. */
export type Estimator = () => Promise<StorageEstimate | null>;

export const browserEstimate: Estimator = async () => {
  try {
    const storage = (globalThis.navigator as { storage?: StorageManager } | undefined)?.storage;
    if (typeof storage?.estimate !== 'function') return null;
    const { usage, quota } = await storage.estimate();
    return typeof usage === 'number' &&
      typeof quota === 'number' &&
      Number.isFinite(usage) &&
      Number.isFinite(quota) &&
      quota > 0
      ? { usage, quota }
      : null;
  } catch {
    return null;
  }
};
/** Free bytes by the estimate, or null when the browser does not say. */
export async function freeBytes(estimate: Estimator): Promise<number | null> {
  const value = await estimate();
  return value ? Math.max(0, value.quota - value.usage) : null;
}
/**
 * Whether an error is the browser refusing to store more: a `QuotaExceededError` DOMException,
 * Dexie's wrapper of one, or a transaction aborted by one (Dexie keeps the cause in `inner`).
 * Firefox has also reported `NS_ERROR_DOM_QUOTA_REACHED`, and legacy code 22.
 */
export function isQuotaError(error: unknown, depth = 0): boolean {
  if (!error || typeof error !== 'object' || depth > 4) return false;
  const value = error as { name?: unknown; code?: unknown; inner?: unknown; cause?: unknown };
  if (value.name === 'QuotaExceededError' || value.name === 'NS_ERROR_DOM_QUOTA_REACHED')
    return true;
  if (value.code === 22) return true;
  return isQuotaError(value.inner, depth + 1) || isQuotaError(value.cause, depth + 1);
}
/** A failure as the code a tab receives: save errors as they are, quota errors as `quota`. */
export function failureCode(error: unknown): SaveError['code'] | 'storage' {
  return error instanceof SaveError ? error.code : isQuotaError(error) ? 'quota' : 'storage';
}
