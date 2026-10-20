import { format } from './index';

/** Real-calendar dates for fixtures ("Sat 14 Nov"). See `engine/world/calendar.ts`. */
export const calendarText = {
  weekdays: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  date: '{weekday} {day} {month}',
  dateYear: '{weekday} {day} {month} {year}',
} as const;

/** "Sat 14 Nov" (or "Sat 14 Nov 2026" with `withYear`) for a calendar date. */
export function formatGameDate(
  date: { year: number; month: number; day: number; weekday: number },
  withYear = false,
): string {
  return format(withYear ? calendarText.dateYear : calendarText.date, {
    weekday: calendarText.weekdays[date.weekday] ?? '',
    day: date.day,
    month: calendarText.months[date.month - 1] ?? '',
    year: date.year,
  });
}
