/**
 * Recurring assignment expansion (plan section 6.4).
 *
 * Occurrences keep their wall-clock time rather than a fixed millisecond
 * offset, so a 06:00 assignment stays at 06:00 across a DST change.
 */
import { DEFAULT_TIMEZONE, addDays, dayKey, wallClockToUtc } from './time';
import { formatTime } from './format';

export type RecurrenceFrequency = 'none' | 'daily' | 'weekdays' | 'custom';

export interface Recurrence {
  frequency: RecurrenceFrequency;
  /** 0 = Sunday. Required for `weekdays` and `custom`. */
  weekdays?: number[] | undefined;
  untilDate?: string | undefined;
}

export interface Occurrence {
  startAt: number;
  endAt: number;
}

export const MAX_OCCURRENCES = 366;

export function expandRecurrence(
  startAt: number,
  endAt: number,
  recurrence: Recurrence | undefined,
  timezone = DEFAULT_TIMEZONE,
): Occurrence[] {
  const first: Occurrence = { startAt, endAt };
  if (!recurrence || recurrence.frequency === 'none' || !recurrence.untilDate) {
    return [first];
  }

  const startDay = dayKey(startAt, timezone);
  const endDay = dayKey(endAt, timezone);
  const startTime = formatTime(startAt, timezone);
  const endTime = formatTime(endAt, timezone);
  const dayOffset = daysBetween(startDay, endDay);
  const weekdays =
    recurrence.frequency === 'daily' ? [0, 1, 2, 3, 4, 5, 6] : (recurrence.weekdays ?? []);
  if (weekdays.length === 0) return [first];

  const occurrences: Occurrence[] = [];
  let cursor = startDay;
  for (let guard = 0; guard < MAX_OCCURRENCES && cursor <= recurrence.untilDate; guard += 1) {
    if (weekdays.includes(weekdayOf(cursor))) {
      occurrences.push({
        startAt: wallClockToUtc(cursor, startTime, timezone),
        endAt: wallClockToUtc(addDays(cursor, dayOffset), endTime, timezone),
      });
    }
    cursor = addDays(cursor, 1);
  }

  return occurrences.length > 0 ? occurrences : [first];
}

function weekdayOf(key: string): number {
  const [year, month, day] = key.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function daysBetween(from: string, to: string): number {
  const parse = (key: string) => {
    const [year, month, day] = key.split('-').map(Number) as [number, number, number];
    return Date.UTC(year, month - 1, day);
  };
  return Math.round((parse(to) - parse(from)) / 86_400_000);
}
