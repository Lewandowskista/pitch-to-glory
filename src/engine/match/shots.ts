/**
 * Shots that do not go in (engine match-22, release 1.0 step 5.3). A miss outside the player's
 * own choices is settled by `missedShot` (commentary.ts, step 5.5): its line names how, the pitch
 * draws it, and here it becomes the shot's result and, off the woodwork, a statistic. The
 * player's own missed shot keeps the ending its commentary line names unless it hits the
 * woodwork, drawn here on its own stream.
 */
import type { MatchEvent, ShotResult } from '../../model/domain';
import { createRng } from '../rng';
import { rules22, type MatchSession } from './types';
import { MATCH_CONFIG as C } from './tuning';
import type { MissedShot } from './commentary';
import { line } from './events';

/** The background's shot → goal conversion: match-22 shoots more for the same goals. */
export const backgroundConversion = (session: MatchSession): number =>
  rules22(session.setup) ? C.shots22.conversion : C.shotConversion;

const RESULTS: Record<MissedShot, ShotResult> = {
  held: 'saved',
  parried: 'saved',
  wide: 'off-target',
  over: 'off-target',
  blocked: 'blocked',
  woodwork: 'woodwork',
};

/** Record how a missed shot ended (match-22), counting the woodwork. */
export function settleMiss(session: MatchSession, shot: MatchEvent, missed: MissedShot): void {
  shot.shotResult = RESULTS[missed];
  if (missed !== 'woodwork') return;
  const stats = session.state.stats;
  const [home, away] = stats.woodwork ?? [0, 0];
  stats.woodwork = shot.teamId === session.setup.home.id ? [home + 1, away] : [home, away + 1];
}

/**
 * The player's own missed shot (match-22): off the woodwork with `shots22.woodwork`, on the
 * shot's own stream; its line then says so and the pitch draws it.
 */
export function ownMiss(session: MatchSession, shot: MatchEvent): void {
  if (!rules22(session.setup)) return;
  if (createRng(`${session.setup.seed}:woodwork:${shot.id}`).next() >= C.shots22.woodwork) return;
  const side = shot.teamId === session.setup.home.id ? 0 : 1;
  shot.commentaryKey = line(session, 'match.commentary.attempt-woodwork', side);
  settleMiss(session, shot, 'woodwork');
}
