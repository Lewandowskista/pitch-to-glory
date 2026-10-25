/**
 * The name of a recovery copy: dated, and named so it is never mistaken for a checked backup.
 * Kept apart from the save system so the app shell can name a file without loading it.
 */
export const recoveryFileName = (subject: string, now = new Date()): string =>
  `pitch-to-glory-${subject}-recovery-${now.toISOString().slice(0, 10)}.json`;
