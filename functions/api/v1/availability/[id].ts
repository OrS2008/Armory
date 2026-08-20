import { ErrorCodes } from '../../../../shared/errors';
import { Permissions, can } from '../../../../shared/rbac';
import { availabilityDecisionSchema } from '../../../../shared/schemas';
import {
  AuditActions,
  notificationStatement,
  usersForPersonnel,
  writeAudit,
} from '../../../_lib/audit';
import { requireUser } from '../../../_lib/auth';
import { checkOrigin, fail, now, ok, readBody, type Env } from '../../../_lib/http';
import { availabilityKindLabels } from '../../../../shared/messages.he';
import type { AvailabilityKind } from '../../../../shared/types';

export const onRequestPatch: PagesFunction<Env> = async ({ request, env, params }) => {
  const origin = checkOrigin(request);
  if (origin) return origin;
  const user = await requireUser(request, env, Permissions.availabilityApprove);
  if (user instanceof Response) return user;
  const id = String(params.id);
  const input = await readBody(request, availabilityDecisionSchema);
  if (input instanceof Response) return input;

  const existing = await env.DB.prepare(
    'SELECT personnel_id, kind, status FROM availability WHERE id = ?',
  )
    .bind(id)
    .first<{ personnel_id: string; kind: AvailabilityKind; status: string }>();
  if (!existing) return fail(404, ErrorCodes.NOT_FOUND);

  const timestamp = now();
  const statements = [
    env.DB.prepare(
      `UPDATE availability SET status = ?, reason = COALESCE(?, reason), decided_by = ?,
                               decided_at = ?, updated_at = ?
        WHERE id = ?`,
    ).bind(input.status, input.reason ?? null, user.id, timestamp, timestamp, id),
  ];

  const recipients = await usersForPersonnel(env, [existing.personnel_id]);
  const recipient = recipients.get(existing.personnel_id);
  if (recipient) {
    statements.push(
      notificationStatement(
        env,
        recipient,
        input.status === 'approved' ? 'AVAILABILITY_APPROVED' : 'AVAILABILITY_REJECTED',
        input.status === 'approved' ? 'בקשת הזמינות אושרה' : 'בקשת הזמינות נדחתה',
        availabilityKindLabels[existing.kind],
        'availability',
        id,
      ),
    );
  }

  await env.DB.batch(statements);
  await writeAudit(env, user, AuditActions.AVAILABILITY_DECIDED, 'availability', id, {
    status: input.status,
  });
  return ok({ id, status: input.status });
};

export const onRequestDelete: PagesFunction<Env> = async ({ request, env, params }) => {
  const origin = checkOrigin(request);
  if (origin) return origin;
  const user = await requireUser(request, env);
  if (user instanceof Response) return user;
  const id = String(params.id);
  const existing = await env.DB.prepare(
    'SELECT personnel_id, status FROM availability WHERE id = ?',
  )
    .bind(id)
    .first<{ personnel_id: string; status: string }>();
  if (!existing) return fail(404, ErrorCodes.NOT_FOUND);

  const isOwnPending = existing.personnel_id === user.personnelId && existing.status === 'pending';
  if (!can(user, Permissions.availabilityWrite) && !isOwnPending) {
    return fail(403, ErrorCodes.FORBIDDEN);
  }

  await env.DB.prepare('DELETE FROM availability WHERE id = ?').bind(id).run();
  await writeAudit(env, user, AuditActions.AVAILABILITY_UPDATED, 'availability', id, {
    deleted: true,
  });
  return ok({ id, deleted: true });
};
