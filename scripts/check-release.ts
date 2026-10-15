/**
 * The release gate (docs/RELEASING.md): every push to main is a release, so the version in
 * package.json must have player-facing patch notes, the notes must be well formed, and
 * CHANGELOG.md must match them. Usage: npm run check:release
 */
import { existsSync, readFileSync } from 'node:fs';
import { PATCH_NOTES } from '../src/i18n/patchNotes';
import { changelogIsCurrent } from '../src/release/changelog';
import { patchNoteProblems } from '../src/release/validate';

const { version } = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };
const problems = patchNoteProblems(PATCH_NOTES, version);
if (!existsSync('CHANGELOG.md')) problems.push('CHANGELOG.md is missing: run npm run changelog.');
else if (!changelogIsCurrent(readFileSync('CHANGELOG.md', 'utf8'), PATCH_NOTES))
  problems.push('CHANGELOG.md is out of date: run npm run changelog and commit it.');

if (problems.length) {
  console.error(`Release check failed for ${version}:`);
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}
console.log(`Release ${version}: patch notes and CHANGELOG.md are ready.`);
