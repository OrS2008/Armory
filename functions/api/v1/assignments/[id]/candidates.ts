import { rankCandidates } from '../../../../../shared/candidates';
import { ErrorCodes } from '../../../../../shared/errors';
import { Permissions } from '../../../../../shared/rbac';
import { DAY } from '../../../../../shared/time';
import { requireUser } from '../../../../_lib/auth';
import {
  evaluateWindow,
  engineQualifications,
  toEngineAbsences,
  toEngineAssignment,
  toEnginePerson,
} from '../../../../_lib/data';
import { fail, ok, searchParams, type Env } from '../../../../_lib/http';

/** Ranked, explainable suggestions. The scheduler still chooses (plan 6.7). */
export const onRequestGet: PagesFunction<Env> = async ({ request, env, params }) => {
  const user = await requireUser(request, env, Permissions.assignmentsAssign);
  if (user instanceof Response) return user;
  const assignmentId = String(params.id);

  const row = await env.DB.prepare(
    'SELECT start_at, end_at, unit_id FROM assignment_instances WHERE id = ? AND status = ?',
  )
    .bind(assignmentId, 'planned')
    .first<{ start_at: number; end_at: number; unit_id: string | null }>();
  if (!row) return fail(404, ErrorCodes.NOT_FOUND);

  const evaluation = await evaluateWindow(env, {
    from: row.start_at - 21 * DAY,
    to: row.end_at + 8 * DAY,
  });
  const assignment = evaluation.assignments.find((item) => item.id === assignmentId);
  if (!assignment) return fail(404, ErrorCodes.NOT_FOUND);

  /*
   * The pool is the whole company unless the caller narrows it.
   *
   * It used to fall back to the assignment's own unit, which quietly hid every
   * driver and commander who happened to belong to another platoon — the list
   * looked like the ranking had ignored the roster, when in fact the roster had
   * never been offered. A post is staffed by whoever the unit has.
   */
  const onlyUnit = searchParams(request).get('unitId');
  const pool = evaluation.personnel.filter(
    (person) =>
      person.status === 'active' &&
      !assignment.assignees.some((assignee) => assignee.personnelId === person.id) &&
      (!onlyUnit || person.unitId === onlyUnit),
  );

  const qualifications = await engineQualifications(env);
  const candidates = rankCandidates({
    assignment: toEngineAssignment(assignment),
    personnel: pool.map(toEnginePerson),
    roster: evaluation.personnel.map(toEnginePerson),
    assignments: evaluation.assignments.map(toEngineAssignment),
    absences: toEngineAbsences(evaluation.availability),
    rules: evaluation.rules,
    ...qualifications,
    timezone: evaluation.timezone,
  });

  return ok({ candidates });
};
