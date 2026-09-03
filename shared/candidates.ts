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
import type { EngineAbsence, EngineCrew } from './conflicts';
import { computeWorkload, restHoursBefore, type FairnessWeights, type Workload } from './fairness';
import { formatHours } from './format';
import { DAY, DEFAULT_TIMEZONE } from './time';

export interface CandidateInput {
  assignment: EngineAssignment;
  /** The pool to rank — normally everyone not already on the assignment. */
  personnel: EnginePerson[];
  /**
   * Everyone, including the people already assigned. Needed to judge what the
   * crew is still short of: the pool alone cannot see that the driver seat is
   * already filled, because that driver has been filtered out of it.
   */
  roster?: EnginePerson[];
  assignments: EngineAssignment[];
  absences: EngineAbsence[];
  rules: SchedulingRule[];
  qualificationNames?: Record<string, string>;
  /** Qualifications that restrict their holder rather than permitting them. */
  exclusiveQualificationIds?: string[];
  /** Qualifications that take their holder out of the rotation entirely. */
  blockingQualificationIds?: string[];
  /** The fixed crews of each post that has any, keyed by assignment type id. */
  crewsByType?: Record<string, EngineCrew[]>;
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
  const roster = new Map(
    [...(input.roster ?? []), ...input.personnel].map((person) => [person.id, person] as const),
  );

  /*
   * Every shift each person already stands, indexed once.
   *
   * Ranking asks the conflict engine the same question of every candidate —
   * "what breaks if this one takes the seat" — and keeps only the answers about
   * that person. Those answers depend on their own shifts and the trial seat and
   * nothing else: a rest gap, a double booking, a day's worth of turns. Handing
   * the engine the whole day instead made it re-read every other post's crew
   * once per candidate, which is most of what auto-fill spent its time on.
   */
  const ownAssignments = new Map<string, EngineAssignment[]>();
  for (const item of others) {
    for (const personnelId of item.assigneeIds) {
      const list = ownAssignments.get(personnelId);
      if (list) list.push(item);
      else ownAssignments.set(personnelId, [item]);
    }
  }

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
      assignments: [...(ownAssignments.get(person.id) ?? []), trial],
      personnel: [person],
      absences: input.absences.filter((absence) => absence.personnelId === person.id),
      rules: input.rules,
      ...(input.qualificationNames ? { qualificationNames: input.qualificationNames } : {}),
      ...(input.exclusiveQualificationIds
        ? { exclusiveQualificationIds: input.exclusiveQualificationIds }
        : {}),
      ...(input.blockingQualificationIds
        ? { blockingQualificationIds: input.blockingQualificationIds }
        : {}),
      ...(input.crewsByType ? { crewsByType: input.crewsByType } : {}),
      timezone,
    }).filter((conflict) => conflict.personnelId === person.id);

    const blockers = conflicts
      .filter((conflict) => conflict.severity === 'blocking')
      .map((conflict) => conflict.message);
    const warnings = conflicts
      .filter((conflict) => conflict.severity === 'warning')
      .map((conflict) => conflict.message);

    const reasons: string[] = [];
    const required = input.assignment.requiredQualifications;
    const held = new Set(person.qualificationIds);
    if (required.length > 0) {
      const matched = required.filter((item) => held.has(item.qualificationId)).length;
      reasons.push(`הכשירים: ${matched}/${required.length}`);
    }

    // A crew short of a driver values a driver above an equally rested peer.
    const stillNeeded = required.filter((item) => {
      if (item.minCount <= 0) return false;
      const present = input.assignment.assigneeIds.filter((id) =>
        roster.get(id)?.qualificationIds.includes(item.qualificationId),
      ).length;
      return present < item.minCount;
    });
    const fillsGap = stillNeeded.some((item) => held.has(item.qualificationId));
    if (fillsGap) {
      reasons.push(
        `משלים הכשיר חסר: ${stillNeeded
          .filter((item) => held.has(item.qualificationId))
          .map((item) => input.qualificationNames?.[item.qualificationId] ?? item.qualificationId)
          .join(', ')}`,
      );
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
        : (20 * required.filter((item) => held.has(item.qualificationId)).length) / required.length;
    // Enough to outrank a slightly lighter-loaded candidate who leaves the gap open.
    const gapPoints = fillsGap ? 25 : 0;
    const restPoints = rest === null ? 10 : Math.min(10, rest);
    const penalty = warnings.length * 12;
    const score = blockers.length
      ? 0
      : Math.max(
          0,
          Math.round(fairnessPoints + qualificationPoints + gapPoints + restPoints - penalty),
        );

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

  /*
   * Warnings rank before score, not inside it.
   *
   * A twelve-point penalty could not outweigh a seventy-point fairness range,
   * so a warned-but-idle soldier still beat a clean one — which is how
   * auto-fill came to hand people sixteen continuous hours in the name of an
   * even workload. Warnings mean "allowed, but only when nothing else is", so
   * the clean candidates have to be exhausted first; fairness then decides
   * within each tier, and the score keeps its plain meaning on screen.
   */
  return candidates.sort(
    (a, b) =>
      Number(b.eligible) - Number(a.eligible) ||
      a.warnings.length - b.warnings.length ||
      b.score - a.score ||
      a.displayName.localeCompare(b.displayName, 'he'),
  );
}
