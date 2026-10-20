/**
 * Copy for the What's new screen and CHANGELOG.md. Loaded with the screen, never by the app
 * shell; the shell's "Updated" notice and the version rows use `t.app.release`.
 */
export const whatsNewText = {
  title: 'What’s new',
  description: 'Every update to Pitch to Glory, newest first.',
  /** The eyebrow: the version this browser is running. */
  installed: 'You are playing version {version}',
  latest: 'Latest update',
  version: 'Version {version}',
  /** A release's heading line: "Version 0.2.0 · 15 October 2026". */
  meta: '{version} · {date}',
  earlier: 'Earlier updates',
  earlierBody: 'What came before, release by release.',
  /** The language and region the release dates are written in. */
  dateLocale: 'en-GB',
  sections: {
    new: 'New',
    improved: 'Improved',
    fixed: 'Fixed',
  },
  changelog: {
    title: 'Changelog',
    intro:
      'Player-facing notes for every release of Pitch to Glory, newest first. Generated from `src/i18n/patchNotes.ts` by `npm run changelog`; do not edit by hand. See [docs/RELEASING.md](docs/RELEASING.md).',
  },
} as const;
