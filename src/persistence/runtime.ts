import { WorkerLeases, WorkerSaveRepository } from './browserRepository';
import { SlotLocks } from './locks';
import { SAVE_DATABASE } from './database';
// Browser ownership identity is not simulation randomness and is never saved in a career.
const tabOwner = crypto.randomUUID();
/** The tab's saves and slot locks: requests to the persistence worker, which owns IndexedDB. */
export const saves = new WorkerSaveRepository(SAVE_DATABASE, tabOwner);
export const slotLocks = new SlotLocks(new WorkerLeases(SAVE_DATABASE, tabOwner));
