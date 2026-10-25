import { errorCode } from '../persistence/errors';
import { persistence } from '../persistence/lazy';
import { backupFileName, backupType, recoveryFileName } from '../persistence/files';
import type { AppSave } from '../persistence/schema';
import { platform } from '../platform';
import { useAppStore } from '../store';
import { track } from '../analytics';

/**
 * "Export unsaved copy": the session in memory as a backup file, from the save-error banner and
 * the page error boundary. Validation and serialization of a large world run in the persistence
 * worker, which also compresses the file where the browser can. A session that no longer passes
 * its checks is still worth keeping: it downloads unchecked, named as a recovery copy. A failure
 * is reported through the save status.
 */
export function exportUnsavedCopy(active: AppSave): Promise<void> {
  return persistence()
    .then(async (p) => {
      const snapshot = p.snapshot();
      const file = await p.saves
        .serialize(active.slot, active.name, snapshot)
        .then((checked) => ({
          name: backupFileName('unsaved', checked.compressed),
          backup: checked,
        }))
        .catch(async (error: unknown) => {
          // Too large is not a failed check: an unchecked copy is no smaller.
          if (errorCode(error) === 'large') throw error;
          const backup = await p.saves.serializeUnvalidated(active.slot, active.name, snapshot);
          return { name: recoveryFileName('unsaved', backup.compressed), backup };
        });
      await platform.saveFile(file.name, file.backup.file, backupType(file.backup.compressed));
      track('export_done', { what: 'unsaved' });
    })
    .catch((error: unknown) => useAppStore.getState().setSaveStatus('error', errorCode(error)));
}
