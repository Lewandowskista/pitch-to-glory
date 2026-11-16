/** The IndexedDB database that holds the save slots (opened only in the persistence worker). */
export const SAVE_DATABASE = 'pitch-to-glory';
/**
 * The channel on which the persistence worker announces committed slot changes, so every tab's
 * save list stays current without opening IndexedDB on the main thread.
 */
export const SAVE_CHANNEL = 'pitch-to-glory:saves';
