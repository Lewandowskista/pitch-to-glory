/**
 * Writes CHANGELOG.md from the patch notes in src/i18n/patchNotes.ts (docs/RELEASING.md).
 * Usage: npm run changelog
 */
import { writeFileSync } from 'node:fs';
import { PATCH_NOTES } from '../src/i18n/patchNotes';
import { renderChangelog } from '../src/release/changelog';

writeFileSync('CHANGELOG.md', renderChangelog(PATCH_NOTES));
console.log(
  `CHANGELOG.md written: ${PATCH_NOTES.length} releases, newest ${PATCH_NOTES[0]?.version}.`,
);
