/** Geometry helpers for the day timeline, DST-aware. */
import { HOUR, endOfDay, startOfDay } from '@shared/time';
import { formatTime } from '@shared/format';

export interface DayWindow {
  dayKey: string;
  start: number;
  end: number;
  totalMs: number;
  timezone: string;
}

export function dayWindow(dayKey: string, timezone: string): DayWindow {
  const start = startOfDay(dayKey, timezone);
  const end = endOfDay(dayKey, timezone);
  return { dayKey, start, end, totalMs: end - start, timezone };
}

export interface BlockGeometry {
  offsetPercent: number;
  widthPercent: number;
  clippedStart: boolean;
  clippedEnd: boolean;
}

/** Position of an interval inside the day, clipped to the day's edges. */
export function blockGeometry(
  window: DayWindow,
  startAt: number,
  endAt: number,
): BlockGeometry | null {
  const start = Math.max(startAt, window.start);
  const end = Math.min(endAt, window.end);
  if (end <= start) return null;
  return {
    offsetPercent: ((start - window.start) / window.totalMs) * 100,
    widthPercent: ((end - start) / window.totalMs) * 100,
    clippedStart: startAt < window.start,
    clippedEnd: endAt > window.end,
  };
}

/** Hour ticks across the day; a DST day yields 23 or 25 of them. */
export function hourTicks(window: DayWindow, step = 2): { at: number; label: string }[] {
  const ticks: { at: number; label: string }[] = [];
  for (let at = window.start; at < window.end; at += step * HOUR) {
    ticks.push({ at, label: formatTime(at, window.timezone) });
  }
  return ticks;
}
