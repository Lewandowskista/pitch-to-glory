// Backup file names and types. Kept apart from the save system so the app shell can name a file
// without loading it.
const day = (now: Date) => now.toISOString().slice(0, 10);
const extension = (compressed: boolean) => (compressed ? '.json.gz' : '.json');

/** A dated backup: `.json.gz` when compressed (release 1.0 step 3.7), `.json` otherwise. */
export const backupFileName = (subject: string, compressed: boolean, now = new Date()): string =>
  `pitch-to-glory-${subject}-${day(now)}${extension(compressed)}`;

/** The name of a recovery copy: dated, and named so it is never mistaken for a checked backup. */
export const recoveryFileName = (subject: string, compressed: boolean, now = new Date()): string =>
  `pitch-to-glory-${subject}-recovery-${day(now)}${extension(compressed)}`;

/** The content type a backup is saved or shared with. */
export const backupType = (compressed: boolean): string =>
  compressed ? 'application/gzip' : 'application/json';
