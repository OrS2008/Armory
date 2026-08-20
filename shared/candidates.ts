/**
 * Scheduling assistant, phase 1: rank people who may take an assignment and
 * explain the ranking. The scheduler always picks the final person — this
 * module never assigns anyone.
 */
import {
  detectConflicts,
  type EngineAssignment,
  type EnginePerson,
  type SchedulingRule,
} from './conflicts';
import type { EngineAbsence } from './conflicts';
import { computeWorkload, restHoursBefore, type FairnessWeights, type Workload } from './fairness';
import { formatHours } from './format';
import { DAY, DEFAULT_TIMEZONE } from './time';

export interface CandidateInput {
  assignment: EngineAssignment;
  personnel: EnginePerson[];
  assignments: EngineAssignment[];
  absences: EngineAbsence[];
  rules: SchedulingRule[];
  qualificationNames?: Record<string, string>;
  weights?: FairnessWeights;
  timezone?: string;
  /** Workload look-back window; defaults to 14 days before the assignment. */
  workloadWindowDays?: number;
}

export interface Candidate {
  personnelId: string;
  displayName: string;
  eligible: boolean;
  /** 0–100, higher is a better fit. Always shown with `reasons`. */
  score: number;
  blockers: string[];
  warnings: string[];
  reasons: string[];
  workload: Workload;
}

export function rankCandidates(input: CandidateInput): Candidate[] {
  const timezone = input.timezone ?? DEFAULT_TIMEZONE;
  const windowDays = input.workloadWindowDays ?? 14;
  const windowStart = input.assignment.startAt - windowDays * DAY;
  const others = input.assignments.filter((item) => item.id !== input.assignment.id);

  const workloads = input.personnel.map((person) =>
    computeWorkload(person.id, others, {
      windowStart,
      windowEnd: input.assignment.startAt,
      ...(input.weights ? { weights: input.weights } : {}),
      timezone,
    }),
  );
  const maxScore = Math.max(1, ...workloads.map((workload) => workload.score));

  const candidates = input.personnel.map((person, index) => {
    const workload = workloads[index]!;
    const trial: EngineAssignment = {
      ...input.assignment,
      assigneeIds: [...new Set([...input.assignment.assigneeIds, person.id])],
      overriddenBy: [],
    };
    const conflicts = detectConflicts({
      assignments: [...others, trial],
      personnel: [person],
      absences: input.absences.filter((absence) => absence.personnelId === person.id),
      rules: input.rules,
      ...(input.qualificationNames ? { qualificationNames: input.qualificationNames } : {}),
      timezone,
    }).filter((conflict) => conflict.personnelId === person.id);

    const blockers = conflicts
      .filter((conflict) => conflict.severity === 'blocking')
      .map((conflict) => conflict.message);
    const warnings = conflicts
      .filter((conflict) => conflict.severity === 'warning')
      .map((conflict) => conflict.message);

    const reasons: string[] = [];
    const required = input.assignment.requiredQualificationIds;
    if (required.length > 0) {
      const held = new Set(person.qualificationIds);
      const matched = required.filter((id) => held.has(id)).length;
      reasons.push(`הכשירים: ${matched}/${required.length}`);
    }
    reasons.push(`עומס ${formatHours(workload.totalHours)} שעות ב־${windowDays} הימים האחרונים`);
    if (workload.nightHours > 0) reasons.push(`${formatHours(workload.nightHours)} שעות לילה`);
    if (workload.weekendHours > 0) {
      reasons.push(`${formatHours(workload.weekendHours)} שעות סופ״ש`);
    }
    const rest = restHoursBefore(workload, input.assignment.startAt);
    if (rest !== null) reasons.push(`מנוחה לפני המשימה: ${formatHours(rest)} שעות`);

    // Fairness first: the least-loaded eligible person ranks highest, then a
    // qualification bonus, then a penalty for each soft warning.
    const fairnessPoints = 70 * (1 - workload.score / maxScore);
    const qualificationPoints =
      required.length === 0
        ? 20
        : (20 * required.filter((id) => person.qualificationIds.includes(id)).length) /
          required.length;
    const restPoints = rest === null ? 10 : Math.min(10, rest);
    const penalty = warnings.length * 12;
    const score = blockers.length
      ? 0
      : Math.max(0, Math.round(fairnessPoints + qualificationPoints + restPoints - penalty));

    return {
      personnelId: person.id,
      displayName: person.displayName,
      eligible: blockers.length === 0,
      score,
      blockers,
      warnings,
      reasons,
      workload,
    };
  });

  return candidates.sort(
    (a, b) =>
      Number(b.eligible) - Number(a.eligible) ||
      b.score - a.score ||
      a.displayName.localeCompare(b.displayName, 'he'),
  );
}
