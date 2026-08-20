import { summarizeConflicts } from '../../../../../shared/conflicts';
import { ErrorCodes } from '../../../../../shared/errors';
import { Permissions } from '../../../../../shared/rbac';
import { requireUser } from '../../../../_lib/auth';
import { evaluateWindow } from '../../../../_lib/data';
import { checkOrigin, fail, ok, type Env } from '../../../../_lib/http';
import { loadSchedule, scheduleWindow } from '../../../../_lib/schedules';

/** Dry run of the publication gate — same evaluation, no writes. */
export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) => {
  const origin = checkOrigin(request);
  if (origin) return origin;
  const user = await requireUser(request, env, Permissions.schedulesRead);
  if (user instanceof Response) return user;
  const schedule = await loadSchedule(env, String(params.id));
  if (!schedule) return fail(404, ErrorCodes.NOT_FOUND);

  const window = await scheduleWindow(env, schedule);
  const evaluation = await evaluateWindow(env, {
    from: window.from,
    to: window.to,
    scheduleId: schedule.id,
  });
  const summary = summarizeConflicts(evaluation.conflicts);

  return ok({
    scheduleId: schedule.id,
    publishable: summary.blocking === 0,
    summary,
    conflicts: evaluation.conflicts,
    assignmentCount: evaluation.assignments.length,
  });
};
