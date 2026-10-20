import { describe, expect, it } from 'vitest';
import { calendarDate, DAY_OFFSETS } from '../src/engine/world/calendar';
import { formatGameDate } from '../src/i18n/calendar';

const ordinal = (date: { year: number; month: number; day: number }) =>
  Date.UTC(date.year, date.month - 1, date.day);

describe('calendarDate', () => {
  it('starts week 1 on the first Saturday of August', () => {
    expect(calendarDate(2026, 1, 1)).toEqual({ year: 2026, month: 8, day: 1, weekday: 6 });
    expect(calendarDate(2027, 1, 1)).toEqual({ year: 2027, month: 8, day: 7, weekday: 6 });
    expect(calendarDate(2025, 1, 1)).toEqual({ year: 2025, month: 8, day: 2, weekday: 6 });
    for (let season = 2000; season <= 2060; season++) {
      const start = calendarDate(season, 1, 1);
      expect(start.weekday).toBe(6);
      expect(start.month).toBe(8);
      expect(start.day).toBeLessThanOrEqual(7);
    }
  });

  it('maps game days to football weekdays in their existing order', () => {
    // League Saturday, continental Tuesday, play-offs and cups Wednesday, week end Friday.
    expect([1, 2, 3, 4, 5, 6, 7].map((day) => calendarDate(2026, 10, day).weekday)).toEqual([
      6, 2, 3, 3, 4, 5, 5,
    ]);
    for (let day = 2; day <= 7; day++)
      expect(DAY_OFFSETS[day]).toBeGreaterThanOrEqual(DAY_OFFSETS[day - 1]!);
  });

  it('never goes backwards across weeks, days and the new year', () => {
    let previous = -Infinity;
    for (let week = 1; week <= 56; week++)
      for (let day = 1; day <= 7; day++) {
        const time = ordinal(calendarDate(2026, week, day));
        expect(time).toBeGreaterThanOrEqual(previous);
        previous = time;
      }
    expect(calendarDate(2026, 23, 1)).toEqual({ year: 2027, month: 1, day: 2, weekday: 6 });
    expect(calendarDate(2026, 15, 1)).toEqual({ year: 2026, month: 11, day: 7, weekday: 6 });
  });

  it('clamps the day slot and rejects impossible dates', () => {
    expect(calendarDate(2026, 3, 0)).toEqual(calendarDate(2026, 3, 1));
    expect(calendarDate(2026, 3, 9)).toEqual(calendarDate(2026, 3, 7));
    expect(() => calendarDate(Number.NaN, 1, 1)).toThrow(RangeError);
  });
});

describe('formatGameDate', () => {
  it('writes short British dates', () => {
    expect(formatGameDate(calendarDate(2026, 16, 1))).toBe('Sat 14 Nov');
    expect(formatGameDate(calendarDate(2026, 16, 4))).toBe('Wed 18 Nov');
    expect(formatGameDate(calendarDate(2026, 23, 1), true)).toBe('Sat 2 Jan 2027');
  });
});
