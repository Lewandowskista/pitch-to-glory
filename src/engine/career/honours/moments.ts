import type { MatchEvent, Moment, Point, ReplayFrame, World } from '../../../model/domain';
import type { MatchSession } from '../../match/types';
import { CONFIG } from '../../config';
import { nextId } from '../market/records';
import { today } from '../market/rules';
import { chooseMatchKits } from '../../assets/clash';
import { encodeClip, type Clip, type ClipFrame } from './clip';

export * from './clip';

/**
 * Moments (AGENTS.md §9.7): memorable goals cut from a match into a compact clip of
 * keyframes (ball and 22 players), stored in the world and shareable as a link that carries
 * the clip and the match seed, so anyone can replay it without the save.
 */
const MO = CONFIG.career.honours.moments;
function framePoints(frame: ReplayFrame): Point[] {
  return frame.players.slice(0, 22).map((player) => ({ ...player.point }));
}
/** Keyframes around a goal: the minute before, the strike, and the ball in the net. */
function cutClip(session: MatchSession, event: MatchEvent, playerId: string): Clip | null {
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
    keyframes.push({ ball: { ...before.ball }, players: framePoints(before) });
  keyframes.push({ ball: { ...strikeFrom }, players });
  keyframes.push({ ball: { ...(event.endPoint ?? strikeFrom) }, players });
  return { selected, frames: keyframes };
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
    const clip = cutClip(session, event, career.playerId);
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
  const mine = world.moments.filter((moment) => moment.playerId === career.playerId);
  if (mine.length > MO.limit) {
    const drop = new Set(mine.slice(0, mine.length - MO.limit).map((moment) => moment.id));
    world.moments = world.moments.filter((moment) => !drop.has(moment.id));
  }
  return saved;
}
