import type { AppStore } from '../store';

/**
 * What stops a tab from reloading onto a new version (release 1.0 step 4.1). A reload is safe
 * only when nothing would be lost or cut short: no world job running, no training being saved,
 * no world outside a save slot, and — once the pending autosave has been written — nothing
 * left unsaved. `unresponsive` is another tab that did not answer in time.
 */
export type BusyReason =
  | 'simulating-season'
  | 'simulating'
  | 'training'
  | 'unsaved-world'
  | 'match'
  | 'unsaved-changes'
  | 'unresponsive';
export const BUSY_REASONS: readonly BusyReason[] = [
  'simulating-season',
  'simulating',
  'training',
  'unsaved-world',
  'match',
  'unsaved-changes',
  'unresponsive',
];

type BusyState = Pick<
  AppStore,
  'worldJob' | 'trainingSaving' | 'world' | 'activeSave' | 'change' | 'savedChange' | 'matchSession'
>;
/**
 * Why this tab cannot reload now, or null. `flushed`: the autosave has just been written, so a
 * change still unsaved is one that could not be (a lock or storage error), and blocks too.
 */
export function busyReason(state: BusyState, flushed: boolean): BusyReason | null {
  if (state.worldJob)
    return state.worldJob.type === 'simulate-season' ? 'simulating-season' : 'simulating';
  if (state.trainingSaving) return 'training';
  if (state.world && !state.activeSave) return 'unsaved-world';
  if (flushed && state.activeSave && state.change !== state.savedChange)
    return state.matchSession ? 'match' : 'unsaved-changes';
  return null;
}

/** An update refused because a tab is busy: this one, or another (`page` says where it is). */
export class UpdateBlockedError extends Error {
  constructor(
    readonly reason: BusyReason,
    readonly page: string | null = null,
  ) {
    super(page === null ? `Update blocked: ${reason}` : `Update blocked by another tab: ${reason}`);
    this.name = 'UpdateBlockedError';
  }
}
