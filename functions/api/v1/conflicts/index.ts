import { summarizeConflicts } from '../../../../shared/conflicts';
import { Permissions, expandScope } from '../../../../shared/rbac';
import { DAY } from '../../../../shared/time';
import { requireUser, unitParents } from '../../../_lib/auth';
import { evaluateWindow } from '../../../_lib/data';
import { intParam, ok, searchParams, type Env } from '../../../_lib/http';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const user = await requireUser(request, env, Permissions.assignmentsRead);
  if (user instanceof Response) return user;
  const params = searchParams(request);
  const from = intParam(params, 'from', Date.now() - DAY);
  const to = intParam(params, 'to', Date.now() + 14 * DAY);
  const scoped = expandScope(user.unitScope, await unitParents(env));

  const evaluation = await evaluateWindow(env, { from, to, unitIds: scoped });
  const severity = params.get('severity');
  const conflicts = severity
    ? evaluation.conflicts.filter((conflict) => conflict.severity === severity)
    : evaluation.conflicts;

  return ok({
    conflicts,
    summary: summarizeConflicts(evaluation.conflicts),
    window: { from, to },
  });
};
