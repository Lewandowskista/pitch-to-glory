import { RELEASE_SECTIONS, type ReleaseNotes } from '../i18n/patchNotes';
import { whatsNewText } from '../i18n/whatsNew';

/**
 * CHANGELOG.md from the patch notes (`npm run changelog`; `npm run check:release` compares).
 * The output is already in Prettier's Markdown style, so `format:check` leaves it alone.
 */
export function renderChangelog(notes: readonly ReleaseNotes[]): string {
  const { changelog, sections } = whatsNewText;
  const lines = [`# ${changelog.title}`, '', changelog.intro];
  for (const entry of notes) {
    lines.push(
      '',
      `## ${entry.version} — ${entry.title}`,
      '',
      `_${entry.date}_`,
      '',
      entry.summary,
    );
    for (const section of RELEASE_SECTIONS) {
      const items = entry[section];
      if (!items?.length) continue;
      lines.push('', `### ${sections[section]}`, '', ...items.map((item) => `- ${item}`));
    }
  }
  return `${lines.join('\n')}\n`;
}

/** Line endings aside (Windows checkouts convert them), whether the file is up to date. */
export function changelogIsCurrent(file: string, notes: readonly ReleaseNotes[]): boolean {
  return file.replace(/\r\n/g, '\n') === renderChangelog(notes);
}
