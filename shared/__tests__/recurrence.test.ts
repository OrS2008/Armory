import { describe, expect, it } from 'vitest';
import { expandRecurrence } from '../recurrence';
import { formatTime } from '../format';
import { dayKey, wallClockToUtc } from '../time';

const TZ = 'Asia/Jerusalem';
const at = (day: string, time: string) => wallClockToUtc(day, time, TZ);

describe('recurrence expansion', () => {
  it('returns a single occurrence when there is no recurrence', () => {
    const occurrences = expandRecurrence(
      at('2026-08-21', '08:00'),
      at('2026-08-21', '16:00'),
      undefined,
      TZ,
    );
    expect(occurrences).toHaveLength(1);
  });

  it('repeats daily until the end date, inclusive', () => {
    const occurrences = expandRecurrence(
      at('2026-08-21', '08:00'),
      at('2026-08-21', '16:00'),
      { frequency: 'daily', untilDate: '2026-08-25' },
      TZ,
    );
    expect(occurrences).toHaveLength(5);
    expect(dayKey(occurrences[4]!.startAt, TZ)).toBe('2026-08-25');
  });

  it('repeats only on the selected weekdays', () => {
    const occurrences = expandRecurrence(
      at('2026-08-16', '08:00'),
      at('2026-08-16', '16:00'),
      { frequency: 'weekdays', weekdays: [0, 3], untilDate: '2026-08-29' },
      TZ,
    );
    const days = occurrences.map((occurrence) => dayKey(occurrence.startAt, TZ));
    expect(days).toEqual(['2026-08-16', '2026-08-19', '2026-08-23', '2026-08-26']);
  });

  it('keeps overnight assignments spanning into the next day', () => {
    const occurrences = expandRecurrence(
      at('2026-08-21', '22:00'),
      at('2026-08-22', '06:00'),
      { frequency: 'daily', untilDate: '2026-08-23' },
      TZ,
    );
    expect(occurrences).toHaveLength(3);
    for (const occurrence of occurrences) {
      expect(formatTime(occurrence.startAt, TZ)).toBe('22:00');
      expect(formatTime(occurrence.endAt, TZ)).toBe('06:00');
    }
  });

  it('preserves the wall-clock hour across a DST change', () => {
    const occurrences = expandRecurrence(
      at('2026-03-26', '06:00'),
      at('2026-03-26', '14:00'),
      { frequency: 'daily', untilDate: '2026-03-29' },
      TZ,
    );
    for (const occurrence of occurrences) {
      expect(formatTime(occurrence.startAt, TZ)).toBe('06:00');
    }
  });
});

describe('round-the-clock shift rotation', () => {
  it('covers each day with back-to-back shifts', () => {
    const occurrences = expandRecurrence(
      at('2026-08-21', '00:00'),
      at('2026-08-21', '08:00'),
      { frequency: 'daily', untilDate: '2026-08-21', shiftHours: 8 },
      TZ,
    );
    expect(occurrences).toHaveLength(3);
    expect(occurrences.map((o) => formatTime(o.startAt, TZ))).toEqual(['00:00', '08:00', '16:00']);
    expect(occurrences.map((o) => formatTime(o.endAt, TZ))).toEqual(['08:00', '16:00', '00:00']);
  });

  it('leaves no gap and no overlap between consecutive shifts', () => {
    const occurrences = expandRecurrence(
      at('2026-08-21', '00:00'),
      at('2026-08-21', '06:00'),
      { frequency: 'daily', untilDate: '2026-08-22', shiftHours: 6 },
      TZ,
    );
    expect(occurrences).toHaveLength(8);
    for (let index = 1; index < occurrences.length; index += 1) {
      expect(occurrences[index]!.startAt).toBe(occurrences[index - 1]!.endAt);
    }
  });

  it('starts the rotation at the given hour, not at midnight', () => {
    const occurrences = expandRecurrence(
      at('2026-08-21', '07:00'),
      at('2026-08-21', '19:00'),
      { frequency: 'daily', untilDate: '2026-08-21', shiftHours: 12 },
      TZ,
    );
    expect(occurrences.map((o) => formatTime(o.startAt, TZ))).toEqual(['07:00', '19:00']);
  });

  it('keeps handover times on the clock across a DST change', () => {
    const occurrences = expandRecurrence(
      at('2026-03-26', '00:00'),
      at('2026-03-26', '08:00'),
      { frequency: 'daily', untilDate: '2026-03-28', shiftHours: 8 },
      TZ,
    );
    const starts = new Set(occurrences.map((o) => formatTime(o.startAt, TZ)));
    expect([...starts].sort()).toEqual(['00:00', '08:00', '16:00']);
  });

  it('ignores a shift length that does not divide the day', () => {
    const occurrences = expandRecurrence(
      at('2026-08-21', '08:00'),
      at('2026-08-21', '13:00'),
      { frequency: 'daily', untilDate: '2026-08-21', shiftHours: 5 },
      TZ,
    );
    expect(occurrences).toHaveLength(1);
  });
});
