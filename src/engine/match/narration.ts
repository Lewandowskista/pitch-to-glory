import type { Beat, BeatKind, PitchFlank, Point, ReplayFrame } from '../../model/domain';
import { createRng } from '../rng';
import type { MatchMotion, MatchSession, NarrationLine } from './types';

/**
 * Narration (redesign step M3, engine match-14): after a passage is choreographed, its beats
 * become lines that say what the pitch shows, such as "Okafor whips it in from the left… Vale
 * rises at the near post!" or "A raking switch from Hale finds Quinn on the right".
 *
 * Lines describe recognisable moves (beats tagged with a `pattern`): every move that leads to an
 * engine event (a shot, a decision) gets up to two lines, tied to that event by `eventId`; ordinary
 * build-up gets at most one line a passage, and only some of the time, so the feed is not spammy.
 * Variants are drawn on their own stream (`${seed}:narration:…`), never the commentary stream, so
 * narration cannot change an outcome or an existing commentary line. Params hold player ids (the
 * UI puts names in) and plain descriptors: `flank`, `zone`, `post`, `pattern`.
 */

/** Every narration family; each has `NARRATION_VARIANTS` lines (`match.narration.<family>.<n>`). */
export const NARRATION_FAMILIES = [
  'cross.header.near',
  'cross.header.far',
  'cross.shot',
  'cross.found',
  'cross.cut',
  'cutback.shot',
  'cutback',
  'cutback.cut',
  'through',
  'through.cut',
  'switch',
  'overlap',
  'long-ball',
  'counter.release',
  'counter.win',
  'counter.run',
  'recycle',
] as const;
export type NarrationFamily = (typeof NARRATION_FAMILIES)[number];
export const NARRATION_VARIANTS = 4;
/** Families whose `player` and `receiver` are opponents: a move cut out. */
export const CUT_FAMILIES: readonly NarrationFamily[] = ['cross.cut', 'cutback.cut', 'through.cut'];
/** How often a passage's ordinary build-up is narrated (once at most), by passage kind. */
const FILLER: Record<MatchMotion['kind'], number> = {
  kickoff: 0,
  minute: 0.45,
  moment: 1,
  outcome: 0.5,
};
/** Lines kept for a move that leads to an event. */
const PER_MOVE = 2;
/** Which line tells a move best, highest first. */
const PRIORITY: Record<NarrationFamily, number> = {
  'cross.header.near': 10,
  'cross.header.far': 10,
  'cross.shot': 10,
  'cutback.shot': 10,
  through: 8,
  'cross.found': 7,
  'cross.cut': 7,
  cutback: 7,
  'cutback.cut': 7,
  'through.cut': 6,
  switch: 6,
  overlap: 5,
  'long-ball': 4,
  'counter.release': 4,
  'counter.win': 3,
  'counter.run': 3,
  recycle: 1,
};
const PASSES: ReadonlySet<BeatKind> = new Set([
  'pass',
  'cross',
  'switch',
  'through',
  'long',
  'cutback',
]);
const STRIKES: ReadonlySet<BeatKind> = new Set(['shot', 'header']);

interface Candidate {
  frame: number;
  family: NarrationFamily;
  params: Record<string, string>;
  eventId?: string;
}

/**
 * The narration lines for a passage's keyframes, in order. `start` is how many lines the match
 * already has (it salts the variant stream, so every passage draws its own).
 */
export function narrate(
  session: MatchSession,
  frames: readonly ReplayFrame[],
  kind: MatchMotion['kind'],
  start: number,
): NarrationLine[] {
  const minute = session.state.match.minute;
  const home = new Set(session.setup.home.playerIds);
  const sideOf = (id: string) => (home.has(id) ? 0 : 1);
  /** Width and depth of a point for a player's team, facing the goal it attacks. */
  const frameOf = (id: string, point: Point) =>
    (sideOf(id) === 0) !== minute > 45
      ? { d: point.x, w: point.y }
      : { d: 100 - point.x, w: 100 - point.y };
  const flankOf = (id: string, point: Point): PitchFlank => {
    const w = frameOf(id, point).w;
    return w < 100 / 3 ? 'left' : w > 200 / 3 ? 'right' : 'centre';
  };
  const beatAt = (index: number): Beat | undefined => (index > 0 ? frames[index]?.beat : undefined);

  /** The strike that finishes off a ball to `receiver` within the next two beats. */
  const strikeAfter = (index: number, receiver: string) => {
    for (let k = index + 1; k <= index + 2 && k < frames.length; k++) {
      const beat = beatAt(k);
      if (!beat) return undefined;
      if (STRIKES.has(beat.kind) && beat.actorId === receiver) return { index: k, beat };
      if (beat.actorId !== receiver || !(beat.kind === 'carry' || beat.kind === 'dribble'))
        return undefined;
    }
    return undefined;
  };
  const describe = (first: number, last: number): Candidate[] => {
    const out: Candidate[] = [];
    let carried = false,
      passes = 0;
    for (let index = first; index <= last; index++) {
      const beat = beatAt(index)!;
      const frame = frames[index]!;
      const before = frames[index - 1]!;
      const pattern = beat.pattern!;
      const base = { pattern, zone: beat.zone };
      const add = (family: NarrationFamily, params: Record<string, string>, eventId?: string) =>
        out.push({
          frame: index,
          family,
          params: { ...base, ...params },
          ...(eventId ? { eventId } : {}),
        });
      const receiver = beat.receiverId;
      if (PASSES.has(beat.kind) && receiver) {
        passes++;
        const strike = strikeAfter(index, receiver);
        const tie = strike?.beat.eventId ?? beat.eventId;
        const pair = { player: beat.actorId, receiver };
        if (beat.kind === 'cross') {
          const reception = frameOf(beat.actorId, frame.ball).w;
          const post = (beat.flank === 'left') === reception < 50 ? 'near' : 'far';
          const family: NarrationFamily = !strike
            ? 'cross.found'
            : strike.beat.kind === 'header'
              ? post === 'near'
                ? 'cross.header.near'
                : 'cross.header.far'
              : 'cross.shot';
          add(family, { ...pair, flank: beat.flank, post }, tie);
        } else if (beat.kind === 'cutback')
          add(strike ? 'cutback.shot' : 'cutback', { ...pair, flank: beat.flank }, tie);
        else if (beat.kind === 'through')
          add(pattern === 'counter' ? 'counter.release' : 'through', pair, tie);
        else if (beat.kind === 'switch')
          add('switch', { ...pair, flank: flankOf(beat.actorId, frame.ball) }, tie);
        else if (pattern === 'overlap' && carried)
          add('overlap', { ...pair, flank: flankOf(beat.actorId, before.ball) }, tie);
        else if (beat.kind === 'long' && pattern === 'long-ball') add('long-ball', pair, tie);
        else if (pattern === 'counter') add('counter.release', pair, tie);
        else if (pattern === 'recycle' && passes === 2) add('recycle', pair, tie);
      } else if (pattern === 'counter') {
        // The regain that starts a counter, or a run with the ball when nobody is played in.
        const told = out.some((entry) => entry.family.startsWith('counter'));
        if ((beat.kind === 'intercept' || beat.kind === 'tackle') && !told)
          add('counter.win', { player: beat.actorId });
        else if ((beat.kind === 'carry' || beat.kind === 'dribble') && !told)
          add('counter.run', { player: beat.actorId });
      } else if (
        beat.kind === 'intercept' &&
        before.carrierId &&
        sideOf(before.carrierId) !== sideOf(beat.actorId)
      ) {
        // The move cut out: the ball it was going to be, from where it was played.
        const passer = before.carrierId;
        const from = frameOf(passer, before.ball);
        const to = frameOf(passer, frame.ball);
        const params = {
          player: passer,
          receiver: beat.actorId,
          flank: flankOf(passer, before.ball),
        };
        if (from.d > 78 && Math.abs(from.w - 50) > 17 && to.d > 76 && Math.abs(to.w - 50) <= 25)
          add(from.d >= 85 && pattern === 'cut-back' ? 'cutback.cut' : 'cross.cut', params);
        else if (pattern === 'through-ball' && to.d > from.d + 4) add('through.cut', params);
      }
      if (beat.kind === 'carry' || beat.kind === 'dribble') carried = true;
    }
    return out;
  };

  const rng = createRng(`${session.setup.seed}:narration:${minute}:${kind}:${start}`);
  const lines: NarrationLine[] = [];
  const emit = (candidate: Candidate) =>
    lines.push({
      minute,
      frame: candidate.frame,
      key: `match.narration.${candidate.family}.${rng.int(0, NARRATION_VARIANTS - 1)}`,
      params: candidate.params,
      ...(candidate.eventId ? { eventId: candidate.eventId } : {}),
    });
  let filler = false;
  for (let index = 1; index < frames.length;) {
    const pattern = beatAt(index)?.pattern;
    if (!pattern) {
      index++;
      continue;
    }
    let last = index;
    while (last + 1 < frames.length && beatAt(last + 1)?.pattern === pattern) last++;
    const candidates = describe(index, last);
    const ranked = [...candidates].sort(
      (a, b) => PRIORITY[b.family] - PRIORITY[a.family] || a.frame - b.frame,
    );
    // A move that ends in a strike (or plays a decision) is told, tied to that event.
    const next = beatAt(last + 1);
    const strike = next?.eventId && STRIKES.has(next.kind) ? next.eventId : undefined;
    const tied = !!strike || candidates.some((candidate) => candidate.eventId);
    if (tied)
      for (const candidate of ranked.slice(0, PER_MOVE).sort((a, b) => a.frame - b.frame))
        emit(candidate.eventId || !strike ? candidate : { ...candidate, eventId: strike });
    else if (ranked.length && !filler) {
      const best = ranked[0]!;
      const rate = FILLER[kind] * (best.family === 'recycle' ? 0.5 : 1);
      if (rng.next() < rate) {
        emit(best);
        filler = true;
      }
    }
    index = last + 1;
  }
  return lines;
}
