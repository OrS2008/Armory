import { ErrorCodes } from '../../../../../shared/errors';
import { Permissions } from '../../../../../shared/rbac';
import { assignPersonnelSchema } from '../../../../../shared/schemas';
import {
  AuditActions,
  notificationStatement,
  usersForPersonnel,
  writeAudit,
} from '../../../../_lib/audit';
import { requireScope, requireUser } from '../../../../_lib/auth';
import { checkOrigin, fail, now, ok, readBody, type Env } from '../../../../_lib/http';

export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) => {
  const origin = checkOrigin(request);
  if (origin) return origin;
  const user = await requireUser(request, env, Permissions.assignmentsAssign);
  if (user instanceof Response) return user;
  const assignmentId = String(params.id);
  const input = await readBody(request, assignPersonnelSchema.pick({ personnelId: true }));
  if (input instanceof Response) return input;

  const row = await env.DB.prepare(
    'SELECT unit_id, publication_state FROM assignment_instances WHERE id = ?',
  )
    .bind(assignmentId)
    .first<{ unit_id: string | null; publication_state: string }>();
  if (!row) return fail(404, ErrorCodes.NOT_FOUND);
  const outOfScope = await requireScope(env, user, row.unit_id);
  if (outOfScope) return outOfScope;

  const timestamp = now();
  const publicationState =
    row.publication_state === 'published' ? 'modified' : row.publication_state;
  const statements = [
    env.DB.prepare(
      'DELETE FROM assignment_personnel WHERE assignment_id = ? AND personnel_id = ?',
    ).bind(assignmentId, input.personnelId),
    env.DB.prepare(
      'UPDATE assignment_instances SET publication_state = ?, updated_by = ?, updated_at = ? WHERE id = ?',
    ).bind(publicationState, user.id, timestamp, assignmentId),
  ];

  const recipients = await usersForPersonnel(env, [input.personnelId]);
  const recipient = recipients.get(input.personnelId);
  if (recipient && row.publication_state !== 'draft') {
    statements.push(
      notificationStatement(
        env,
        recipient,
        'ASSIGNMENT_REMOVED',
        'הוסרת ממשימה',
        null,
        'assignment',
        assignmentId,
      ),
    );
  }

  await env.DB.batch(statements);
  await writeAudit(env, user, AuditActions.PERSONNEL_UNASSIGNED, 'assignment', assignmentId, {
    personnelId: input.personnelId,
  });
  return ok({ assignmentId, personnelId: input.personnelId, publicationState });
};
