/**
 * Copy used by the shared UI kit (`src/ui/kit`). Small and dependency-free, because kit
 * components can render in the app shell on every page.
 */
export const kitText = {
  results: { W: 'Won', D: 'Drew', L: 'Lost' },
  /** A row of result pills, read as one phrase: "Form: won, drew, lost". */
  form: 'Form: {results}',
  meterValue: '{value} of 100',
  ofMax: '{value} of {max}',
  level: 'Level {level}',
  xp: '{into} / {needed} XP',
  xpMax: 'Maximum level reached',
  xpLabel: 'Experience towards level {level}',
  overall: 'Overall rating {value}',
  /** The radar's spoken summary: every axis with its value. */
  radar: '{label}: {values}',
  radarDefault: 'Attribute summary',
  axisValue: '{axis} {value}',
  softCap: 'Soft cap {value}',
  unread: '{count} unread',
  busy: 'Working…',
} as const;
