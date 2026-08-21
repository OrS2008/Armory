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
  /**
   * Round-the-clock rotation: a standing post covered without a break, handed
   * over every `shiftHours`. A guard post on 8-hour shifts becomes three
   * occurrences a day rather than one, which is what makes it staffable.
   * Shift starts are pinned to the wall clock, so a 16:00 handover stays at
   * 16:00 across a daylight-saving change.
   */
  shiftHours?: number | undefined;
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

  const shiftHours = normaliseShiftHours(recurrence.shiftHours);
  const occurrences: Occurrence[] = [];
  let cursor = startDay;
  for (let guard = 0; guard < MAX_OCCURRENCES && cursor <= recurrence.untilDate; guard += 1) {
    if (weekdays.includes(weekdayOf(cursor))) {
      if (shiftHours) {
        occurrences.push(...shiftsForDay(cursor, startTime, shiftHours, timezone));
      } else {
        occurrences.push({
          startAt: wallClockToUtc(cursor, startTime, timezone),
          endAt: wallClockToUtc(addDays(cursor, dayOffset), endTime, timezone),
        });
      }
    }
    cursor = addDays(cursor, 1);
  }

  return occurrences.length > 0 ? occurrences : [first];
}

/** Shift lengths that tile a 24-hour day exactly. */
export const SHIFT_HOUR_OPTIONS = [2, 3, 4, 6, 8, 12] as const;

function normaliseShiftHours(value: number | undefined): number | null {
  if (!value || !Number.isFinite(value)) return null;
  const hours = Math.trunc(value);
  return (SHIFT_HOUR_OPTIONS as readonly number[]).includes(hours) ? hours : null;
}

/** One day's worth of handovers, starting from the first shift's time. */
function shiftsForDay(
  dayKey: string,
  firstStart: string,
  shiftHours: number,
  timezone: string,
): Occurrence[] {
  const [baseHour, baseMinute] = firstStart.split(':').map(Number) as [number, number];
  const count = 24 / shiftHours;
  const occurrences: Occurrence[] = [];

  for (let index = 0; index < count; index += 1) {
    const startHour = baseHour + index * shiftHours;
    const endHour = startHour + shiftHours;
    occurrences.push({
      startAt: wallClockToUtc(
        addDays(dayKey, Math.floor(startHour / 24)),
        clock(startHour % 24, baseMinute),
        timezone,
      ),
      endAt: wallClockToUtc(
        addDays(dayKey, Math.floor(endHour / 24)),
        clock(endHour % 24, baseMinute),
        timezone,
      ),
    });
  }

  return occurrences;
}

const clock = (hour: number, minute: number) =>
  `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

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
