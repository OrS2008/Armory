/**
 * Assisted auto-fill (plan section 6.7, phase 2).
 *
 * Produces a *proposal*, never a schedule. Nothing is written until a commander
 * reviews and approves it — automation assists the scheduler, it does not
 * quietly decide who stands at a gate.
 *
 * The same ranking the manual candidate picker uses drives every choice, so an
 * auto-filled seat is explainable in exactly the same terms as a hand-picked
 * one, and the same blocking rules apply: no double booking, nobody who is
 * away, nobody without the qualification the crew still needs.
 */
import { rankCandidates } from './candidates';
import type { EngineAbsence, EngineAssignment, EnginePerson, SchedulingRule } from './conflicts';
import type { FairnessWeights } from './fairness';
import { DEFAULT_TIMEZONE } from './time';

export interface AutofillInput {
  /** Every assignment in the window, including ones already staffed. */
  assignments: EngineAssignment[];
  personnel: EnginePerson[];
  absences: EngineAbsence[];
  rules: SchedulingRule[];
  qualificationNames?: Record<string, string> | undefined;
  weights?: FairnessWeights | undefined;
  timezone?: string | undefined;
  /** Restrict filling to these assignments; defaults to every understaffed one. */
  assignmentIds?: string[] | undefined;
}

export interface ProposedAssignment {
  assignmentId: string;
  assignmentTitle: string;
  personnelId: string;
  displayName: string;
  score: number;
  reasons: string[];
  warnings: string[];
}

export interface AutofillGap {
  assignmentId: string;
  assignmentTitle: string;
  missing: number;
  reason: string;
}

export interface AutofillProposal {
  proposed: ProposedAssignment[];
  gaps: AutofillGap[];
  /** Seats that were already filled before the run, for the summary. */
  alreadyStaffed: number;
}

export function buildAutofillProposal(input: AutofillInput): AutofillProposal {
  const timezone = input.timezone ?? DEFAULT_TIMEZONE;
  const roster = input.personnel;

  // Work on copies: the proposal must not mutate the caller's data, and each
  // decision has to be visible to the next one or the same person gets picked
  // twice for the same hour.
  const working = input.assignments.map((assignment) => ({
    ...assignment,
    assigneeIds: [...assignment.assigneeIds],
  }));

  const wanted = (assignment: EngineAssignment) =>
    Math.max(0, assignment.requiredHeadcount - assignment.assigneeIds.length);

  const targets = working
    .filter((assignment) => !assignment.cancelled && wanted(assignment) > 0)
    .filter((assignment) => !input.assignmentIds || input.assignmentIds.includes(assignment.id))
    // Chronological, so a reviewer reads the proposal in the order the day runs.
    // Within an hour, the hardest crew to staff goes first: a post needing a
    // commander should not lose the last one to a post that needs nobody.
    .sort(
      (a, b) =>
        a.startAt - b.startAt ||
        b.requiredQualifications.length - a.requiredQualifications.length ||
        b.requiredHeadcount - a.requiredHeadcount,
    );

  const proposed: ProposedAssignment[] = [];
  const gaps: AutofillGap[] = [];

  for (const target of targets) {
    let remaining = wanted(target);

    while (remaining > 0) {
      const pool = roster.filter((person) => !target.assigneeIds.includes(person.id));
      if (pool.length === 0) break;

      const [best] = rankCandidates({
        assignment: target,
        personnel: pool,
        roster,
        assignments: working,
        absences: input.absences,
        rules: input.rules,
        ...(input.qualificationNames ? { qualificationNames: input.qualificationNames } : {}),
        ...(input.weights ? { weights: input.weights } : {}),
        timezone,
      });

      if (!best || !best.eligible) break;

      target.assigneeIds.push(best.personnelId);
      proposed.push({
        assignmentId: target.id,
        assignmentTitle: target.title,
        personnelId: best.personnelId,
        displayName: best.displayName,
        score: best.score,
        reasons: best.reasons,
        warnings: best.warnings,
      });
      remaining -= 1;
    }

    if (remaining > 0) {
      gaps.push({
        assignmentId: target.id,
        assignmentTitle: target.title,
        missing: remaining,
        reason: 'אין אנשים זמינים ומוכשרים שאינם מפרים כלל חוסם',
      });
    }
  }

  const alreadyStaffed = input.assignments.reduce(
    (total, assignment) => total + assignment.assigneeIds.length,
    0,
  );

  return { proposed, gaps, alreadyStaffed };
}

/** Which assignments a proposal touches, for invalidation and summaries. */
export function proposalAssignmentIds(proposal: AutofillProposal): string[] {
  return [...new Set(proposal.proposed.map((item) => item.assignmentId))];
}

export function proposalByAssignment(
  proposal: AutofillProposal,
): Map<string, ProposedAssignment[]> {
  const map = new Map<string, ProposedAssignment[]>();
  for (const item of proposal.proposed) {
    const list = map.get(item.assignmentId) ?? [];
    list.push(item);
    map.set(item.assignmentId, list);
  }
  return map;
}
