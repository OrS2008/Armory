import { ErrorCodes } from '../../../../../shared/errors';
import { AuditActions, writeAudit } from '../../../../_lib/audit';
import { requireUser } from '../../../../_lib/auth';
import { checkOrigin, fail, now, ok, type Env } from '../../../../_lib/http';

/** A soldier confirms they have seen their own assignment. */
export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) => {
  const origin = checkOrigin(request);
  if (origin) return origin;
  const user = await requireUser(request, env);
  if (user instanceof Response) return user;
  if (!user.personnelId) return fail(403, ErrorCodes.FORBIDDEN);
  const assignmentId = String(params.id);

  const result = await env.DB.prepare(
    'UPDATE assignment_personnel SET acknowledged_at = ? WHERE assignment_id = ? AND personnel_id = ?',
  )
    .bind(now(), assignmentId, user.personnelId)
    .run();
  if (!result.meta.changes) return fail(404, ErrorCodes.NOT_FOUND);

  await writeAudit(env, user, AuditActions.ASSIGNMENT_ACKNOWLEDGED, 'assignment', assignmentId, {
    personnelId: user.personnelId,
  });
  return ok({ assignmentId, acknowledged: true });
};
