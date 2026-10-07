import { MATCH_CONFIG as C } from './tuning';

/** What a player contributed to a match, as the report and the career record count it. */
export interface Performance {
  minutes: number;
  rating: number;
  goals: number;
  assists: number;
  /** Personal objectives completed. */
  objectives: number;
}
/** Performance XP, before the career's opposition and importance multipliers. */
export function performanceXp(p: Performance): number {
  return Math.round(
    p.minutes * C.xp.perMinute +
      Math.max(0, p.rating - C.xp.ratingThreshold) * C.xp.perRating +
      p.goals * C.xp.perGoal +
      p.assists * C.xp.perAssist +
      p.objectives * C.xp.perObjective,
  );
}
/** Fame from a rating above the threshold and from goals. */
export function performanceFame(rating: number, goals: number): number {
  return Math.round(
    Math.max(0, rating - C.fame.ratingThreshold) * C.fame.perRating + goals * C.fame.perGoal,
  );
}
