/** Israeli display formatting: DD/MM/YYYY dates and 24-hour times. */
import { DEFAULT_TIMEZONE, wallClock } from './time';

const pad = (value: number) => String(value).padStart(2, '0');

export const hebrewWeekdays = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'] as const;

export function formatTime(utcMs: number, timeZone = DEFAULT_TIMEZONE): string {
  const w = wallClock(utcMs, timeZone);
  return `${pad(w.hour)}:${pad(w.minute)}`;
}

export function formatDate(utcMs: number, timeZone = DEFAULT_TIMEZONE): string {
  const w = wallClock(utcMs, timeZone);
  return `${pad(w.day)}/${pad(w.month)}/${w.year}`;
}

export function formatDateTime(utcMs: number, timeZone = DEFAULT_TIMEZONE): string {
  return `${formatDate(utcMs, timeZone)} ${formatTime(utcMs, timeZone)}`;
}

/** `2026-08-21` → `21/08/2026`. */
export function formatDayKey(key: string): string {
  const [year, month, day] = key.split('-');
  return `${day}/${month}/${year}`;
}

export function weekdayName(key: string): string {
  const [year, month, day] = key.split('-').map(Number) as [number, number, number];
  const index = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return hebrewWeekdays[index] ?? '';
}

/** One decimal place, without a trailing `.0`. */
export function formatHours(hours: number): string {
  const rounded = Math.round(hours * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function formatRange(startAt: number, endAt: number, timeZone = DEFAULT_TIMEZONE): string {
  const sameDay = formatDate(startAt, timeZone) === formatDate(endAt, timeZone);
  return sameDay
    ? `${formatDate(startAt, timeZone)} ${formatTime(startAt, timeZone)}–${formatTime(endAt, timeZone)}`
    : `${formatDateTime(startAt, timeZone)} – ${formatDateTime(endAt, timeZone)}`;
}

/**
 * How long until a handover, said the way it is said out loud: minutes while
 * it is under an hour, `H:MM` above that. Rounded up, because a handover in
 * fifty seconds is a handover in a minute rather than in none.
 */
export function formatCountdown(ms: number): string {
  const minutes = Math.max(0, Math.ceil(ms / 60_000));
  if (minutes < 60) return `${minutes} דק׳`;
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
}
