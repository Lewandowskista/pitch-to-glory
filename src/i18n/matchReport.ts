import { matchLabel } from './match';
import { LOCALE, plurals, type Translations } from './locale';

/*
 * Copy that only the post-match report shows: the morning headline and the touchline
 * reactions. It lives apart from the live match copy (match.ts), so the match screen loads it
 * with the report rather than before kickoff.
 */
/**
 * Morning headlines (engine match-12): three per story of the match. Parameters: {player},
 * {club}, {opponent}, {score} (own goals first), {goals}, {assists}.
 */
const headlinesEn: Record<string, [string, string, string]> = {
  'late-winner': [
    '{player} breaks {opponent} hearts at the death',
    'Late, late show: {player} snatches it for {club}',
    '{player} wins it in the dying minutes',
  ],
  'shootout.success': [
    '{player} steps up in the shootout and buries it!',
    'Ice in the veins: {player} scores in the shootout.',
    '{player} sends the keeper the wrong way from the spot.',
  ],
  'shootout.failure': [
    '{player} misses in the shootout!',
    'Saved! {player} cannot believe it.',
    '{player} skies the shootout penalty.',
  ],
  'shootout-keeper.success': [
    '{player} saves in the shootout!',
    'A shootout save from {player}! The stadium erupts.',
    '{player} guesses right and keeps it out!',
  ],
  'shootout-keeper.failure': [
    'The shootout penalties beat {player}.',
    '{player} dives the wrong way in the shootout.',
    'No luck for {player} in the shootout.',
  ],
  'late-equaliser': [
    '{player} rescues a point at the death',
    'Never beaten: {player} levels it late against {opponent}',
    '{player}’s late strike keeps {club} alive',
  ],
  'hat-trick': [
    'Match ball for {player} as {opponent} are torn apart',
    '{player} hits a hat-trick in {score} statement',
    'Three and counting: {player} runs riot',
  ],
  'final-won': [
    'Glory! {club} win the final against {opponent}',
    '{club} lift the trophy after {score} final win',
    '{player} and {club} crowned after beating {opponent}',
  ],
  'final-lost': [
    'Heartbreak for {club} in the final',
    'So near: {club} beaten {score} by {opponent} in the final',
    '{opponent} too strong for {club} on the big stage',
  ],
  'derby-won': [
    'Derby day belongs to {club}',
    '{club} take the bragging rights against {opponent}',
    'Half the city celebrates: {club} win the derby {score}',
  ],
  'derby-lost': [
    'Derby misery for {club}',
    '{opponent} take the bragging rights against {club}',
    'A long week ahead for {club} after {score} derby defeat',
  ],
  brace: [
    'Double trouble: {player} scores twice against {opponent}',
    '{player} brace powers {club} to {score}',
    'Two goals, one name: {player}',
  ],
  'penalty-save': [
    '{player} the spot-kick hero against {opponent}',
    'Penalty saved! {player} stands tall for {club}',
    '{player} guesses right and {club} hold firm',
  ],
  'scorer-win': [
    '{player} on target as {club} beat {opponent} {score}',
    '{player} strikes and {club} take the points',
    'A goal from {player}, a win for {club}',
  ],
  'scorer-draw': [
    '{player} scores but {club} are held {score}',
    'Honours even with {opponent} despite {player}’s goal',
    '{player} on target in {score} draw',
  ],
  'scorer-loss': [
    '{player} scores, but {club} fall to {opponent}',
    'Consolation for {player} in {score} defeat',
    '{player}’s goal not enough against {opponent}',
  ],
  provider: [
    '{player} the provider as {club} carve open {opponent}',
    '{assists} assists for {player} in a creative masterclass',
    '{player} pulls the strings for {club}',
  ],
  wall: [
    '{player} shuts out {opponent} in {score} clean sheet',
    'Nothing gets past {player}',
    'A wall in {club} colours: {player} keeps {opponent} out',
  ],
  rout: [
    '{club} run riot against {opponent}',
    '{score}! {club} hand {opponent} a hiding',
    'Statement win: {club} sweep {opponent} aside',
  ],
  thrashed: [
    '{club} humbled {score} by {opponent}',
    'A night to forget for {club} against {opponent}',
    'Questions to answer after {score} defeat',
  ],
  nightmare: [
    'A night to forget for {player} against {opponent}',
    'Costly errors leave {player} and {club} red-faced',
    '{player} punished as {opponent} capitalise',
  ],
  'strong-win': [
    '{player} stars as {club} beat {opponent}',
    'Standout {player} drives {club} to victory',
    '{club} win {score} with {player} at the heart of it',
  ],
  win: [
    '{club} see off {opponent} {score}',
    'Three points for {club} against {opponent}',
    'Job done: {club} beat {opponent}',
  ],
  draw: [
    '{club} and {opponent} share the points',
    'Stalemate: {club} held {score}',
    'No way through for {club} or {opponent}',
  ],
  'strong-loss': [
    '{player} shines in defeat to {opponent}',
    'Lone bright spark {player} cannot stop {opponent}',
    '{club} beaten {score} despite {player}’s efforts',
  ],
  loss: [
    '{club} fall {score} to {opponent}',
    '{opponent} too strong for {club}',
    'Defeat for {club} as {opponent} take the points',
  ],
  'sent-off': [
    'Red mist: {player} sent off against {opponent}',
    '{player} sees red as {club} finish {score}',
    'Early bath for {player} in {club}’s {score} with {opponent}',
  ],
};
const headlines = ({ en: headlinesEn } satisfies Translations<typeof headlinesEn>)[LOCALE];
const headlineText: Record<string, string> = Object.fromEntries(
  Object.entries(headlines).flatMap(([kind, lines]) =>
    lines.map((text, index) => [`match.headline.${kind}.${index}`, text]),
  ),
);
/**
 * Touchline reactions (engine match-12) by result and how the player played: four lines per
 * key, of which the report shows one chosen from the match seed (`reactionVariants` with the
 * report's `pickVariant`), so a refresh shows the same line and different matches vary
 * (release 1.0, step 5.1).
 */
type Variants = readonly [string, string, string, string];
const reactionTextEn: Record<string, Variants> = {
  'match.reaction.manager.win.star': [
    'Outstanding. You won us that game, and everyone in the dressing room knows it.',
    'That is the player I signed. You made the difference today.',
    'Brilliant. When it mattered, you were the one who stepped up.',
    'I will not pretend otherwise: that win had your name all over it.',
  ],
  'match.reaction.manager.win.solid': [
    'Good win, good shift. Keep doing the simple things well.',
    'Professional. You did your job and the team got the points.',
    'Solid from you. Three points, and plenty to build on.',
    'No complaints from me. Do that every week and we will be fine.',
  ],
  'match.reaction.manager.win.poor': [
    'We got the points, but I need more from you. The team carried you today.',
    'A win, but you were off it. Do not get used to being carried.',
    'Enjoy the result, then look at your own game. That was below your level.',
    'The lads dragged us over the line. I expect you to be one of them next time.',
  ],
  'match.reaction.manager.draw.star': [
    'You gave everything and deserved more. That level, every week.',
    'If everyone had played like you, we would have won that.',
    'A point, but you can hold your head high. You were our best player.',
    'You did your part and more. The rest of us have to match it.',
  ],
  'match.reaction.manager.draw.solid': [
    'A point is a point. We go again next week.',
    'Fair result. You did what I asked; now we find the extra yard.',
    'Steady from you. We need a bit more quality to turn these into wins.',
    'Not a bad shift. We take the point and move on.',
  ],
  'match.reaction.manager.draw.poor': [
    'That was not good enough from you. We needed more on the ball.',
    'We dropped points and you did not help. Sharpen up this week.',
    'A flat afternoon from you. I need you switched on from the first whistle.',
    'You drifted out of that game. Watch it back and tell me what you see.',
  ],
  'match.reaction.manager.loss.star': [
    'Hard to take, but your performance is the one thing I am pleased with.',
    'We lost, but not because of you. Keep that standard.',
    'You fought for every ball. If the rest had followed, it would be a different story.',
    'A bad day for the team, a good one for you. Remember that feeling.',
  ],
  'match.reaction.manager.loss.solid': [
    'We fell short as a team. Watch it back and learn from it.',
    'Not your fault alone, but not good enough from any of us.',
    'You held your own. Now we all need to find more.',
    'We were second best. Recover, reset and we go again.',
  ],
  'match.reaction.manager.loss.poor': [
    'A poor day for you and for us. I expect a reaction in training.',
    'That was not you out there. I need to see a response this week.',
    'We were beaten and you were part of it. Training will be a test.',
    'Disappointing, from you most of all. Show me it was a one-off.',
  ],
  'match.reaction.fans.win.star': [
    'What a player! Sing the name!',
    'Worth the ticket price on their own. Brilliant!',
    'Best player on the pitch by a mile. More of that, please!',
    'Get them a new contract. What a performance!',
  ],
  'match.reaction.fans.win.solid': [
    'Three points and a decent shift. We will take that.',
    'Job done. Nobody stood out, nobody let us down.',
    'A win is a win. Happy journey home.',
    'Steady stuff. The points are what count.',
  ],
  'match.reaction.fans.win.poor': [
    'We won, no thanks to some of the performances out there.',
    'Three points, but a few of them were passengers today.',
    'Glad we won. Not glad about everyone in the shirt.',
    'Got away with one. Some of that was hard to watch.',
  ],
  'match.reaction.fans.draw.star': [
    'The best thing about a frustrating afternoon.',
    'One player turned up for a point today. Credit where it is due.',
    'A draw, but at least someone was trying to win it.',
    'Deserved a winner for that shift.',
  ],
  'match.reaction.fans.draw.solid': [
    'A point. Nothing more, nothing less.',
    'Fair enough result. We go again.',
    'Not bad, not great. A point on the board.',
    'Honours even. Could have been better, could have been worse.',
  ],
  'match.reaction.fans.draw.poor': [
    'Flat, all of it. We need more from everyone.',
    'A point we barely earned. Wake up!',
    'Dull, slow and lucky to get a draw.',
    'We paid good money for that? Come on.',
  ],
  'match.reaction.fans.loss.star': [
    'At least one player turned up today.',
    'The only one who looked bothered. Respect.',
    'Beaten, but that one gave everything.',
    'If the rest played like that, we would have won.',
  ],
  'match.reaction.fans.loss.solid': [
    'Disappointing. A long journey home.',
    'Not good enough as a team. Next week has to be better.',
    'Beaten fair and square. Heads up for the next one.',
    'Frustrating. We just did not have enough today.',
  ],
  'match.reaction.fans.loss.poor': [
    'Unacceptable. Some of them should not be wearing the shirt.',
    'Embarrassing. Who is going to take responsibility?',
    'Woeful. A few of them owe us an apology.',
    'That was painful to watch. Something has to change.',
  ],
  'match.reaction.manager.sent-off.second-yellow': [
    'Two bookings is carelessness. You left us a man short and you will miss the next one.',
    'You were already on a yellow. That second tackle was never worth it.',
    'Daft. One booking should have told you to stay on your feet.',
    'We played with ten because you could not keep your head. It cannot happen again.',
  ],
  'match.reaction.manager.sent-off.straight-red': [
    'Reckless. You let the team down, and now you are suspended. We will talk this week.',
    'That challenge was out of control. You have cost us, and you will sit out.',
    'A straight red. I will defend my players, but not that.',
    'We needed you on the pitch and you gave the referee no choice. We will talk on Monday.',
  ],
  'match.reaction.fans.sent-off.win': [
    'Got away with it. The ten held on, no thanks to that red.',
    'Ten men and still won. No thanks to the one who walked.',
    'Heroes, the lot of them. Except the one in the tunnel.',
    'Won it despite the red card. Lucky.',
  ],
  'match.reaction.fans.sent-off.draw': [
    'That red card cost us two points.',
    'We were winning that until the red. Pure indiscipline.',
    'Ten men, one point. Should have been three.',
    'A draw thrown away by a rush of blood.',
  ],
  'match.reaction.fans.sent-off.loss': [
    'Sent off and beaten. Not a day to remember.',
    'The red card killed us. Shocking.',
    'Ten men and no chance. Thanks for nothing.',
    'Lost the head, lost the game.',
  ],
};
const reactionText = ({ en: reactionTextEn } satisfies Translations<typeof reactionTextEn>)[LOCALE];

/** True when a report key has its own copy (tests use it to catch untranslated engine keys). */
export function hasReportLabel(key: string): boolean {
  return key in headlineText || key in reactionText;
}
/** A headline's copy (or a reaction's first line), else the match copy for the key. */
export function reportLabel(key: string): string {
  return headlineText[key] ?? reactionText[key]?.[0] ?? matchLabel(key);
}
/** Every line a touchline reaction can show: one for a key without variants. */
export function reactionVariants(key: string): readonly string[] {
  return reactionText[key] ?? [matchLabel(key)];
}

/** The report's own copy (release 1.0, step 5.1): the first screen, the story and the recap. */
const reportCopyEn = {
  meta: '{competition} · {date}',
  afterExtraTime: 'After extra time',
  penalties: '{club} win {score} on penalties',
  result: { win: 'Won', draw: 'Drew', loss: 'Lost' },
  xpConfirming: 'Confirming XP…',
  xpPending: 'Not yet recorded',
  levelLine: 'Level {level}',
  levelProgress: '{into} / {needed} XP',
  levelMax: 'Top level reached',
  levelLabel: 'Progress to level {next}',
  pointsToSpend: plurals({ one: 'Spend {count} point', other: 'Spend {count} points' }),
  skillPoints: plurals({ one: '{count} skill point', other: '{count} skill points' }),
  recording: 'Saving the result to your career…',
  recorded: 'Recorded to your career',
  unrecorded: 'Not yet recorded: the table, your statistics and your XP wait for it.',
  friendlyNote: 'A friendly: nothing is recorded to a career.',
  story: 'Match story',
  noGoals: 'No goals',
  goal: '{minute}′ {player}',
  goalAssist: '{minute}′ {player} · assist {assist}',
  unknownScorer: 'Goal',
  card: '{minute}′ {player} · {card}',
  cardKinds: { yellow: 'Yellow card', 'second-yellow': 'Second yellow', red: 'Red card' },
  scorersOf: 'Goals and cards: {club}',
  teamStats: 'Team statistics',
  stats: {
    shots: 'Shots',
    onTarget: 'On target',
    possession: 'Possession',
    xg: 'Expected goals (xG)',
  },
  statLine: '{label}: {home} {homeValue}, {away} {awayValue}',
  moments: 'Your moments',
  momentsSummary: plurals({
    one: 'You chose the best-value option in {best} of {count} moment.',
    other: 'You chose the best-value option in {best} of {count} moments.',
  }),
  momentsNone: 'You had no key moments in this match.',
  momentsHint:
    'A choice’s value is what it was worth in goals: its chance, and what success and failure each lead to.',
  momentMinute: '{minute}′',
  chose: 'You chose {choice}',
  chance: '{percent}% {meaning}',
  cameOff: 'Came off',
  didNotComeOff: 'Did not come off',
  bestValue: 'Best value',
  better: '{choice} would have been {percent}% {meaning} and worth more (+{gap} expected goals).',
  why: 'Why it went this way',
  performance: 'Your performance',
  ratingHow: 'How your rating was worked out',
  xpDecisions: 'Key decisions that came off',
  mapsShow: 'Heatmap, passes and shots',
  mapsLoading: 'Drawing the maps…',
  levelUp: {
    title: 'Level up!',
    body: 'You reached level {level}.',
    attribute: plurals({
      one: '+{count} attribute point to spend',
      other: '+{count} attribute points to spend',
    }),
    skill: plurals({
      one: '+{count} skill point to unlock a skill',
      other: '+{count} skill points to unlock skills',
    }),
    next: '{into} / {needed} XP to level {next}',
    spend: 'Spend points',
    skills: 'Unlock skills',
    close: 'Close',
  },
};
export const reportCopy = ({ en: reportCopyEn } satisfies Translations<typeof reportCopyEn>)[
  LOCALE
];
