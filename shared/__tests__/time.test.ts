import { describe, expect, it } from 'vitest';
import {
  DAY,
  addDays,
  dayKey,
  dayKeysInRange,
  endOfDay,
  isDayKey,
  minutesBetween,
  overlapMs,
  overlaps,
  startOfDay,
  timezoneOffsetMs,
  touchesNight,
  touchesWeekend,
  wallClockToUtc,
  weekDays,
} from '../time';

const TZ = 'Asia/Jerusalem';

describe('wall clock conversion', () => {
  it('converts winter time at UTC+2', () => {
    const at = wallClockToUtc('2026-01-15', '08:00', TZ);
    expect(new Date(at).toISOString()).toBe('2026-01-15T06:00:00.000Z');
  });

  it('converts summer time at UTC+3', () => {
    const at = wallClockToUtc('2026-07-15', '08:00', TZ);
    expect(new Date(at).toISOString()).toBe('2026-07-15T05:00:00.000Z');
  });

  it('reports the offset in force at a given instant', () => {
    expect(timezoneOffsetMs(Date.parse('2026-01-15T12:00:00Z'), TZ)).toBe(2 * 60 * 60_000);
    expect(timezoneOffsetMs(Date.parse('2026-07-15T12:00:00Z'), TZ)).toBe(3 * 60 * 60_000);
  });

  it('round-trips a wall clock reading through dayKey', () => {
    const at = wallClockToUtc('2026-08-21', '23:30', TZ);
    expect(dayKey(at, TZ)).toBe('2026-08-21');
  });
});

describe('daylight saving transitions', () => {
  it('gives the spring-forward day 23 hours', () => {
    // Israel moves to DST on the Friday before the last Sunday of March.
    const start = startOfDay('2026-03-27', TZ);
    const end = endOfDay('2026-03-27', TZ);
    expect((end - start) / 3_600_000).toBe(23);
  });

  it('gives the autumn fall-back day 25 hours', () => {
    const start = startOfDay('2026-10-25', TZ);
    const end = endOfDay('2026-10-25', TZ);
    expect((end - start) / 3_600_000).toBe(25);
  });

  it('keeps a shift at the same wall-clock hour across the transition', () => {
    const before = wallClockToUtc('2026-03-26', '06:00', TZ);
    const after = wallClockToUtc('2026-03-28', '06:00', TZ);
    // Two calendar days apart, but only 47 hours of real time.
    expect((after - before) / 3_600_000).toBe(47);
  });
});

describe('interval helpers', () => {
  it('treats intervals as half open', () => {
    expect(overlaps(0, 10, 10, 20)).toBe(false);
    expect(overlaps(0, 11, 10, 20)).toBe(true);
    expect(overlapMs(0, 15, 10, 20)).toBe(5);
  });

  it('measures minutes between instants', () => {
    expect(minutesBetween(0, 90 * 60_000)).toBe(90);
  });

  it('lists every local day an assignment touches', () => {
    const start = wallClockToUtc('2026-08-21', '22:00', TZ);
    const end = wallClockToUtc('2026-08-22', '06:00', TZ);
    expect(dayKeysInRange(start, end, TZ)).toEqual(['2026-08-21', '2026-08-22']);
  });

  it('excludes a day the interval only ends on at midnight', () => {
    const start = wallClockToUtc('2026-08-21', '20:00', TZ);
    const end = startOfDay('2026-08-22', TZ);
    expect(dayKeysInRange(start, end, TZ)).toEqual(['2026-08-21']);
  });
});

describe('calendar helpers', () => {
  it('shifts day keys across month boundaries', () => {
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('builds a Sunday-first week', () => {
    const week = weekDays('2026-08-21');
    expect(week[0]).toBe('2026-08-16');
    expect(week).toHaveLength(7);
  });

  it('validates day keys', () => {
    expect(isDayKey('2026-02-29')).toBe(false);
    expect(isDayKey('2024-02-29')).toBe(true);
    expect(isDayKey('21/08/2026')).toBe(false);
  });
});

describe('night and weekend detection', () => {
  it('flags an overnight guard shift as night work', () => {
    const start = wallClockToUtc('2026-08-21', '23:00', TZ);
    expect(touchesNight(start, start + 4 * 3_600_000, 22, 6, TZ)).toBe(true);
  });

  it('does not flag a midday shift', () => {
    const start = wallClockToUtc('2026-08-19', '10:00', TZ);
    expect(touchesNight(start, start + 4 * 3_600_000, 22, 6, TZ)).toBe(false);
  });

  it('treats Friday and Saturday as the weekend', () => {
    const friday = wallClockToUtc('2026-08-21', '10:00', TZ);
    const monday = wallClockToUtc('2026-08-17', '10:00', TZ);
    expect(touchesWeekend(friday, friday + 3_600_000, TZ)).toBe(true);
    expect(touchesWeekend(monday, monday + 3_600_000, TZ)).toBe(false);
  });

  it('exports a day length constant matching 24 hours', () => {
    expect(DAY).toBe(86_400_000);
  });
});
