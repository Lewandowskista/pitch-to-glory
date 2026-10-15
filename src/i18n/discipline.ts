import { format } from './index';

/**
 * Cards and suspensions on the career screens (the discipline phase): the hub, calendar and
 * selection lines, the profile's record, season statistics and the inbox message. The match
 * screens' card copy lives in `match.ts`, loaded with the match.
 */
export const disciplineText = {
  matchesOne: '{count} match',
  matchesOther: '{count} matches',
  /** A short status, beside a fixture or on the hub. */
  suspended: 'Suspended · {matches}',
  /** The status in a sentence: the next fixtures in a scope are missed. */
  suspendedLine: 'Suspended for the next {matches} in {scope}.',
  /** The hub's next match when the ban covers it. */
  suspendedHub: 'You are suspended for this match: {matches} left to serve in {scope}.',
  /** The calendar marks each fixture a ban rules the player out of. */
  suspendedFixture: 'Suspended · match {match} of {matches}',
  scopes: {
    league: 'league football',
    cup: 'the cup',
    continental: 'continental football',
  },
  reasons: {
    'second-yellow': 'two yellow cards in one match',
    'straight-red': 'a straight red card',
    accumulation: 'your yellow cards this season',
  },
  /** The profile's and season statistics' disciplinary record. */
  record: 'Disciplinary record',
  yellow: 'Yellow cards',
  red: 'Red cards',
  yellowShort: 'YC',
  redShort: 'RC',
  cardsLine: '{yellow} yellow, {red} red',
  clean: 'No cards',
  seasonCards: 'This season: {cards}',
  careerCards: 'career: {cards}',
  /** A match in the history: booked, or sent off and why. */
  bookedMatch: 'Booked ({count} yellow)',
  sentOffMatch: 'Sent off in the {minute}′ for {reason}',
  /** The inbox message when a ban starts. */
  message: {
    subject: 'Suspended for {matches}',
    body: 'You will miss {club}’s next {matches} in {scope}, for {reason}. The manager picks the side without you until the ban is served.',
  },
} as const;

/** "1 match", "3 matches". */
export function matchesLabel(count: number): string {
  return format(count === 1 ? disciplineText.matchesOne : disciplineText.matchesOther, { count });
}
/** A season's or a career's cards in words: "3 yellow, 1 red". */
export function cardsLine(yellow: number, red: number): string {
  return yellow || red ? format(disciplineText.cardsLine, { yellow, red }) : disciplineText.clean;
}
/** Where a ban is served, in words. */
export function scopeLabel(scope: string): string {
  return disciplineText.scopes[scope as keyof typeof disciplineText.scopes] ?? scope;
}
