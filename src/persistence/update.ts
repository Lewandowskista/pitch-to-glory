import { useAppStore } from '../store';
import { autosave } from './session';
import { SaveError } from './schema';

export class UnsavedWorldError extends Error {}

function assertCanReload(): void {
  const { world, activeSave, worldJob } = useAppStore.getState();
  if (worldJob) throw new SaveError('busy');
  if (world && !activeSave) throw new UnsavedWorldError();
}

export async function updateApplication(reload: () => Promise<void>): Promise<void> {
  assertCanReload();
  await autosave.flush();
  // A new job or world can appear while IndexedDB finishes its transaction.
  assertCanReload();
  await reload();
}
