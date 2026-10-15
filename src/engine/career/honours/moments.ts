import type { Hex, MatchEvent, Moment, Point, ReplayFrame, World } from '../../../model/domain';
import type { MatchSession } from '../../match/types';
import { CONFIG } from '../../config';
import { nextId } from '../market/records';
import { today } from '../market/rules';
import { chooseMatchKits } from '../../assets/clash';
import { CLIP_FRAMES, encodeClip, type Clip, type ClipFrame, type ClipPlayer } from './clip';

export * from './clip';

/**
 * Moments (AGENTS.md §9.7): memorable goals cut from a match into a compact clip of
 * keyframes (ball and 22 players, with the ball's flight, who has it and each action of the
 * move, plus shirt numbers and the names of those involved), stored in the world and
 * shareable as a link that carries the clip and the match seed, so anyone can replay it
 * without the save.
 */
const MO = CONFIG.career.honours.moments;
/** A keyframe without an action (a pause for a decision) plays for at most this long. */
const PAUSE_MS = 800;
/** Steps of the fallback clip, cut from per-minute snapshots. */
const FALLBACK_MS = 900;
/** Names a clip carries: the scorer first, then the latest actors of the move. */
const NAMED = 8;

function framePoints(frame: ReplayFrame): Point[] {
  return frame.players.slice(0, 22).map((player) => ({ ...player.point }));
}
const surname = (name: string) => name.trim().split(/\s+/).at(-1) ?? name;
/** Peak height of a lofted ball between two keyframes, as the match replay draws it. */
function apexOf(from: Point, to: Point, motion: ReplayFrame['ballMotion']): number {
  if (motion !== 'air' && motion !== 'over') return 0;
  const reach = Math.min(1, (Math.abs(to.x - from.x) + Math.abs(to.y - from.y) * 0.65) / 30);
  return reach * (motion === 'over' ? 1.3 : 1);
}
/** Sides, shirt numbers and the names of the scorer and everyone who acts in the move. */
function clipPlayers(
  session: MatchSession,
  frames: readonly ReplayFrame[],
  scorerId: string,
): ClipPlayer[] {
  const ids = frames[0]!.players.slice(0, 22).map((player) => player.id);
  const home = new Set(session.setup.home.playerIds);
  const named = new Set([scorerId]);
  for (const frame of [...frames].reverse())
    if (frame.beat && ids.includes(frame.beat.actorId)) named.add(frame.beat.actorId);
  const keep = new Set([...named].slice(0, NAMED));
  return ids.map((id) => {
    const player = session.setup.players[id];
    const number = player?.squadNumber;
    return {
      away: !home.has(id),
      number: typeof number === 'number' && number >= 1 && number <= 99 ? number : null,
      ...(player && keep.has(id) ? { name: surname(player.name) } : {}),
    };
  });
}
/** A highlight's keyframes as a v2 clip: timing, ball flight, carrier and beats. */
function highlightClip(
  session: MatchSession,
  frames: readonly ReplayFrame[],
  selected: number,
  playerId: string,
  trim: [Hex, Hex],
): Clip {
  const indexIn = (frame: ReplayFrame, id: string | null | undefined) => {
    const index = id ? frame.players.findIndex((player) => player.id === id) : -1;
    return index >= 0 && index <= 21 ? index : null;
  };
  const pattern = [...frames].reverse().find((frame) => frame.beat?.pattern)?.beat?.pattern;
  return {
    selected,
    players: clipPlayers(session, frames, playerId),
    trim,
    ...(pattern ? { pattern } : {}),
    frames: frames.map((frame, index) => {
      const previous = frames[index - 1];
      const step = previous ? Math.max(0, frame.timeMs - previous.timeMs) : 0;
      const clipFrame: ClipFrame = {
        ball: { ...frame.ball },
        players: framePoints(frame),
        ms: frame.beat ? step : Math.min(step, PAUSE_MS),
        carrier: indexIn(frame, frame.carrierId),
      };
      if (frame.ballMotion) clipFrame.motion = frame.ballMotion;
      const apex = previous ? apexOf(previous.ball, frame.ball, frame.ballMotion) : 0;
      if (apex) clipFrame.apex = apex;
      if (frame.beat)
        clipFrame.beat = { kind: frame.beat.kind, actor: indexIn(frame, frame.beat.actorId) };
      return clipFrame;
    }),
  };
}
/**
 * Keyframes of a goal: the engine's recorded move (from the first beat of its build-up),
 * strike and celebration when present, otherwise the minute before, the strike, and the
 * ball in the net.
 */
function cutClip(
  session: MatchSession,
  event: MatchEvent,
  playerId: string,
  trim: [Hex, Hex],
): Clip | null {
  const highlight = session.state.highlights?.find((entry) => entry.eventId === event.id);
  if (
    highlight &&
    highlight.frames.length >= 2 &&
    highlight.frames.length <= CLIP_FRAMES[2] &&
    highlight.frames.every((frame) => frame.players.length >= 22)
  ) {
    const selected = highlight.frames[0]!.players.findIndex((player) => player.id === playerId);
    if (selected >= 0 && selected <= 21)
      return highlightClip(session, highlight.frames, selected, playerId, trim);
  }
  const frames = session.state.frames;
  const at = [...frames].reverse().find((frame) => frame.timeMs <= event.minute * 60000);
  const before = [...frames].reverse().find((frame) => frame.timeMs < (at?.timeMs ?? 0));
  if (!at || at.players.length < 22) return null;
  const selected = at.players.findIndex((player) => player.id === playerId);
  if (selected < 0 || selected > 21) return null;
  const players = framePoints(at);
  const strikeFrom = event.point ?? players[selected]!;
  players[selected] = { ...strikeFrom };
  const keyframes: ClipFrame[] = [];
  if (before && before.players.length >= 22)
    keyframes.push({ ball: { ...before.ball }, players: framePoints(before), ms: 0 });
  keyframes.push({
    ball: { ...strikeFrom },
    players,
    ms: keyframes.length ? FALLBACK_MS : 0,
    carrier: selected,
  });
  keyframes.push({
    ball: { ...(event.endPoint ?? strikeFrom) },
    players,
    ms: FALLBACK_MS,
    motion: 'shot',
    carrier: null,
    beat: { kind: 'shot', actor: selected },
  });
  return { selected, frames: keyframes, players: clipPlayers(session, [at], playerId), trim };
}

/**
 * Save memorable goals by the career player from a committed match: a goal in a final,
 * a late winner or equaliser, a hat-trick, or a long-odds key-moment finish.
 */
export function captureMoments(world: World, session: MatchSession, importance: number): string[] {
  const career = world.career!;
  const state = session.state;
  const ownHome =
    session.setup.home.id === world.players[career.playerId]!.clubId ||
    session.setup.home.playerIds.includes(career.playerId);
  const own = ownHome ? 0 : 1;
  const final = state.match.score;
  let ownGoals = 0;
  let theirGoals = 0;
  let scored = 0;
  const saved: string[] = [];
  const kits = chooseMatchKits(session.setup.home, session.setup.away);
  for (const event of state.match.events) {
    if (event.kind !== 'goal') continue;
    const mine = event.teamId === (ownHome ? session.setup.home.id : session.setup.away.id);
    if (mine) ownGoals++;
    else theirGoals++;
    if (event.playerId !== career.playerId) continue;
    scored++;
    const late = event.minute >= MO.lateMinute;
    const kind: Moment['kind'] | null =
      importance >= 1.5
        ? 'final'
        : late && ownGoals === theirGoals + 1 && final[own]! > final[1 - own]!
          ? 'winner'
          : late && ownGoals === theirGoals && final[own] === final[1 - own]
            ? 'equalizer'
            : scored === 3
              ? 'hat-trick'
              : event.outcome && event.outcome.probability <= MO.wonderProbability
                ? 'wonder'
                : null;
    if (!kind || saved.length >= 2) continue;
    const clip = cutClip(session, event, career.playerId, [
      kits.home.colors[1],
      kits.away.colors[1],
    ]);
    if (!clip) continue;
    const moment: Moment = {
      id: nextId(world, 'moment'),
      playerId: career.playerId,
      date: today(world),
      kind,
      minute: event.minute,
      scorerName: world.players[career.playerId]!.name,
      home: { name: session.setup.home.name, color: kits.home.colors[0] },
      away: { name: session.setup.away.name, color: kits.away.colors[0] },
      score: [final[0]!, final[1]!],
      seed: session.setup.seed,
      clip: encodeClip(clip),
    };
    world.moments.push(moment);
    saved.push(moment.id);
  }
  trimMoments(world, career.playerId);
  return saved;
}

/**
 * Keep a player's most recent Moments within the limit. Chronicle entries keep their story
 * but no longer point at a clip that has gone; they are replaced, not edited, because worlds
 * share unchanged records.
 */
export function trimMoments(world: World, playerId: string): void {
  const mine = world.moments.filter((moment) => moment.playerId === playerId);
  if (mine.length <= MO.limit) return;
  const drop = new Set(mine.slice(0, mine.length - MO.limit).map((moment) => moment.id));
  world.moments = world.moments.filter((moment) => !drop.has(moment.id));
  world.chronicle = world.chronicle.map((entry) =>
    entry.momentId && drop.has(entry.momentId) ? { ...entry, momentId: null } : entry,
  );
}
