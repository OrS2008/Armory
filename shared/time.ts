/**
 * Time handling for SHABATZAK.
 *
 * Storage rule: every timestamp is epoch milliseconds in UTC. Nothing in the
 * database, the API or this module carries a local wall-clock string except the
 * `YYYY-MM-DD` day keys used for schedule ranges, which are always resolved
 * against an explicit IANA timezone.
 */

export const DEFAULT_TIMEZONE = 'Asia/Jerusalem';

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

const partsCache = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = partsCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    partsCache.set(timeZone, formatter);
  }
  return formatter;
}

type WallClock = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

/** The wall-clock reading a person in `timeZone` sees at instant `utcMs`. */
export function wallClock(utcMs: number, timeZone = DEFAULT_TIMEZONE): WallClock {
  const parts = partsFormatter(timeZone).formatToParts(new Date(utcMs));
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? '0');
  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: read('hour'),
    minute: read('minute'),
    second: read('second'),
  };
}

/** Offset of `timeZone` from UTC at instant `utcMs`, in milliseconds. */
export function timezoneOffsetMs(utcMs: number, timeZone = DEFAULT_TIMEZONE): number {
  const w = wallClock(utcMs, timeZone);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

/**
 * Convert a local wall-clock reading into a UTC instant.
 *
 * Around a DST transition the naive `local - offset` answer can land in the
 * wrong offset, so the result is re-checked once against the offset actually in
 * force at the candidate instant. Times inside a spring-forward gap resolve to
 * the instant the clock jumps to; ambiguous autumn times resolve to the first
 * (summer-time) occurrence, matching how schedulers read a printed board.
 */
export function wallClockToUtc(dayKey: string, time: string, timeZone = DEFAULT_TIMEZONE): number {
  const [year, month, day] = dayKey.split('-').map(Number) as [number, number, number];
  const [hour, minute] = time.split(':').map(Number) as [number, number];
  const naive = Date.UTC(year, month - 1, day, hour, minute, 0);
  const firstGuess = naive - timezoneOffsetMs(naive, timeZone);
  const correction = timezoneOffsetMs(firstGuess, timeZone);
  return naive - correction;
}

/** `YYYY-MM-DD` for the local day that instant `utcMs` falls on. */
export function dayKey(utcMs: number, timeZone = DEFAULT_TIMEZONE): string {
  const w = wallClock(utcMs, timeZone);
  return `${w.year}-${pad(w.month)}-${pad(w.day)}`;
}

/** Start of the local day `dayKey`, as a UTC instant. */
export function startOfDay(key: string, timeZone = DEFAULT_TIMEZONE): number {
  return wallClockToUtc(key, '00:00', timeZone);
}

/** Start of the day after `dayKey` — the exclusive end of that local day. */
export function endOfDay(key: string, timeZone = DEFAULT_TIMEZONE): number {
  return startOfDay(addDays(key, 1), timeZone);
}

/** Shift a `YYYY-MM-DD` key by whole days without touching timezones. */
export function addDays(key: string, days: number): string {
  const [year, month, day] = key.split('-').map(Number) as [number, number, number];
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}

/** Sunday-based week containing `key`, as seven day keys. */
export function weekDays(key: string, weekStartDay = 0): string[] {
  const [year, month, day] = key.split('-').map(Number) as [number, number, number];
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const back = (weekday - weekStartDay + 7) % 7;
  const first = addDays(key, -back);
  return Array.from({ length: 7 }, (_, index) => addDays(first, index));
}

/** Half-open interval overlap: [aStart, aEnd) against [bStart, bEnd). */
export function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/** Length of the shared part of two half-open intervals, in milliseconds. */
export function overlapMs(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

export function minutesBetween(startAt: number, endAt: number): number {
  return Math.round((endAt - startAt) / MINUTE);
}

export function hoursBetween(startAt: number, endAt: number): number {
  return (endAt - startAt) / HOUR;
}

/** Local day keys touched by an interval, inclusive of the last started day. */
export function dayKeysInRange(
  startAt: number,
  endAt: number,
  timeZone = DEFAULT_TIMEZONE,
): string[] {
  const keys: string[] = [];
  let cursor = dayKey(startAt, timeZone);
  const last = dayKey(Math.max(startAt, endAt - 1), timeZone);
  for (let guard = 0; guard < 400; guard += 1) {
    keys.push(cursor);
    if (cursor === last) break;
    cursor = addDays(cursor, 1);
  }
  return keys;
}

/** True when any part of the interval falls in the configured night window. */
export function touchesNight(
  startAt: number,
  endAt: number,
  nightStartHour = 22,
  nightEndHour = 6,
  timeZone = DEFAULT_TIMEZONE,
): boolean {
  for (const key of dayKeysInRange(startAt, endAt, timeZone)) {
    const eveningStart = wallClockToUtc(key, `${pad(nightStartHour)}:00`, timeZone);
    const eveningEnd = startOfDay(addDays(key, 1), timeZone);
    const morningStart = startOfDay(key, timeZone);
    const morningEnd = wallClockToUtc(key, `${pad(nightEndHour)}:00`, timeZone);
    if (
      overlaps(startAt, endAt, eveningStart, eveningEnd) ||
      overlaps(startAt, endAt, morningStart, morningEnd)
    ) {
      return true;
    }
  }
  return false;
}

/** Friday and Saturday, the Israeli weekend. */
export function touchesWeekend(
  startAt: number,
  endAt: number,
  timeZone = DEFAULT_TIMEZONE,
): boolean {
  return dayKeysInRange(startAt, endAt, timeZone).some((key) => {
    const [year, month, day] = key.split('-').map(Number) as [number, number, number];
    const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    return weekday === 5 || weekday === 6;
  });
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function isDayKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}
