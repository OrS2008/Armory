/**
 * Workload and fairness signals (plan section 7).
 *
 * The score is a weighted sum of visible components — the UI always shows the
 * components next to the number, never an opaque score.
 */
import { HOUR, hoursBetween, touchesNight, touchesWeekend } from './time';
import { DEFAULT_TIMEZONE } from './time';

export interface WorkloadAssignment {
  id: string;
  startAt: number;
  endAt: number;
  assigneeIds: string[];
  cancelled?: boolean;
}

export interface FairnessWeights {
  totalHours: number;
  nightHours: number;
  weekendHours: number;
  assignmentCount: number;
}

export const DEFAULT_FAIRNESS_WEIGHTS: FairnessWeights = {
  totalHours: 1,
  nightHours: 1.5,
  weekendHours: 1.25,
  assignmentCount: 2,
};

export interface Workload {
  personnelId: string;
  totalHours: number;
  nightHours: number;
  weekendHours: number;
  assignmentCount: number;
  lastAssignmentEndAt: number | null;
  score: number;
}

export function computeWorkload(
  personnelId: string,
  assignments: WorkloadAssignment[],
  options: {
    windowStart?: number;
    windowEnd?: number;
    weights?: FairnessWeights;
    timezone?: string;
  } = {},
): Workload {
  const weights = options.weights ?? DEFAULT_FAIRNESS_WEIGHTS;
  const timezone = options.timezone ?? DEFAULT_TIMEZONE;
  const windowStart = options.windowStart ?? Number.NEGATIVE_INFINITY;
  const windowEnd = options.windowEnd ?? Number.POSITIVE_INFINITY;

  const mine = assignments.filter(
    (assignment) =>
      !assignment.cancelled &&
      assignment.assigneeIds.includes(personnelId) &&
      assignment.endAt > windowStart &&
      assignment.startAt < windowEnd,
  );

  let totalHours = 0;
  let nightHours = 0;
  let weekendHours = 0;
  let lastAssignmentEndAt: number | null = null;

  for (const assignment of mine) {
    const start = Math.max(assignment.startAt, windowStart);
    const end = Math.min(assignment.endAt, windowEnd);
    const hours = hoursBetween(start, end);
    totalHours += hours;
    if (touchesNight(start, end, 22, 6, timezone)) nightHours += hours;
    if (touchesWeekend(start, end, timezone)) weekendHours += hours;
    if (lastAssignmentEndAt === null || assignment.endAt > lastAssignmentEndAt) {
      lastAssignmentEndAt = assignment.endAt;
    }
  }

  const score =
    totalHours * weights.totalHours +
    nightHours * weights.nightHours +
    weekendHours * weights.weekendHours +
    mine.length * weights.assignmentCount;

  return {
    personnelId,
    totalHours,
    nightHours,
    weekendHours,
    assignmentCount: mine.length,
    lastAssignmentEndAt,
    score: Math.round(score * 100) / 100,
  };
}

/** Rest in hours between a person's last assignment and a proposed start. */
export function restHoursBefore(workload: Workload, startAt: number): number | null {
  if (workload.lastAssignmentEndAt === null) return null;
  return Math.max(0, (startAt - workload.lastAssignmentEndAt) / HOUR);
}
