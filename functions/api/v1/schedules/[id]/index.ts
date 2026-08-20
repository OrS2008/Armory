import { ErrorCodes } from '../../../../../shared/errors';
import { Permissions } from '../../../../../shared/rbac';
import { requireUser } from '../../../../_lib/auth';
import { loadSchedule, scheduleWindow } from '../../../../_lib/schedules';
import { evaluateWindow } from '../../../../_lib/data';
import { fail, ok, type Env } from '../../../../_lib/http';

export const onRequestGet: PagesFunction<Env> = async ({ request, env, params }) => {
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

  const versions = await env.DB.prepare(
    'SELECT id, version, note, created_at FROM schedule_versions WHERE schedule_id = ? ORDER BY version DESC',
  )
    .bind(schedule.id)
    .all<{ id: string; version: number; note: string | null; created_at: number }>();

  return ok({
    schedule,
    assignments: evaluation.assignments,
    conflicts: evaluation.conflicts,
    versions: versions.results ?? [],
    timezone: evaluation.timezone,
  });
};
