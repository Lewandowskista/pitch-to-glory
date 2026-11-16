import { LOCALE, plurals, type Translations } from './locale';
/**
 * Diagnostics and bug reports (release 1.0 step 4.7): the Settings card and the report link.
 * Kept out of the app shell; Settings and the clubhouse load it.
 */
const diagnosticsTextEn = {
  title: 'Diagnostics',
  body: 'Problems the game ran into on this device, kept here so you can attach them to a bug report. Nothing is sent unless you send it.',
  none: 'No problems recorded on this device.',
  count: plurals({ one: '1 problem recorded', other: '{count} problems recorded' }),
  latest: 'Most recent',
  repeated: '×{count}',
  export: 'Export diagnostics',
  exported: 'Diagnostics file downloaded.',
  clear: 'Clear',
  cleared: 'Diagnostics cleared.',
  exportFailed: 'The diagnostics file could not be downloaded. Try again.',
  report: 'Report a bug',
  reportHint: 'Opens a prefilled issue on GitHub in a new tab. Attach the diagnostics file there.',
  kinds: {
    error: 'Error',
    unhandledrejection: 'Background failure',
    preload: 'Download failure',
    worker: 'Worker failure',
    boundary: 'Page failure',
  },
  issue: {
    title: 'Bug: ',
    body: [
      '**What happened?**',
      '',
      '',
      '**What did you expect?**',
      '',
      '',
      '**Steps to reproduce**',
      '1. ',
      '',
      '**Diagnostics**',
      'Please attach the diagnostics file: Settings → Diagnostics → Export diagnostics. It holds the version, the save’s seed and revision and recent errors, and nothing else.',
      '',
      '---',
      'Version: {version} · Save schema: {schema} · Match engine: {engine}',
      'Device: {device} · Browser: {browser} · Installed: {installed}',
    ].join('\n'),
  },
} as const;
export const diagnosticsText = (
  { en: diagnosticsTextEn } satisfies Translations<typeof diagnosticsTextEn>
)[LOCALE];
