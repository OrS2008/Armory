import { computeWorkload } from '../../../../shared/fairness';
import { Permissions, expandScope } from '../../../../shared/rbac';
import { DAY } from '../../../../shared/time';
import { requireUser, unitParents } from '../../../_lib/auth';
import { evaluateWindow, toEngineAssignment } from '../../../_lib/data';
import { intParam, ok, searchParams, type Env } from '../../../_lib/http';

/** Per-person workload for the reports screen and CSV export. */
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const user = await requireUser(request, env, Permissions.reportsRead);
  if (user instanceof Response) return user;
  const params = searchParams(request);
  const from = intParam(params, 'from', Date.now() - 30 * DAY);
  const to = intParam(params, 'to', Date.now());
  const scoped = expandScope(user.unitScope, await unitParents(env));

  const evaluation = await evaluateWindow(env, { from, to, unitIds: scoped });
  const engineAssignments = evaluation.assignments.map(toEngineAssignment);

  const rows = evaluation.personnel
    .filter((person) => person.status === 'active')
    .map((person) => {
      const workload = computeWorkload(person.id, engineAssignments, {
        windowStart: from,
        windowEnd: to,
        timezone: evaluation.timezone,
      });
      return {
        personnelId: person.id,
        displayName: person.displayName,
        unitName: person.unitName,
        totalHours: Math.round(workload.totalHours * 10) / 10,
        nightHours: Math.round(workload.nightHours * 10) / 10,
        weekendHours: Math.round(workload.weekendHours * 10) / 10,
        assignmentCount: workload.assignmentCount,
        score: workload.score,
      };
    })
    .sort((a, b) => b.totalHours - a.totalHours);

  const staffingGaps = evaluation.assignments
    .filter((assignment) => assignment.assignees.length < assignment.requiredHeadcount)
    .map((assignment) => ({
      assignmentId: assignment.id,
      title: assignment.title ?? assignment.assignmentTypeName,
      startAt: assignment.startAt,
      endAt: assignment.endAt,
      missing: assignment.requiredHeadcount - assignment.assignees.length,
    }));

  return ok({ window: { from, to }, workload: rows, staffingGaps, timezone: evaluation.timezone });
};
