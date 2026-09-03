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
import { namedSeatMarks, openSeatRoles } from './crew';
import { DEFAULT_CREW_ROLE } from './messages.he';
import type {
  EngineAbsence,
  EngineAssignment,
  EngineCrew,
  EnginePerson,
  SchedulingRule,
} from './conflicts';
import type { FairnessWeights } from './fairness';
import { DEFAULT_TIMEZONE, HOUR } from './time';

export interface AutofillInput {
  /** Every assignment in the window, including ones already staffed. */
  assignments: EngineAssignment[];
  personnel: EnginePerson[];
  absences: EngineAbsence[];
  rules: SchedulingRule[];
  qualificationNames?: Record<string, string> | undefined;
  exclusiveQualificationIds?: string[] | undefined;
  blockingQualificationIds?: string[] | undefined;
  /**
   * The fixed crews of each post that has any.
   *
   * Without them a proposal happily mixes סבב א׳ with סבב ב׳ — and the server
   * then drops half of it, so the reviewer approves a full crew and gets two
   * people. With them, ranking makes the wrong crew ineligible the moment the
   * first seat is taken, and the rest of the shift can only come from the crew
   * that person belongs to. Nothing here picks a crew: one falls out.
   */
  crewsByType?: Record<string, EngineCrew[]> | undefined;
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
  /** The seat this person was picked for, and its Hebrew label. */
  role: string | null;
  roleLabel: string;
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
  /**
   * What the day asks of the roster, in numbers.
   *
   * When seats outnumber the people who can stand them, no scheduler can fill
   * the day without somebody working past the limit — and the honest answer is
   * arithmetic, not a better search. Reported so the gap list can say why.
   */
  demand: { seatHours: number; people: number; hoursPerPerson: number };
  /** Seats that only came out filled because someone was moved (see below). */
  swaps: number;
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
    assigneeRoles: { ...(assignment.assigneeRoles ?? {}) },
  }));

  const roleLabel = (role: string | null) =>
    role ? (input.qualificationNames?.[role] ?? role) : DEFAULT_CREW_ROLE;
  const holds = (personnelId: string, qualificationId: string) =>
    (roster.find((person) => person.id === personnelId)?.qualificationIds ?? []).includes(
      qualificationId,
    );

  const wanted = (assignment: EngineAssignment) =>
    Math.max(0, assignment.requiredHeadcount - assignment.assigneeIds.length);

  /*
   * Who is wanted for a named seat somewhere, and so is not filler.
   *
   * A crew of four that needs one commander and one driver has two plain seats
   * left, and filling those with the other commanders and drivers empties the
   * bench that the next crew's named seats draw from. So a plain seat is
   * offered to people who hold none of these marks first, and reaches for a
   * marked one only when the seat would otherwise stand empty — which is the
   * one case where holding them back costs more than spending them.
   */
  const reserved = namedSeatMarks(input.assignments);
  const isFiller = (personnelId: string) =>
    !(roster.find((person) => person.id === personnelId)?.qualificationIds ?? []).some((mark) =>
      reserved.has(mark),
    );

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

  type Working = (typeof working)[number];

  /** Everything a chosen person carries into the proposal. */
  interface Pick {
    personnelId: string;
    displayName: string;
    score: number;
    reasons: string[];
    warnings: string[];
  }

  interface OpenSeat {
    assignment: Working;
    seat: string | null;
    resolved: boolean;
    reason: string;
  }
  const openSeats: OpenSeat[] = [];

  const FALLBACK_GAP_REASON = 'אין אנשים זמינים ומוכשרים שאינם מפרים כלל חוסם';

  /**
   * Why a seat has nobody, in the same terms the manual candidate list already
   * uses — a name from `bestForSeat` only says "not this one"; a reviewer
   * reading the gap list needs to know if it is a qualification nobody holds,
   * an empty roster, or a rest rule everyone in reach happens to be tripping.
   */
  const explainGap = (assignment: Working, seat: string | null): string => {
    const pool = roster.filter(
      (person) => !assignment.assigneeIds.includes(person.id) && (!seat || holds(person.id, seat)),
    );
    if (pool.length === 0) {
      return seat ? `אף אחד מהסגל אינו מוסמך ${roleLabel(seat)}` : 'כל הסגל כבר משובץ למשימה הזו';
    }
    const [closest] = rankCandidates({
      assignment,
      personnel: pool,
      roster,
      assignments: working,
      absences: input.absences,
      rules: input.rules,
      ...(input.qualificationNames ? { qualificationNames: input.qualificationNames } : {}),
      ...(input.exclusiveQualificationIds
        ? { exclusiveQualificationIds: input.exclusiveQualificationIds }
        : {}),
      ...(input.blockingQualificationIds
        ? { blockingQualificationIds: input.blockingQualificationIds }
        : {}),
      ...(input.crewsByType ? { crewsByType: input.crewsByType } : {}),
      ...(input.weights ? { weights: input.weights } : {}),
      timezone,
    });
    return closest?.blockers[0] ?? FALLBACK_GAP_REASON;
  };

  /**
   * The best eligible person for one seat, or nothing.
   *
   * `only` narrows the field to a named few. The repair pass below knows it is
   * asking about exactly one person, and ranking the whole roster to answer a
   * question about one of them is most of what the pass used to cost.
   */
  const bestForSeat = (
    assignment: Working,
    seat: string | null,
    exclude: Set<string>,
    only?: Set<string>,
  ): Pick | null => {
    const pool = roster.filter(
      (person) =>
        !assignment.assigneeIds.includes(person.id) &&
        !exclude.has(person.id) &&
        (!only || only.has(person.id)) &&
        (!seat || holds(person.id, seat)),
    );
    if (pool.length === 0) return null;

    // A plain seat takes whoever is not wanted for a named one, and only falls
    // back to the rest when that leaves nobody.
    const unreserved = seat ? pool : pool.filter((person) => isFiller(person.id));
    const field = unreserved.length > 0 ? unreserved : pool;

    const [best] = rankCandidates({
      assignment,
      personnel: field,
      roster,
      assignments: working,
      absences: input.absences,
      rules: input.rules,
      ...(input.qualificationNames ? { qualificationNames: input.qualificationNames } : {}),
      ...(input.exclusiveQualificationIds
        ? { exclusiveQualificationIds: input.exclusiveQualificationIds }
        : {}),
      ...(input.blockingQualificationIds
        ? { blockingQualificationIds: input.blockingQualificationIds }
        : {}),
      ...(input.crewsByType ? { crewsByType: input.crewsByType } : {}),
      ...(input.weights ? { weights: input.weights } : {}),
      timezone,
    });
    if (!best || !best.eligible) return null;
    return {
      personnelId: best.personnelId,
      displayName: best.displayName,
      score: best.score,
      reasons: best.reasons,
      warnings: best.warnings,
    };
  };

  const take = (assignment: Working, seat: string | null, pick: Pick) => {
    assignment.assigneeIds.push(pick.personnelId);
    assignment.assigneeRoles[pick.personnelId] = seat;
    proposed.push({
      assignmentId: assignment.id,
      assignmentTitle: assignment.title,
      role: seat,
      roleLabel: roleLabel(seat),
      ...pick,
    });
  };

  const release = (assignment: Working, personnelId: string): Pick | null => {
    const at = proposed.findIndex(
      (item) => item.assignmentId === assignment.id && item.personnelId === personnelId,
    );
    if (at < 0) return null;
    const [entry] = proposed.splice(at, 1) as [ProposedAssignment];
    assignment.assigneeIds = assignment.assigneeIds.filter((id) => id !== personnelId);
    delete assignment.assigneeRoles[personnelId];
    return {
      personnelId: entry.personnelId,
      displayName: entry.displayName,
      score: entry.score,
      reasons: entry.reasons,
      warnings: entry.warnings,
    };
  };

  for (const target of targets) {
    // Fill seat by seat rather than head by head: a crew that needs a driver
    // and a commander is not satisfied by any four available people, and the
    // named seats go first because they are the hardest to fill.
    for (const seat of openSeatRoles(target).slice(0, wanted(target))) {
      const best = bestForSeat(target, seat, new Set());
      // One unfillable seat does not condemn the rest of the crew: a post that
      // cannot find a driver can still be given its לוחם.
      if (!best) {
        openSeats.push({
          assignment: target,
          seat,
          resolved: false,
          reason: explainGap(target, seat),
        });
        continue;
      }
      take(target, seat, best);
    }
  }

  /*
   * Repair pass.
   *
   * The greedy pass reads the day in order and never looks back, so the 08:00
   * patrol takes the only driver and the 16:00 patrol — which needs one too —
   * is left with a hole, even though the morning could have been driven by
   * somebody else. For each hole this looks for a person already proposed
   * elsewhere who could fill it, and checks whether the seat they would leave
   * behind can be filled by someone else. Both halves have to work, or the
   * swap is undone: trading one gap for another is not an improvement.
   */
  let swaps = 0;
  for (const hole of openSeats) {
    const movable = proposed
      .filter(
        (item) =>
          item.assignmentId !== hole.assignment.id &&
          (!hole.seat || holds(item.personnelId, hole.seat)),
      )
      // Cheapest to give up first: whoever scored worst where they are.
      .sort((a, b) => a.score - b.score)
      .map((item) => ({
        assignmentId: item.assignmentId,
        personnelId: item.personnelId,
        seat: item.role,
      }));

    for (const move of movable) {
      const donor = working.find((item) => item.id === move.assignmentId);
      if (!donor) continue;

      const released = release(donor, move.personnelId);
      if (!released) continue;

      /*
       * Only this person can have become available: the seat was left empty
       * because nobody was eligible for it, and every decision since has only
       * added shifts, which never makes anyone more eligible. So the question
       * is whether releasing them is enough, not who else the hole might pick.
       */
      const forHole = bestForSeat(
        hole.assignment,
        hole.seat,
        new Set(),
        new Set([move.personnelId]),
      );
      const backfill = forHole ? bestForSeat(donor, move.seat, new Set([move.personnelId])) : null;

      // Either this person still cannot stand the seat — in which case the
      // greedy pass was right to leave it — or their own seat cannot be
      // covered by anybody else. Put them back.
      if (!forHole || !backfill) {
        take(donor, move.seat, released);
        continue;
      }

      take(hole.assignment, hole.seat, forHole);
      take(donor, move.seat, backfill);
      hole.resolved = true;
      swaps += 1;
      break;
    }
  }

  const unresolved = new Map<
    string,
    { assignment: Working; missing: number; reasons: Set<string> }
  >();
  for (const hole of openSeats) {
    if (hole.resolved) continue;
    const entry = unresolved.get(hole.assignment.id) ?? {
      assignment: hole.assignment,
      missing: 0,
      reasons: new Set<string>(),
    };
    entry.missing += 1;
    entry.reasons.add(hole.reason);
    unresolved.set(hole.assignment.id, entry);
  }
  for (const entry of unresolved.values()) {
    gaps.push({
      assignmentId: entry.assignment.id,
      assignmentTitle: entry.assignment.title,
      missing: entry.missing,
      // Different open seats on the same post can fail for different reasons
      // (no driver at all, the rest one לוחם is tripping) — say all of them.
      reason: [...entry.reasons].join(' · ') || FALLBACK_GAP_REASON,
    });
  }

  const alreadyStaffed = input.assignments.reduce(
    (total, assignment) => total + assignment.assigneeIds.length,
    0,
  );

  const seatHours = input.assignments.reduce(
    (total, assignment) =>
      total + (assignment.requiredHeadcount * (assignment.endAt - assignment.startAt)) / HOUR,
    0,
  );
  const people = roster.length;

  return {
    proposed,
    gaps,
    alreadyStaffed,
    swaps,
    demand: {
      seatHours,
      people,
      hoursPerPerson: people > 0 ? seatHours / people : 0,
    },
  };
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
