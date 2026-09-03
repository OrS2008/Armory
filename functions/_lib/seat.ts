import { detectConflicts, type Conflict } from '../../shared/conflicts';
import type { Personnel } from '../../shared/types';
import { toEngineAbsences, toEngineAssignment, toEnginePerson } from './data';
import type { engineQualifications, evaluateWindow } from './data';

type Evaluation = Awaited<ReturnType<typeof evaluateWindow>>;
type Qualifications = Awaited<ReturnType<typeof engineQualifications>>;

export interface SeatRequest {
  assignmentId: string;
  /** A named seat, or null for a plain one. */
  role?: string | null;
  /** Somebody who stands up from the same assignment as this person sits down. */
  vacating?: string | null;
}

export interface SeatVerdict {
  conflicts: Conflict[];
  blocking: Conflict[];
  /**
   * The seat carries a mark this person does not hold. Deliberately not a
   * conflict: a conflict is a rule, a rule can be switched off in settings and
   * a blocking one can be overridden with a reason. Neither is what "only a
   * driver drives" means, so this answer stands outside the engine and has no
   * way past it.
   */
  refusal: string | null;
}

/**
 * Would seating this person here break anything?
 *
 * One place answers it, so the board, an assignment, an approved replacement
 * and a volunteered seat cannot drift into disagreeing about the same person
 * on the same shift. The caller supplies a window already evaluated, because
 * the answer depends on every other shift that person is on.
 */
export function verifySeat(
  evaluation: Evaluation,
  qualifications: Qualifications,
  person: Personnel,
  request: SeatRequest,
): SeatVerdict {
  const role = request.role ?? null;
  const refusal =
    role && !person.qualificationIds.includes(role)
      ? `${person.displayName} אינו מחזיק בהכשיר ${qualifications.qualificationNames[role] ?? role} ולכן אינו יכול למלא תפקיד זה`
      : null;

  // Re-run the engine with the placement applied — the same code the board uses.
  const assignments = evaluation.assignments.map((assignment) => {
    const engine = toEngineAssignment(assignment);
    if (assignment.id !== request.assignmentId) return engine;
    const vacating = request.vacating ?? null;
    const roles = { ...engine.assigneeRoles };
    if (vacating) delete roles[vacating];
    return {
      ...engine,
      assigneeIds: [...engine.assigneeIds.filter((id) => id !== vacating), person.id],
      assigneeRoles: { ...roles, [person.id]: role },
      overriddenBy: [],
    };
  });

  const conflicts = detectConflicts({
    assignments,
    personnel: [toEnginePerson(person)],
    absences: toEngineAbsences(evaluation.availability).filter(
      (absence) => absence.personnelId === person.id,
    ),
    rules: evaluation.rules,
    ...qualifications,
    timezone: evaluation.timezone,
  }).filter(
    (conflict) =>
      conflict.personnelId === person.id && conflict.assignmentId === request.assignmentId,
  );

  return {
    conflicts,
    blocking: conflicts.filter((conflict) => conflict.severity === 'blocking'),
    refusal,
  };
}
