/**
 * Save errors, kept free of the rest of the save system so the app shell can report them
 * without loading validation, migrations or IndexedDB at startup.
 */
export class SaveError extends Error {
  constructor(
    public readonly code: 'invalid' | 'future' | 'conflict' | 'locked' | 'large' | 'busy',
  ) {
    super(code);
  }
}
/** An update was requested while an unsaved world is open. */
export class UnsavedWorldError extends Error {}

export function errorCode(error: unknown): string {
  return error instanceof SaveError
    ? error.code
    : error instanceof Error && error.message === 'large'
      ? 'large'
      : 'storage';
}
