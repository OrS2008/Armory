import { rankCandidates } from '../../../../shared/candidates';
import { ErrorCodes } from '../../../../shared/errors';
import { DAY } from '../../../../shared/time';
import { requireUser } from '../../../_lib/auth';
import {
  engineQualifications,
  evaluateWindow,
  toEngineAbsences,
  toEngineAssignment,
  toEnginePerson,
} from '../../../_lib/data';
import { fail, ok, searchParams, type Env } from '../../../_lib/http';

/**
 * Who could stand this shift instead of me.
 *
 * The scheduler's candidate list ranks the whole roster and shows why — recent
 * workload, rest, the marks somebody holds. A soldier looking for cover has no
 * business reading that about their peers, so this answers the same question
 * with the same engine and returns only the part that is theirs to know: who
 * can, best first. The ranking still decides the order, so the person offered
 * first is the person the roster would have picked.
 *
 * Only for a shift the caller is actually on.
 */
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const user = await requireUser(request, env);
  if (user instanceof Response) return user;
  if (!user.personnelId) return fail(404, ErrorCodes.NOT_FOUND);

  const assignmentId = searchParams(request).get('assignmentId');
  if (!assignmentId)
    return fail(422, ErrorCodes.VALIDATION_FAILED, { fields: { assignmentId: 'חסר מזהה משימה' } });

  const seat = await env.DB.prepare(
    `SELECT ap.role_qualification_id, a.start_at, a.end_at
       FROM assignment_personnel ap
       JOIN assignment_instances a ON a.id = ap.assignment_id
      WHERE ap.assignment_id = ? AND ap.personnel_id = ? AND a.status = 'planned'`,
  )
    .bind(assignmentId, user.personnelId)
    .first<{ role_qualification_id: string | null; start_at: number; end_at: number }>();
  if (!seat) return fail(404, ErrorCodes.NOT_FOUND);

  const evaluation = await evaluateWindow(env, {
    from: seat.start_at - 21 * DAY,
    to: seat.end_at + 8 * DAY,
  });
  const assignment = evaluation.assignments.find((one) => one.id === assignmentId);
  if (!assignment) return fail(404, ErrorCodes.NOT_FOUND);

  /*
   * The shift as it would be without me: otherwise every candidate is ranked
   * against a crew that still has its full complement, and the seat I am
   * vacating never looks open.
   */
  const engineAssignments = evaluation.assignments.map((one) => {
    const engine = toEngineAssignment(one);
    if (one.id !== assignmentId) return engine;
    const roles = { ...engine.assigneeRoles };
    delete roles[user.personnelId as string];
    return {
      ...engine,
      assigneeIds: engine.assigneeIds.filter((each) => each !== user.personnelId),
      assigneeRoles: roles,
    };
  });

  const pool = evaluation.personnel.filter(
    (person) =>
      person.status === 'active' &&
      person.id !== user.personnelId &&
      !assignment.assignees.some((assignee) => assignee.personnelId === person.id) &&
      // A named seat belongs to its mark here too: offering somebody who
      // cannot fill it is offering an arrangement that will be refused.
      (!seat.role_qualification_id || person.qualificationIds.includes(seat.role_qualification_id)),
  );

  const ranked = rankCandidates({
    assignment: {
      ...toEngineAssignment(assignment),
      assigneeIds: assignment.assignees
        .map((assignee) => assignee.personnelId)
        .filter((id) => id !== user.personnelId),
    },
    personnel: pool.map(toEnginePerson),
    roster: evaluation.personnel.map(toEnginePerson),
    assignments: engineAssignments,
    absences: toEngineAbsences(evaluation.availability),
    rules: evaluation.rules,
    ...(await engineQualifications(env)),
    crewsByType: evaluation.crewsByType,
    timezone: evaluation.timezone,
  });

  return ok({
    assignmentId,
    // Names and nothing else. The scores, the workload and the reasons behind
    // them belong to the scheduler's screen, not to a peer's.
    candidates: ranked
      .filter((candidate) => candidate.eligible)
      .map((candidate) => ({
        personnelId: candidate.personnelId,
        displayName: candidate.displayName,
      })),
  });
};
