import { matchLabel } from './match';

/*
 * Copy that only the post-match report shows: the morning headline and the touchline
 * reactions. It lives apart from the live match copy (match.ts), so the match screen loads it
 * with the report rather than before kickoff.
 */
/**
 * Morning headlines (engine match-12): three per story of the match. Parameters: {player},
 * {club}, {opponent}, {score} (own goals first), {goals}, {assists}.
 */
const headlines: Record<string, [string, string, string]> = {
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
const headlineText: Record<string, string> = Object.fromEntries(
  Object.entries(headlines).flatMap(([kind, lines]) =>
    lines.map((text, index) => [`match.headline.${kind}.${index}`, text]),
  ),
);
/** Touchline reactions (engine match-12) by result and how the player played. */
const reactionText: Record<string, string> = {
  'match.reaction.manager.win.star':
    'Outstanding. You won us that game, and everyone in the dressing room knows it.',
  'match.reaction.manager.win.solid': 'Good win, good shift. Keep doing the simple things well.',
  'match.reaction.manager.win.poor':
    'We got the points, but I need more from you. The team carried you today.',
  'match.reaction.manager.draw.star':
    'You gave everything and deserved more. That level, every week.',
  'match.reaction.manager.draw.solid': 'A point is a point. We go again next week.',
  'match.reaction.manager.draw.poor':
    'That was not good enough from you. We needed more on the ball.',
  'match.reaction.manager.loss.star':
    'Hard to take, but your performance is the one thing I am pleased with.',
  'match.reaction.manager.loss.solid': 'We fell short as a team. Watch it back and learn from it.',
  'match.reaction.manager.loss.poor':
    'A poor day for you and for us. I expect a reaction in training.',
  'match.reaction.fans.win.star': 'What a player! Sing the name!',
  'match.reaction.fans.win.solid': 'Three points and a decent shift. We will take that.',
  'match.reaction.fans.win.poor': 'We won, no thanks to some of the performances out there.',
  'match.reaction.fans.draw.star': 'The best thing about a frustrating afternoon.',
  'match.reaction.fans.draw.solid': 'A point. Nothing more, nothing less.',
  'match.reaction.fans.draw.poor': 'Flat, all of it. We need more from everyone.',
  'match.reaction.fans.loss.star': 'At least one player turned up today.',
  'match.reaction.fans.loss.solid': 'Disappointing. A long journey home.',
  'match.reaction.fans.loss.poor': 'Unacceptable. Some of them should not be wearing the shirt.',
  'match.reaction.manager.sent-off.second-yellow':
    'Two bookings is carelessness. You left us a man short and you will miss the next one.',
  'match.reaction.manager.sent-off.straight-red':
    'Reckless. You let the team down, and now you are suspended. We will talk this week.',
  'match.reaction.fans.sent-off.win': 'Got away with it. The ten held on, no thanks to that red.',
  'match.reaction.fans.sent-off.draw': 'That red card cost us two points.',
  'match.reaction.fans.sent-off.loss': 'Sent off and beaten. Not a day to remember.',
};

const reportText: Record<string, string> = { ...headlineText, ...reactionText };
/** True when a report key has its own copy (tests use it to catch untranslated engine keys). */
export function hasReportLabel(key: string): boolean {
  return key in reportText;
}
/** A headline or reaction key's copy, else the match copy for the key. */
export function reportLabel(key: string): string {
  return reportText[key] ?? matchLabel(key);
}
