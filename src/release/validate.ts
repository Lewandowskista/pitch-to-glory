import { RELEASE_SECTIONS, type ReleaseNotes } from '../i18n/patchNotes';
import { compareVersions, isVersion } from './semver';

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
/** A real calendar date in `YYYY-MM-DD` form (no 2026-02-30). */
export function isIsoDate(date: string): boolean {
  const match = ISO_DATE.exec(date);
  if (!match) return false;
  const parsed = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return parsed.toISOString().slice(0, 10) === date;
}

/** Internal vocabulary that must never reach players: milestone or phase numbers, file names. */
const INTERNAL = [
  /\b(milestone|phase)\s*\d/i,
  /\b[\w-]+\.(tsx?|mjs|js|json|css|md|html)\b/i,
  /\bmatch-\d+\b/i,
];

/**
 * Every problem with the patch notes, or none. The rules behind `npm run check:release`:
 * versions valid, unique and strictly descending; dates valid and never older than the next
 * entry's; every entry has a title, a summary and at least one section; no empty section or
 * line; no internal vocabulary; and, given `packageVersion`, the newest entry is that version.
 */
export function patchNoteProblems(
  notes: readonly ReleaseNotes[],
  packageVersion?: string,
): string[] {
  const problems: string[] = [];
  if (notes.length === 0) return ['There are no patch notes.'];
  if (packageVersion !== undefined) {
    if (!notes.some((entry) => entry.version === packageVersion))
      problems.push(`package.json version ${packageVersion} has no patch-notes entry.`);
    else if (notes[0]!.version !== packageVersion)
      problems.push(
        `The newest patch-notes entry is ${notes[0]!.version}, but package.json is ${packageVersion}.`,
      );
  }
  notes.forEach((entry, index) => {
    const name = `Release ${entry.version || `#${index + 1}`}`;
    if (!isVersion(entry.version))
      problems.push(`${name}: "${entry.version}" is not a major.minor.patch version.`);
    if (!isIsoDate(entry.date))
      problems.push(`${name}: "${entry.date}" is not a valid YYYY-MM-DD date.`);
    if (!entry.title.trim()) problems.push(`${name}: the title is empty.`);
    if (!entry.summary.trim()) problems.push(`${name}: the summary is empty.`);
    const sections = RELEASE_SECTIONS.filter((section) => entry[section] !== undefined);
    if (sections.length === 0) problems.push(`${name}: there are no sections.`);
    for (const section of sections) {
      const lines = entry[section]!;
      if (lines.length === 0) problems.push(`${name}: the "${section}" section is empty.`);
      lines.forEach((line, i) => {
        if (!line.trim()) problems.push(`${name}: ${section} line ${i + 1} is empty.`);
      });
    }
    for (const text of [entry.title, entry.summary, ...sections.flatMap((s) => entry[s]!)])
      for (const pattern of INTERNAL)
        if (pattern.test(text))
          problems.push(`${name}: "${text}" uses internal wording (${pattern.source}).`);
    const older = notes[index + 1];
    if (!older) return;
    if (isVersion(entry.version) && isVersion(older.version)) {
      const order = compareVersions(entry.version, older.version);
      if (order < 0)
        problems.push(`${name}: listed before the older ${older.version}; keep newest first.`);
    }
    if (isIsoDate(entry.date) && isIsoDate(older.date) && entry.date < older.date)
      problems.push(`${name}: dated ${entry.date}, before the older ${older.version}.`);
  });
  const counts = new Map<string, number>();
  for (const entry of notes) counts.set(entry.version, (counts.get(entry.version) ?? 0) + 1);
  for (const [version, count] of counts)
    if (count > 1)
      problems.push(`Release ${version}: listed ${count} times; versions must be unique.`);
  return problems;
}
