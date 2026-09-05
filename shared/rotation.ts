/**
 * Whose week it is.
 *
 * "סבב א׳ שבוע, סבב ב׳ שבוע" is not a scheduling problem. Nothing is being
 * searched for and nothing is being balanced: given the date, the crew that
 * stands it is arithmetic, and the answer is the same however many times it is
 * asked. So it is computed here rather than proposed by the auto-fill, and the
 * period layout seats it as it lays the shifts out — which is what "the system
 * puts them in by itself" actually asks for. A commander pressing a button
 * seventy times is not that.
 *
 * The anchor matters as much as the period. Two crews on a seven-day rotation
 * still have to agree on which of them holds the first week, and "the week
 * containing the first shift" is the only answer that does not move when the
 * period is laid out again from a different starting date.
 */
import type { EngineCrew } from './conflicts';
import { DEFAULT_TIMEZONE, dayKey, isDayKey } from './time';

/** Days in one crew's turn. Seven is a week; nothing here assumes it. */
export interface CrewRotation {
  /** The day the first crew's first turn begins, as a day key. */
  anchorDay: string;
  /** How many days each crew holds the post before handing it on. */
  periodDays: number;
}

const DAY_MS = 86_400_000;

/**
 * Whole days from `anchorDay` to `day`, which may be negative.
 *
 * Both are day keys rather than instants, so this counts calendar days and a
 * daylight-saving change cannot move a crew's turn by a day. Midday is used to
 * step through them for the same reason: an hour either way of midnight lands
 * on the wrong date twice a year, and midday never does.
 */
function daysBetween(anchorDay: string, day: string): number {
  const at = (key: string) => Date.parse(`${key}T12:00:00Z`);
  return Math.round((at(day) - at(anchorDay)) / DAY_MS);
}

/**
 * The crew whose turn it is on `day`, or null when the post has no crews.
 *
 * Crews take their turns in `position` order. A day before the anchor is
 * answered rather than refused — the rotation runs backwards just as evenly,
 * and a period laid out over a date that precedes the anchor should still name
 * a crew rather than leave the shift for anybody.
 */
export function crewOnDuty(
  crews: EngineCrew[],
  rotation: CrewRotation,
  day: string,
): EngineCrew | null {
  const ordered = [...crews].sort((left, right) => left.position - right.position);
  if (ordered.length === 0) return null;
  if (!isDayKey(day) || !isDayKey(rotation.anchorDay)) return null;
  const period = Math.floor(rotation.periodDays);
  if (period < 1) return null;

  // Floor rather than truncate: -1 day into a 7-day period is the *previous*
  // crew's last day, not the first crew's. Truncating puts both sides of the
  // anchor in the same turn and makes that one turn twice as long.
  const turn = Math.floor(daysBetween(rotation.anchorDay, day) / period);
  const index = ((turn % ordered.length) + ordered.length) % ordered.length;
  return ordered[index] ?? null;
}

/** The same question asked of an instant rather than a day key. */
export function crewOnDutyAt(
  crews: EngineCrew[],
  rotation: CrewRotation,
  startAt: number,
  timezone = DEFAULT_TIMEZONE,
): EngineCrew | null {
  return crewOnDuty(crews, rotation, dayKey(startAt, timezone));
}
