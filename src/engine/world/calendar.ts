import type { World } from '../../model/domain';
import { CONFIG } from '../config';

export function getSeasonWeeks(world: World): number {
  return world.format === 'national-v1' ? world.season.end.week : CONFIG.world.weeksPerSeason;
}

export function isNationalWorld(world: World): boolean {
  return world.format === 'national-v1';
}

/**
 * Real calendar dates for the game clock (`GameDate`: season, week, day). `calendarDate` is
 * pure: it reads no world state and never draws from an RNG.
 *
 * What `day` means today (schedule.ts, continental.ts, postseason.ts, simulate.ts): it is an
 * ordering slot inside a game week, 1 to 7, used to sort fixtures and to mark the end of a
 * week. League fixtures use day 1 (the weekend matchday), the continental cups day 2
 * (`continental.day` in config.ts), promotion and relegation play-off legs day 3, domestic
 * cups day 4 (`createCupRound`), and contract and season ends day 7 (the last day of a week).
 *
 * The mapping to the real calendar keeps that order and football's rhythm:
 * - a game week runs Saturday to Friday, and week 1 of `season` starts on the first Saturday
 *   of August of that year (the start of a European season);
 * - day 1 is Saturday, day 2 Tuesday (continental nights), days 3 and 4 Wednesday
 *   (play-off legs and cup ties midweek), day 5 Thursday, and days 6 and 7 Friday.
 *
 * Seasons longer than 52 weeks simply run on into the next August.
 */
export interface CalendarDate {
  year: number;
  /** 1 (January) to 12. */
  month: number;
  /** Day of the month, 1 to 31. */
  day: number;
  /** 0 (Sunday) to 6 (Saturday), as in `Date.getUTCDay`. */
  weekday: number;
}

/** Days after the week's Saturday for game days 1–7 (index 0 is unused). */
export const DAY_OFFSETS = [0, 0, 3, 4, 4, 5, 6, 6] as const;
const DAY_MS = 86_400_000;

/** The first Saturday of August in `year`, as a UTC timestamp at midnight. */
function seasonStart(year: number): number {
  const first = Date.UTC(year, 7, 1);
  const weekday = new Date(first).getUTCDay();
  return first + ((6 - weekday + 7) % 7) * DAY_MS;
}

/** The real date of a game date. `day` outside 1–7 is clamped; weeks count from 1. */
export function calendarDate(season: number, week: number, day = 1): CalendarDate {
  if (!Number.isFinite(season) || !Number.isFinite(week) || !Number.isFinite(day))
    throw new RangeError('Invalid game date');
  const slot = Math.min(7, Math.max(1, Math.floor(day)));
  const time =
    seasonStart(Math.floor(season)) +
    ((Math.floor(week) - 1) * 7 + (DAY_OFFSETS[slot] ?? 0)) * DAY_MS;
  const date = new Date(time);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    weekday: date.getUTCDay(),
  };
}
