import { SaveDatabase, SaveRepository } from './repository';
import { SlotLocks } from './locks';
// Browser ownership identity is not simulation randomness and is never saved in a career.
const tabOwner = crypto.randomUUID();
export const database = new SaveDatabase();
export const saves = new SaveRepository(database, tabOwner);
export const slotLocks = new SlotLocks(database, tabOwner);
