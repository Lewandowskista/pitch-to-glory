import { useAppStore } from '../store';
import { autosave } from './session';
import { busyReason, UpdateBlockedError } from '../release/busy';

/** Refuse while this tab is busy; `flushed` once the pending autosave has been written. */
function assertCanReload(flushed: boolean): void {
  const reason = busyReason(useAppStore.getState(), flushed);
  if (reason) throw new UpdateBlockedError(reason);
}

/**
 * Reload this tab onto a new version once nothing would be lost (release 1.0 step 4.1): write
 * the pending autosave first, then check again, since a job, a world or an unsaved change can
 * appear while IndexedDB finishes its transaction. Rejects with `UpdateBlockedError` (or the
 * save's own error) and leaves the page as it is.
 */
export async function updateApplication(reload: () => Promise<void>): Promise<void> {
  assertCanReload(false);
  await autosave.flush();
  assertCanReload(true);
  await reload();
}
