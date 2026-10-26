import type { MatchSession, NarrationLine } from '../engine/match/types';
import { LOCALE, type Translations } from './locale';

/**
 * Narration copy (engine match-14, redesign step M3): what the pitch shows, in the voice of a
 * knowledgeable companion. The engine picks a family and a variant (`match.narration.<family>.<n>`,
 * see src/engine/match/narration.ts) and stores player ids; `narrationFeed` turns the session's
 * lines into display text. Only the match screen imports this module, so the copy loads with
 * the match chunk.
 *
 * `{player}` plays the ball and `{receiver}` gets it, except in the `…cut` families, where
 * `{receiver}` is the opponent who cut it out.
 */
/** Four lines a family in match-21; match-22 uses more for some (`narrationVariants`). */
type Variants = readonly string[];
const linesEn: Record<string, Variants> = {
  'cross.header.near': [
    '{player} whips it in from the {flank}… {receiver} rises at the near post!',
    'Lovely delivery from {player} on the {flank}, and {receiver} attacks the near post!',
    '{player} curls one in from the {flank}… {receiver} gets in front of the defender at the near post!',
    'In it comes from {player} on the {flank}… {receiver} darts to the near post and gets a head on it!',
  ],
  'cross.header.far': [
    '{player} hangs one up from the {flank}… {receiver} climbs at the far post!',
    '{player} picks out the far post from the {flank}, and {receiver} is there to meet it!',
    'A deep cross from {player} on the {flank}… {receiver} rises above everyone at the back stick!',
    '{player} floats it to the far post… {receiver} has peeled away from the marker and heads!',
    'An inviting ball from {player} on the {flank} drifts to the far post, where {receiver} is waiting!',
    '{player} clips it beyond the last defender… {receiver} attacks it at the far post!',
    'Over everyone from {player} on the {flank}, and {receiver} meets it at the far stick!',
    'The delivery from {player} is aimed at the far post, and {receiver} gets above the full-back!',
  ],
  'cross.shot': [
    '{player} drills it low across from the {flank}… {receiver} meets it first time!',
    '{player} fizzes a ball across the six-yard box from the {flank}, and {receiver} is sliding in!',
    'Low cross from {player} on the {flank}… {receiver} gets on the end of it!',
    '{player} whips it across the face from the {flank}… {receiver} strikes on the run!',
    'A driven ball from {player} on the {flank} skids across the box… {receiver} is on it!',
    '{player} gets to the line on the {flank} and fires it in low; {receiver} connects!',
    '{receiver} has peeled off the marker, and the low ball from {player} on the {flank} finds the run!',
    'Hard and low from {player} down the {flank}… {receiver} throws a boot at it!',
    '{player} cuts a low cross back from the {flank}, and {receiver} meets it on the half-volley!',
    'Pace on the ball from {player} on the {flank}; {receiver} only has to get a touch!',
  ],
  'cross.found': [
    '{player} picks out {receiver} with a cross from the {flank}.',
    'Good ball in from {player} on the {flank}; {receiver} brings it down in the box.',
    '{player} finds {receiver} from the {flank}, but there’s no clear sight of goal.',
    'Cross from {player} on the {flank}, and {receiver} gathers it in the area.',
    '{player} picks out {receiver} in the area, though the defenders close quickly.',
    'From the {flank}, {player} clips it to {receiver}, who cushions it down.',
    'Measured from {player} out on the {flank}: {receiver} takes it on the chest in the box.',
    '{receiver} is the target, and {player} finds the run from the {flank}. Bodies everywhere.',
    '{player} plays a clever ball in from the {flank}, and {receiver} keeps it.',
    '{receiver} finds a pocket of space, and {player} spots it from the {flank}.',
  ],
  'cross.cut': [
    '{player} swings it in from the {flank}, but {receiver} heads it clear.',
    'In comes the cross from {player}… {receiver} is first to it and clears.',
    '{player} tries to pick someone out from the {flank}; {receiver} gets there first.',
    'Dangerous ball from {player} on the {flank}, but {receiver} deals with it.',
  ],
  'cutback.shot': [
    '{player} gets to the byline and cuts it back… {receiver} hits it first time!',
    '{player} goes all the way to the byline on the {flank} and pulls it back for {receiver}!',
    'Brilliant from {player}: to the byline, a low ball back… and {receiver} arrives on the penalty spot!',
    '{player} skips past the full-back on the {flank} and cuts it back to {receiver}!',
    '{player} beats the defender to the byline on the {flank} and squares it… {receiver} meets it!',
    'Byline, pull-back, strike: {player} tees up {receiver}!',
    '{player} drags it back from the edge of the six-yard box, and {receiver} arrives to hit it!',
    'All the way to the line from {player}, and the pull-back is perfect for {receiver}!',
    '{player} gets round the back on the {flank}, and the ball across finds {receiver}!',
    'A low pull-back from {player}, and {receiver} is first to it!',
  ],
  cutback: [
    '{player} pulls it back from the byline for {receiver}.',
    '{player} reaches the byline on the {flank} and finds {receiver} with the cut-back.',
    'Cut-back from {player}, and {receiver} takes it in the area.',
    '{player} digs it out from the byline and rolls it back to {receiver}.',
    'Patience from {player} at the byline, and the ball back finds {receiver}.',
    '{player} pulls it back along the ground, and {receiver} gathers it on the edge of the area.',
  ],
  'cutback.cut': [
    '{player} gets to the byline, but {receiver} cuts out the pull-back.',
    '{player} looks to cut it back from the {flank}; {receiver} reads it and clears.',
    'Good work from {player} on the {flank}, but {receiver} intercepts the cut-back.',
    '{player} pulls it back, and {receiver} gets a toe in to clear.',
  ],
  through: [
    '{player} slides {receiver} in behind!',
    'A defence-splitting ball from {player} puts {receiver} through!',
    '{player} threads it between the centre-backs, and {receiver} is away!',
    'Lovely weight on the pass from {player}… {receiver} has run in behind!',
  ],
  'through.cut': [
    '{player} looks for the ball in behind, but {receiver} reads it.',
    '{player} tries to thread one through; {receiver} is alert to it.',
    'Ambitious from {player} over the top, but {receiver} sweeps up.',
    '{player} goes for the killer ball, but {receiver} cuts it out.',
  ],
  switch: [
    'A raking switch from {player} finds {receiver} on the {flank}.',
    '{player} sprays it wide to {receiver} on the {flank}. Lovely change of play.',
    '{player} switches the play, and {receiver} has acres on the {flank}.',
    'Big diagonal from {player}, and {receiver} controls it out on the {flank}.',
    '{player} lifts it across the pitch, and {receiver} brings it down on the {flank}.',
    'From one wing to the other: {player} finds {receiver} on the {flank}.',
    'Wonderful vision from {player}, picking out {receiver} wide on the {flank}.',
    '{player} changes the angle with one pass, and {receiver} is free on the {flank}.',
    'The ball is moved quickly: {player} to {receiver}, out on the {flank}.',
    '{player} spots {receiver} unmarked on the {flank} and finds them with a long pass.',
  ],
  overlap: [
    '{receiver} bombs on outside {player} down the {flank}.',
    '{player} holds it up, and here comes {receiver} on the overlap.',
    '{player} waits for the overlap and slips {receiver} in down the {flank}.',
    'Overlapping run from {receiver}, and {player} finds it down the {flank}.',
  ],
  'long-ball': [
    '{player} goes long for {receiver}, who flicks it on.',
    'Straight down the middle from {player}; {receiver} wins the header and knocks it down.',
    '{player} launches it forward, and {receiver} holds it up well.',
    'Route one from {player}, and {receiver} gets a head on it.',
    '{player} skips midfield altogether, and {receiver} battles for it.',
    'A long ball from {player}, and {receiver} wins the first contact.',
    '{player} looks for {receiver} early, and the knock-down drops kindly.',
    'Straight up to {receiver} from {player}, and the ball is laid off.',
  ],
  'counter.release': [
    'They break! {player} releases {receiver} at pace.',
    'Quick as you like, {player} sends {receiver} away on the counter.',
    '{player} spots the run, and {receiver} is away on the break!',
    'This is on! {player} plays it early for {receiver}.',
    'In a flash, {player} has {receiver} running at the defence.',
    '{player} looks up and sends {receiver} clear on the break!',
    'Two passes and they are away: {player} finds {receiver} in space.',
    '{player} launches the counter with a ball for {receiver}.',
  ],
  'counter.win': [
    '{player} wins it, and they’re away on the break!',
    'Turnover! {player} nicks it and they go.',
    '{player} steals possession, and they spring forward.',
    'Won back by {player}, and this could be a chance on the counter.',
  ],
  'counter.run': [
    '{player} drives forward on the break.',
    '{player} picks it up and charges into the space.',
    'Space ahead of {player}, and the counter is on.',
    '{player} carries it at pace with support either side.',
  ],
  recycle: [
    'Patient from them: {player} goes back to {receiver}, and they start again.',
    '{player} recycles it to {receiver}. No need to force it.',
    'Back and across from {player} to {receiver}, keeping hold of it.',
    '{player} turns it back to {receiver}, and they probe for an opening.',
    '{player} sees nothing on and plays it back to {receiver}.',
    'No way through yet, so {player} rolls it back to {receiver}.',
    '{player} and {receiver} pass it between them, waiting for a gap.',
    'Composed from {player}: a short ball back to {receiver}, and they reset.',
    'They keep possession: {player} to {receiver}, nothing hurried.',
    '{player} shields it and lays it back for {receiver}.',
    'Around the back it goes, {player} finding {receiver}.',
    'The press is waiting, so {player} goes the safe way, back to {receiver}.',
    'Nothing on further forward, so {player} returns it to {receiver}.',
    '{player} turns back towards their own goal and finds {receiver}.',
    'A sideways ball from {player} to {receiver} as they look for the opening.',
    'The tempo drops: {player} gives it back to {receiver}.',
  ],
};
const lines = ({ en: linesEn } satisfies Translations<typeof linesEn>)[LOCALE];
/** Words for the descriptors the engine stores. */
const flanksEn: Record<string, string> = { left: 'left', right: 'right', centre: 'middle' };
const flanks = ({ en: flanksEn } satisfies Translations<typeof flanksEn>)[LOCALE];
const text: Record<string, string> = Object.fromEntries(
  Object.entries(lines).flatMap(([family, variants]) =>
    variants.map((line, index) => [`match.narration.${family}.${index}`, line]),
  ),
);

/** True when a narration key has its own copy (tests use it to catch untranslated keys). */
export function hasNarrationLabel(key: string): boolean {
  return key in text;
}
/** Surname for the commentary voice, keeping particles such as "van" or "da". */
export function narrationName(name: string): string {
  const parts = name.trim().split(/\s+/);
  let first = parts.length - 1;
  while (first > 1 && /^[a-z]/.test(parts[first - 1]!)) first--;
  return parts.slice(Math.max(0, first)).join(' ');
}
/** One line's text, with names from `nameOf` (a player id to a display name). */
export function narrationText(line: NarrationLine, nameOf: (id: string) => string): string {
  const template = text[line.key] ?? '';
  const filled = template.replace(/\{(\w+)\}/g, (token, key: string) => {
    const value = line.params[key];
    if (value === undefined) return token;
    if (key === 'player' || key === 'receiver') return nameOf(value);
    if (key === 'flank') return flanks[value] ?? value;
    return value;
  });
  return filled.charAt(0).toUpperCase() + filled.slice(1);
}
export interface NarrationEntry {
  /** Position in `state.narration`: a stable React key. */
  index: number;
  minute: number;
  /** The keyframe it describes in the passage it came from. */
  frame: number;
  text: string;
  /** The engine event the move led to: show the line just before that event's commentary. */
  eventId?: string;
  /** The team that has the ball in the line (0 home, 1 away). */
  side: 0 | 1;
  /** The line belongs to the passage now in `state.motion`. */
  current: boolean;
}
/**
 * The session's narration in order, ready to show. Lines of the passage now playing
 * (`state.motion`) appear once its playback reaches their keyframe: pass `shown`, the index of
 * the last keyframe of `state.motion.frames` played so far; leave it out to show every line.
 */
export function narrationFeed(
  session: Pick<MatchSession, 'setup' | 'state'>,
  shown?: number,
): NarrationEntry[] {
  const players = session.setup.players;
  const home = new Set(session.setup.home.playerIds);
  const start = session.state.motion.narrationStart ?? session.state.narration.length;
  const nameOf = (id: string) => {
    const name = players[id]?.name;
    return name ? narrationName(name) : id;
  };
  const entries: NarrationEntry[] = [];
  session.state.narration.forEach((line, index) => {
    const current = index >= start;
    if (current && shown !== undefined && line.frame > shown) return;
    const owner = line.params.player ?? '';
    entries.push({
      index,
      minute: line.minute,
      frame: line.frame,
      text: narrationText(line, nameOf),
      ...(line.eventId ? { eventId: line.eventId } : {}),
      side: home.has(owner) ? 0 : 1,
      current,
    });
  });
  return entries;
}
