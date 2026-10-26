import { registerMatchText } from './match';
import { LOCALE, plurals, type Translations } from './locale';

/*
 * The occasions of a match-22 session (release 1.0 step 5.4): stoppage time, coming off the
 * bench, in-match injuries, the shootout and the touchline decisions. The shootout's situation
 * sentences are registered with the match copy when this module loads (with the lazy occasion
 * panels, before kick-off), so the live match screen's first load stays small; their commentary
 * lines are in src/i18n/commentary.ts.
 */

/** Key-moment sentences for a kick of the shootout itself. */
const situationsEn: Record<string, [string, string, string]> = {
  'shootout-kick': [
    'Kick {kick} of the shootout, and it is yours. {keeper} waits on the line. Where do you put it?',
    'The shootout. You place the ball on the spot, twelve yards from {keeper}.',
    'Your turn in the shootout. The noise is deafening. Pick your spot.',
  ],
  'shootout-kick-keeper': [
    'Shootout, kick {kick}: {attacker} places the ball. Which way do you go?',
    '{attacker} steps up in the shootout. It is you against them.',
    'The shootout: {attacker} on the spot, you on the line. Your plan?',
  ],
};
const engineEn = Object.fromEntries(
  Object.entries(situationsEn).flatMap(([key, lines]) =>
    lines.map((text, index) => [`match.situation.${key}.${index}`, text]),
  ),
) as Record<string, string>;
registerMatchText(({ en: engineEn } satisfies Translations<typeof engineEn>)[LOCALE]);

/** The panels' copy. */
const occasionsEn = {
  halftime: {
    meta: '{home} {homeScore}–{awayScore} {away}',
    title: 'Half-time: what do you tell the manager?',
    benchTitle: 'Half-time on the bench',
    note: 'Each answer has its moment: the effects depend on the score and on your first half.',
    motivate: 'Motivate the team',
    motivateBody:
      'Momentum +{lift} for your side ({context}). Second-half odds ×{odds}. Trust +{trust}.',
    context: {
      behind: 'strongest when behind',
      level: 'the score is level',
      ahead: 'weaker when ahead',
    },
    role: 'Ask for a role',
    roleLabel: 'Role to ask for',
    roleBody: 'The manager says no {chance}% of the time: {reasons}.',
    roleReasons: {
      trust: 'trust {trust} of 100',
      against: 'the request runs against the score',
    },
    roleRefused: 'Refused, it costs 1 trust and a little confidence (odds ×{odds}).',
    roleSubmit: 'Ask for {role}',
    demand: 'Demand the ball',
    demandBody:
      'More of the second half goes through you. Trust {trust}, as your first half was rated {rating}: {verdict}.',
    demandVerdict: {
      earned: 'you have earned it',
      fair: 'the manager tolerates it',
      poor: 'the manager is not impressed',
    },
    lift: 'Lift the side from the bench',
    liftBody: 'Momentum +{lift} for your side ({context}). Trust +{trust}.',
    ask: 'Ask to come on',
    askBody:
      'The manager is half as likely again to bring you on. Trust {trust}: managers pick the side.',
  },
  roleResult: {
    granted: 'The manager agreed: you play the second half as {role}.',
    refused: 'The manager said no ({roll} against a {chance}% chance of refusal).',
  },
  substitution: {
    acceptBody: 'Shake the manager’s hand and sit down. Trust +{trust}.',
    rallyBody:
      'Rally the side as you go off: its goal chances ×{own} and theirs ×{against} for what is left. No trust gained.',
    note: 'Accepting pays when the game is settled; rallying when it is still in the balance.',
  },
  injury: {
    title: 'You have taken a knock',
    meta: '{minute} · {kind}',
    body: 'The physio checks you over. It is not serious yet: your call.',
    playOn: 'Play on',
    playOnBody:
      'Fatigue +{fatigue}, which lowers your odds, and each minute a {chance}% chance it becomes a {kind}.',
    off: 'Come off',
    offBody: 'Unhurt, but your match ends here.',
    noChange: 'Your side has no changes left: you have to play on.',
    injuredTitle: 'Injured: {kind}',
    injuredBody: 'Your match is over. The weeks out are counted when the result is recorded.',
    playingOn:
      'Playing on through a knock: fatigue +{fatigue}, {chance}% a minute that it gets worse.',
    cameOff: 'You came off as a precaution, unhurt.',
  },
  bench: {
    title: 'On the bench',
    meta: '{role} · from {from}′ the manager looks to the bench',
    warming: 'Warming up',
    waiting: 'Waiting for your chance',
    chance: 'Chance the manager brings you on this minute: {chance}%',
    chanceNone: 'The manager will not make a change now.',
    asked: 'You asked to come on: the manager knows you are ready.',
    on: 'You are on! {minute}, for {name}.',
    onBody: plurals({
      one: 'Make it count: {count} key moment is ahead of you.',
      other: 'Make it count: up to {count} key moments are ahead of you.',
    }),
    keeper: 'A keeper on the bench comes on only if the starting keeper is injured.',
    roles: { key: 'Key player', rotation: 'Rotation', backup: 'Backup', youth: 'Youth' },
  },
  shootout: {
    title: 'Penalty shootout',
    tally: '{home} {homeGoals}–{awayGoals} {away}',
    scored: 'Scored',
    missed: 'Missed',
    pending: 'To take',
    you: 'You',
    suddenDeath: 'Sudden death',
    kick: 'Kick {kick}: {player}, {result}',
    winner: '{club} win the shootout {score}',
  },
  stoppage: {
    board: plurals({
      one: 'The fourth official’s board: {count} added minute',
      other: 'The fourth official’s board: {count} added minutes',
    }),
    chip: '+{minutes}',
  },
  captain: {
    start: 'The second half starts',
    conceded: 'Your side has just conceded',
    late: 'The closing stages, and it is close',
  },
};
export const occasionsText = ({ en: occasionsEn } satisfies Translations<typeof occasionsEn>)[
  LOCALE
];
