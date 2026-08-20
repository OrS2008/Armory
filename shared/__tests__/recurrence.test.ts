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
