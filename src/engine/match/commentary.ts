/**
 * Which commentary line an event gets in match-22 (release 1.0, step 5.5). A commentary key is
 * `match.commentary.<family>.<variant>` and a narration key `match.narration.<family>.<variant>`;
 * the copy is in src/i18n/commentary.ts and src/i18n/narration.ts.
 *
 * Under match-21 `line()` (events.ts) draws one of three variants on the commentary stream, and
 * narration one of four on its own stream; both stay exactly so, so saved sessions replay. Under
 * match-22:
 *
 * - each family has its own number of variants (`COMMENTARY_VARIANTS`, `NARRATION_VARIANTS_22`;
 *   a family not listed has `CONFIG.match.commentaryVariants`, three, or four for narration);
 * - a family's variants are used in a shuffled order without repeats within a match, then
 *   reshuffled (never repeating the last one), on new streams (`${seed}:lines22:…`);
 * - a line prefers a context family when its condition holds (late on, chasing the game, the
 *   player applauded off…) and it has unused variants left in this match (`CONTEXTS`);
 * - a missed shot names how it was missed (`missedShot`), and the pitch draws that.
 *
 * Adding lines for a new event kind is adding keys: call `line(session,
 * 'match.commentary.<family>', side)` where the event is logged, write the family's lines in
 * src/i18n/commentary.ts, and list the family in `COMMENTARY_VARIANTS` when it has more than
 * three. A context is one more entry in `CONTEXTS` with its own family of lines. Tests check that
 * every listed variant has copy (tests/match-commentary.test.ts).
 */
import { createRng } from '../rng';
import type { MatchSession } from './types';
import { MATCH_CONFIG as C } from './tuning';

/** Variants per commentary family under match-22 (others: `C.commentaryVariants`). */
export const COMMENTARY_VARIANTS: Readonly<Record<string, number>> = {
  // Shots outside the player's own choices: struck (scored, or at the player in goal), and
  // missed, by how (`missedShot`), with late-game lines for the side chasing it.
  attempt: 12,
  'attempt-held': 12,
  'attempt-parried': 8,
  'attempt-wide': 8,
  'attempt-over': 8,
  'attempt-blocked': 8,
  // Off the post or bar (step 5.3), the player's own shots included.
  'attempt-woodwork': 6,
  'attempt-held-late': 4,
  'attempt-wide-late': 4,
  // A chance the player's choice created, and a break the player's mistake allowed.
  chance: 8,
  counter: 8,
  card: 8,
  'card-early': 4,
  'card-late': 4,
  change: 10,
  'change-chasing': 5,
  'change-protecting': 5,
  substitution: 6,
  'substitution-applauded': 4,
  'halftime-goalless': 6,
  'halftime-level': 6,
  'halftime-lead': 8,
  'extra-time': 4,
  // The player's most frequent outcomes (docs/BALANCING.md, "Commentary").
  'pass.success': 8,
  'pass.failure': 8,
  'through.success': 8,
  'cross.success': 8,
  'shot.failure': 8,
  'placed.failure': 8,
  'dribble.success': 8,
  'dribble.failure': 8,
  'carry.success': 8,
  'tackle.success': 8,
  'jockey.success': 8,
  'recycle.success': 8,
  'track.success': 8,
  'intercept.success': 8,
  'parry.success': 8,
  'line.success': 8,
  'catch.success': 8,
  'claim.success': 8,
  'block.success': 8,
  'block.failure': 8,
  'corner.success': 8,
  'corner.failure': 8,
  // The occasions (release 1.0 step 5.4).
  stoppage: 4,
  'bench-on': 4,
  injury: 4,
  'injury-off': 4,
  'shootout-kick.scored': 6,
  'shootout-kick.saved': 5,
  'shootout-kick.missed': 4,
};
/** Variants per narration family under match-22 (others: four, as in match-21). */
export const NARRATION_VARIANTS_22: Readonly<Record<string, number>> = {
  recycle: 16,
  switch: 10,
  'cutback.shot': 10,
  'cross.found': 10,
  'cross.shot': 10,
  'cross.header.far': 8,
  cutback: 6,
  'long-ball': 8,
  'counter.release': 8,
};
const NARRATION_DEFAULT = 4;

/** What a line can know about the moment: the minute and the acting side's score. */
export interface LineContext {
  minute: number;
  /** From the acting side's view; undefined when the line has no side. */
  score?: 'level' | 'leading' | 'trailing';
  /** The selected player's live rating. */
  rating: number;
}
const late = (c: LineContext) => c.minute >= 80;
/** Context families a line prefers, first match first, while they have unused variants. */
export const CONTEXTS: Readonly<
  Record<string, readonly { family: string; when: (context: LineContext) => boolean }[]>
> = {
  'attempt-held': [
    {
      family: 'attempt-held-late',
      when: (c) => late(c) && c.score !== undefined && c.score !== 'leading',
    },
  ],
  'attempt-wide': [
    {
      family: 'attempt-wide-late',
      when: (c) => late(c) && c.score !== undefined && c.score !== 'leading',
    },
  ],
  card: [
    { family: 'card-late', when: late },
    { family: 'card-early', when: (c) => c.minute <= 15 },
  ],
  change: [
    { family: 'change-chasing', when: (c) => c.score === 'trailing' },
    { family: 'change-protecting', when: (c) => c.score === 'leading' && c.minute >= 70 },
  ],
  substitution: [{ family: 'substitution-applauded', when: (c) => c.rating >= 7 }],
};

export const commentaryVariants = (family: string): number =>
  COMMENTARY_VARIANTS[family] ?? C.commentaryVariants;
export const narrationVariants = (family: string): number =>
  NARRATION_VARIANTS_22[family] ?? NARRATION_DEFAULT;

/** A key's family: the key without its prefix and its variant. */
const familyOf = (key: string, prefix: string) =>
  key.startsWith(prefix) ? key.slice(prefix.length, key.lastIndexOf('.')) : undefined;

/** A shuffled order of `count` variants, drawn on its own stream. */
function order(stream: string, count: number): number[] {
  const rng = createRng(stream);
  const out = Array.from({ length: count }, (_, index) => index);
  for (let index = count - 1; index > 0; index--) {
    const swap = rng.int(0, index);
    [out[index], out[swap]] = [out[swap]!, out[index]!];
  }
  return out;
}
/**
 * The variant for a family's next use in a match: every variant once in a shuffled order, then
 * a new order whose first is never the last one before it.
 */
export function cycledVariant(stream: string, count: number, uses: number): number {
  const cycle = Math.floor(uses / count);
  const current = order(`${stream}:${cycle}`, count);
  if (cycle > 0 && count > 1 && current[0] === cycledVariant(stream, count, cycle * count - 1))
    [current[0], current[1]] = [current[1]!, current[0]!];
  return current[uses % count]!;
}

function contextOf(session: MatchSession, side?: 0 | 1): LineContext {
  const m = session.state.match;
  const margin = side === undefined ? undefined : m.score[side]! - m.score[1 - side]!;
  return {
    minute: m.minute,
    ...(margin === undefined
      ? {}
      : { score: margin === 0 ? 'level' : margin > 0 ? 'leading' : 'trailing' }),
    rating: session.state.stats.rating,
  };
}

const PREFIX = 'match.commentary.';
/**
 * A commentary key under match-22: the base family (`match.commentary.<family>`), or a context
 * family it prefers, with the family's next variant in this match.
 */
export function commentaryLine(session: MatchSession, base: string, side?: 0 | 1): string {
  const uses = new Map<string, number>();
  for (const event of session.state.match.events) {
    const family = familyOf(event.commentaryKey, PREFIX);
    if (family !== undefined) uses.set(family, (uses.get(family) ?? 0) + 1);
  }
  const baseFamily = base.slice(PREFIX.length);
  const context = contextOf(session, side);
  const preferred = (CONTEXTS[baseFamily] ?? []).find(
    (entry) =>
      entry.when(context) && (uses.get(entry.family) ?? 0) < commentaryVariants(entry.family),
  );
  const family = preferred?.family ?? baseFamily;
  const variant = cycledVariant(
    `${session.setup.seed}:lines22:${session.state.match.id}:${family}`,
    commentaryVariants(family),
    uses.get(family) ?? 0,
  );
  return `${PREFIX}${family}.${variant}`;
}

/** How a shot that does not go in is missed (match-22), drawn on its own stream. */
export type MissedShot = 'held' | 'parried' | 'wide' | 'over' | 'blocked' | 'woodwork';
export function missedShot(session: MatchSession): MissedShot {
  const weights = C.missedShot;
  const roll = createRng(
    `${session.setup.seed}:missed22:${session.state.match.id}:${session.state.match.events.length}`,
  ).next();
  let total = 0;
  const entries = Object.entries(weights) as [MissedShot, number][];
  const sum = entries.reduce((acc, [, weight]) => acc + weight, 0);
  for (const [kind, weight] of entries) {
    total += weight / sum;
    if (roll < total) return kind;
  }
  return entries[entries.length - 1]![0];
}

/** The half-time whistle's line under match-22: goalless, level, or one side ahead. */
export function halftimeLine(session: MatchSession): string {
  const [home, away] = session.state.match.score;
  return commentaryLine(
    session,
    `${PREFIX}halftime-${home + away === 0 ? 'goalless' : home === away ? 'level' : 'lead'}`,
  );
}

/**
 * A narration line's variant under match-22: the family's next one in this match, counting the
 * lines already narrated and those of the passage so far (`pending`).
 */
export function narrationVariant(
  session: MatchSession,
  family: string,
  pending: readonly { key: string }[],
): number {
  const prefix = 'match.narration.';
  let uses = 0;
  for (const line of session.state.narration) if (familyOf(line.key, prefix) === family) uses++;
  for (const line of pending) if (familyOf(line.key, prefix) === family) uses++;
  return cycledVariant(
    `${session.setup.seed}:narration22:${session.state.match.id}:${family}`,
    narrationVariants(family),
    uses,
  );
}
