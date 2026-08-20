/**
 * Bridges the HTML date/time inputs (local wall clock) and the API (UTC ms).
 */
import { formatTime } from '@shared/format';
import { DEFAULT_TIMEZONE, dayKey, wallClockToUtc } from '@shared/time';

export function toTimestamp(day: string, time: string, timezone = DEFAULT_TIMEZONE): number {
  return wallClockToUtc(day, time, timezone);
}

export function splitTimestamp(
  utcMs: number,
  timezone = DEFAULT_TIMEZONE,
): { day: string; time: string } {
  return { day: dayKey(utcMs, timezone), time: formatTime(utcMs, timezone) };
}

export function todayKey(timezone = DEFAULT_TIMEZONE): string {
  return dayKey(Date.now(), timezone);
}

/** Minutes from midnight, used to position blocks on the day timeline. */
export function minutesFromMidnight(utcMs: number, dayStartMs: number): number {
  return Math.round((utcMs - dayStartMs) / 60_000);
}
