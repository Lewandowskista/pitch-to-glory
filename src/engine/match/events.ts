/**
 * The match's event log: commentary keys, events with their pitch points, shots with their
 * expected goals, goals, and the finisher a chance falls to.
 */
import type { DecisionOutcome, MatchEvent } from '../../model/domain';
import { createRng, type Rng } from '../rng';
import { rules22, type MatchSession } from './types';
import { MATCH_CONFIG as C } from './tuning';
import { commentaryLine, missedShot } from './commentary';
import { clamp, round6 } from './decisions';
import { addRating, goalCredit } from './report';
import { settleMiss } from './shots';
import { ATTACKERS, attacksRight, onPitch, sideTeam } from './shared';

/**
 * A commentary key for the next event: `base` (`match.commentary.<family>`) and a variant. Under
 * match-22 the line follows the acting `side`'s situation and cycles through the family's
 * variants without repeats (commentary.ts); match-21 draws one of three, as it always did.
 */
export function line(session: MatchSession, base: string, side?: 0 | 1): string {
  if (rules22(session.setup)) return commentaryLine(session, base, side);
  const salt = `${session.state.match.id}:${session.state.match.events.length}`;
  return `${base}.${createRng(`${session.setup.seed}:commentary:${salt}`).int(0, C.commentaryVariants - 1)}`;
}
export function event(
  session: MatchSession,
  kind: MatchEvent['kind'],
  teamId: string,
  playerId: string | null,
  commentaryKey: string,
  outcome: DecisionOutcome | null = null,
  target?: number,
): MatchEvent {
  const m = session.state.match;
  const currentFrame = session.state.frames[session.state.frames.length - 1]!;
  const point = {
    ...(currentFrame.players.find((player) => player.id === playerId)?.point ?? currentFrame.ball),
  };
  const direction = attacksRight(session, teamId, m.minute) ? 1 : -1;
  let endPoint: { x: number; y: number } | undefined;
  if (kind === 'pass') {
    const team = teamId === session.setup.home.id ? m.home : m.away;
    const receivers = currentFrame.players.filter(
      (player) =>
        player.id !== playerId &&
        team.starterIds.includes(player.id) &&
        session.setup.players[player.id]!.primaryPosition !== 'GK',
    );
    // Squared distances avoid engine-dependent square roots in replayed ordering.
    const distance = (player: (typeof receivers)[number]) => {
      const dx = player.point.x - point.x,
        dy = player.point.y - point.y;
      return dx * dx + dy * dy + (dx * direction < 0 ? 400 : 0);
    };
    receivers.sort((a, b) => distance(a) - distance(b) || (a.id < b.id ? -1 : 1));
    endPoint = {
      ...(receivers[0]?.point ?? { x: clamp(point.x + direction * 12, 0, 100), y: point.y }),
    };
  } else if (kind === 'shot' || kind === 'goal')
    endPoint = { x: direction > 0 ? 100 : 0, y: target ?? 50 };
  else if (kind === 'dribble') endPoint = { x: clamp(point.x + direction * 9, 0, 100), y: point.y };
  const name = playerId ? session.setup.players[playerId]?.name : undefined;
  const created: MatchEvent = {
    id: `${m.id}:event:${m.events.length}`,
    minute: m.minute,
    kind,
    teamId,
    playerId,
    point,
    ...(endPoint ? { endPoint } : {}),
    commentaryKey,
    ...(name ? { commentaryParams: { player: name } } : {}),
    outcome,
  };
  m.events.push(created);
  return created;
}
/** A shot's chance of a goal, kept on the event and in the side's expected goals (match-14). */
export function addXg(session: MatchSession, side: number, shot: MatchEvent, xg: number): void {
  const stats = session.state.stats;
  shot.xg = round6(xg);
  stats.xg =
    side === 0
      ? [round6(stats.xg[0] + shot.xg), stats.xg[1]]
      : [stats.xg[0], round6(stats.xg[1] + shot.xg)];
}
/**
 * A shot recorded with its commentary. `scored` (known before the line under match-22) turns a
 * missed `attempt` into a line that says how it was missed, which the pitch then draws.
 */
export function recordShot(
  session: MatchSession,
  side: number,
  id: string,
  key: string,
  xg: number,
  target?: number,
  scored?: boolean,
) {
  if (side === 0) session.state.stats.homeShots++;
  else session.state.stats.awayShots++;
  if (id === session.setup.selectedPlayerId) session.state.stats.shots++;
  const missed =
    rules22(session.setup) && scored === false && key === 'match.commentary.attempt'
      ? missedShot(session)
      : undefined;
  const family = missed ? `${key}-${missed}` : key;
  const shot = event(
    session,
    'shot',
    sideTeam(session, side),
    id,
    line(session, family, side as 0 | 1),
    null,
    target,
  );
  addXg(session, side, shot, xg);
  // How it was missed, as a result and (the woodwork) a statistic (match-22, step 5.3).
  if (missed) settleMiss(session, shot, missed);
  return shot;
}
export function goal(session: MatchSession, side: number, playerId: string, target?: number): void {
  const m = session.state.match;
  m.score[side]!++;
  // In the closing minutes a goal that levels the game or puts a side ahead is called as such.
  const margin = m.score[side]! - m.score[1 - side]!;
  const key =
    m.minute >= C.drama.lateMinutes[0] - 1 && margin >= 0 && margin <= 1
      ? margin === 0
        ? 'match.commentary.late-equaliser'
        : 'match.commentary.late-winner'
      : 'match.commentary.goal';
  event(
    session,
    'goal',
    sideTeam(session, side),
    playerId,
    line(session, key, side as 0 | 1),
    null,
    target,
  );
  if (playerId === session.setup.selectedPlayerId) {
    session.state.stats.goals++;
    addRating(session, 'goals', goalCredit(session));
  }
}
/** Picks a likely finisher: forwards most often, never the goalkeeper. */
export function finisher(session: MatchSession, side: number, rng: Rng, exclude?: string): string {
  const team = side === 0 ? session.state.match.home : session.state.match.away;
  const pool = onPitch(team).filter(
    (id) => id !== exclude && session.setup.players[id]!.primaryPosition !== 'GK',
  );
  const weighted = pool.flatMap((id) => {
    const position = session.setup.players[id]!.primaryPosition;
    const weight =
      position === 'ST' ? 4 : ATTACKERS.includes(position) ? 3 : position === 'CM' ? 2 : 1;
    return Array.from({ length: weight }, () => id);
  });
  return rng.pick(weighted);
}
/** A created chance becomes a recorded shot, and a goal with the given total probability. */
export function chance(
  session: MatchSession,
  side: number,
  scorer: string,
  probability: number,
  rng: Rng,
  key: string,
): boolean {
  if (probability <= 0) return false;
  const shot = Math.min(1, probability / C.chanceConversion);
  if (rng.next() >= shot) return false;
  // The shot's own chance: the goal probability given that the chance became a shot. Rolled
  // before the shot is logged (the log draws nothing from `rng`), so its line can say how it
  // was missed.
  const scored = rng.next() < probability / shot;
  recordShot(session, side, scorer, key, probability / shot, undefined, scored);
  if (!scored) return false;
  goal(session, side, scorer);
  return true;
}
