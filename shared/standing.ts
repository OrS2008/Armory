/**
 * The fixed roster.
 *
 * The company's standing posts — ש״ג, עיט, נחל שכם, כיתת כוננות א׳ כרמל,
 * קצין מוצב, חובש תורן, חפ"ק, חמ"ל — are not decisions anybody makes each
 * morning: they run continuously for months, each on its own rhythm. Asking a
 * manager to create today's six ש״ג shifts, every day, for eleven weeks, is
 * asking them to retype a fact that never changes.
 *
 * So a post carries its own rhythm — `shiftHours`, `shiftStartHour` — and this
 * module turns a date range plus those posts into the exact list of shifts the
 * period needs. It is pure: the caller decides which of them already exist and
 * writes only the rest, which is what makes running it twice harmless.
 */
import { dayPartLabel } from './crew';
import { formatTime } from './format';
import { SHIFT_HOUR_OPTIONS, isShiftHours } from './recurrence';
import { DEFAULT_TIMEZONE, addDays, isDayKey, wallClockToUtc } from './time';

export interface StandingPost {
  assignmentTypeId: string;
  name: string;
  requiredHeadcount: number;
  /** 24 must divide by this: a post is covered without a gap or an overlap. */
  shiftHours: number;
  /** Wall-clock hour of the first handover of the day. */
  shiftStartHour: number;
  /** Minutes past that hour: משקיף hands over at 06:30, not 06:00. */
  shiftStartMinute?: number;
  /**
   * A briefing this many minutes before each shift's own start — "תדריך עלייה
   * לעיט בשעה 04:40" — is a fact about the post, not about one day's shift, so
   * it is stated once here and computed fresh for every occurrence rather than
   * typed onto each one by hand.
   */
  briefingMinutesBefore?: number | null;
}

export interface StandingShift {
  assignmentTypeId: string;
  requiredHeadcount: number;
  startAt: number;
  endAt: number;
  notes: string | null;
}

/** As long a period as one action may lay out. Eleven weeks fits comfortably. */
export const MAX_STANDING_DAYS = 180;

/**
 * Shift lengths that tile a day exactly. A post covered in 5-hour shifts drifts.
 *
 * The same list the one-off recurrence form offers, deliberately: two lists of
 * the same idea drifted apart once already, and a קצין מוצב created from the
 * board came out as two twelve-hour turns because only one of them knew about 24.
 */
export const STANDING_SHIFT_HOURS = SHIFT_HOUR_OPTIONS;

export const isStandingShiftHours = isShiftHours;

/** Days in `[fromDay, toDay]`, inclusive. Empty when the range is inverted. */
export function daysInRange(fromDay: string, toDay: string): string[] {
  if (!isDayKey(fromDay) || !isDayKey(toDay) || toDay < fromDay) return [];
  const days: string[] = [];
  let cursor = fromDay;
  for (let guard = 0; guard <= MAX_STANDING_DAYS && cursor <= toDay; guard += 1) {
    days.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return days;
}

/**
 * Every shift the period needs, in chronological order.
 *
 * A shift is pinned to the wall clock rather than to a fixed offset, so a
 * 16:00 handover stays at 16:00 across a daylight-saving change — the handover
 * either side of it is then an hour shorter or longer, which is exactly what
 * happens on the ground.
 */
export function planStandingShifts(
  posts: StandingPost[],
  fromDay: string,
  toDay: string,
  timezone = DEFAULT_TIMEZONE,
): StandingShift[] {
  const shifts: StandingShift[] = [];
  const days = daysInRange(fromDay, toDay);

  for (const day of days) {
    for (const post of posts) {
      if (!isStandingShiftHours(post.shiftHours)) continue;
      const count = 24 / post.shiftHours;
      const minute = post.shiftStartMinute ?? 0;
      for (let index = 0; index < count; index += 1) {
        const startHour = post.shiftStartHour + index * post.shiftHours;
        const endHour = startHour + post.shiftHours;
        const startAt = wallClockToUtc(
          addDays(day, Math.floor(startHour / 24)),
          clock(startHour % 24, minute),
          timezone,
        );
        shifts.push({
          assignmentTypeId: post.assignmentTypeId,
          requiredHeadcount: post.requiredHeadcount,
          startAt,
          endAt: wallClockToUtc(
            addDays(day, Math.floor(endHour / 24)),
            clock(endHour % 24, minute),
            timezone,
          ),
          // A post handed over more than once a day is briefed per turn — "עיט
          // בוקר", "עיט לילה" — because that is what a person is told to be at.
          // A 24-hour post has only the one, so naming the turn says nothing.
          notes: post.briefingMinutesBefore
            ? `תדריך עלייה ל${post.name}${count > 1 ? ` ${dayPartLabel(startHour % 24)}` : ''} בשעה ${formatTime(startAt - post.briefingMinutesBefore * 60_000, timezone)}`
            : null,
        });
      }
    }
  }

  return shifts.sort(
    (left, right) =>
      left.startAt - right.startAt || left.assignmentTypeId.localeCompare(right.assignmentTypeId),
  );
}

/** The key that decides whether a shift already exists. */
export function shiftKey(shift: Pick<StandingShift, 'assignmentTypeId' | 'startAt'>): string {
  return `${shift.assignmentTypeId}:${shift.startAt}`;
}

const clock = (hour: number, minute = 0) =>
  `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
