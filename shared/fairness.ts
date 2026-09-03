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

/**
 * Is the load actually spread evenly?
 *
 * The workload table answers "how much has each person done", sorted by the
 * heaviest — which reads as a leaderboard and says nothing about whether the
 * spread is a problem. A commander's question is the other one: is anyone
 * carrying the company, and is anyone being missed. That needs a middle to
 * measure against and a distance from it.
 *
 * The middle is the **median**, not the mean: a single person on a fortnight of
 * nights drags a mean far enough that half the company reads as under-loaded,
 * and the reason the number is being looked at is that such a person exists.
 */
export interface BalanceRow {
  personnelId: string;
  value: number;
}

export interface Balance {
  median: number;
  /** The distance from the median, per person, keyed by id. Signed. */
  deviation: Map<string, number>;
  /** Widest gap between any two people, which is what "uneven" looks like. */
  spread: number;
  /**
   * Share of the load held by the heaviest fifth. An even spread puts a fifth
   * of the people on a fifth of the hours; the further above 0.2 this sits, the
   * more the roster leans on a few. Null when there is nothing to divide.
   */
  topFifthShare: number | null;
  heaviest: string | null;
  lightest: string | null;
}

export function summarizeBalance(rows: BalanceRow[]): Balance {
  const empty: Balance = {
    median: 0,
    deviation: new Map(),
    spread: 0,
    topFifthShare: null,
    heaviest: null,
    lightest: null,
  };
  if (rows.length === 0) return empty;

  const sorted = [...rows].sort((a, b) => a.value - b.value);
  const middle = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 1
      ? (sorted[middle]?.value ?? 0)
      : ((sorted[middle - 1]?.value ?? 0) + (sorted[middle]?.value ?? 0)) / 2;

  const total = sorted.reduce((sum, row) => sum + row.value, 0);
  // At least one person, so a small team still gets an answer rather than none.
  const fifth = Math.max(1, Math.round(sorted.length / 5));
  const heaviestFifth = sorted.slice(-fifth).reduce((sum, row) => sum + row.value, 0);

  return {
    median: Math.round(median * 10) / 10,
    deviation: new Map(
      rows.map((row) => [row.personnelId, Math.round((row.value - median) * 10) / 10]),
    ),
    spread: Math.round(((sorted.at(-1)?.value ?? 0) - (sorted[0]?.value ?? 0)) * 10) / 10,
    topFifthShare: total > 0 ? Math.round((heaviestFifth / total) * 100) / 100 : null,
    heaviest: sorted.at(-1)?.personnelId ?? null,
    lightest: sorted[0]?.personnelId ?? null,
  };
}
