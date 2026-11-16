import type { Position } from '../../model/domain';
import { MATCH_CONFIG as C } from './tuning';
import { rules22, type MatchSession } from './types';
import { rolePosition } from './shared';

/** What a player contributed to a match, as the report and the career record count it. */
export interface Performance {
  minutes: number;
  rating: number;
  goals: number;
  assists: number;
  /** Personal objectives completed. */
  objectives: number;
}
/**
 * The rating scale a match's rewards are paid on: null for match-21's, or match-22's
 * compressed ratings (release 1.0 step 5.3) with the position played, which weighs their XP.
 */
export type RewardScale = { position: Position } | null;
/** The scale of the match a session played: its engine's (`rules22`) and the slot played. */
export const rewardScale = (session: MatchSession): RewardScale =>
  rules22(session.setup) ? { position: rolePosition(session.setup) } : null;
const R = C.rewards22;
/** How much a match-22 rating point pays in the position played. */
const weight = (scale: { position: Position }): number => R.position[scale.position] ?? 1;
/** Performance XP, before the career's opposition and importance multipliers. */
export function performanceXp(p: Performance, scale: RewardScale = null): number {
  const X = C.xp;
  const rating = scale
    ? Math.max(0, p.rating - R.xp.ratingThreshold) * R.xp.perRating * weight(scale)
    : Math.max(0, p.rating - X.ratingThreshold) * X.perRating;
  return Math.round(
    p.minutes * X.perMinute +
      rating +
      p.goals * X.perGoal +
      p.assists * X.perAssist +
      p.objectives * X.perObjective,
  );
}
/** Fame from a rating above the threshold, goals, assists and (for the back line) clean sheets. */
export function performanceFame(
  rating: number,
  goals: number,
  assists = 0,
  cleanSheet = false,
  scale: RewardScale = null,
): number {
  const F = C.fame;
  const fromRating = scale
    ? Math.max(0, rating - R.fame.ratingThreshold) * R.fame.perRating * weight(scale)
    : Math.max(0, rating - F.ratingThreshold) * F.perRating;
  return Math.round(
    fromRating + goals * F.perGoal + assists * F.perAssist + (cleanSheet ? F.perCleanSheet : 0),
  );
}
