import { ErrorCodes } from '../../../../shared/errors';
import { Permissions, can } from '../../../../shared/rbac';
import { availabilityPatchSchema } from '../../../../shared/schemas';
import {
  AuditActions,
  diff,
  notificationStatement,
  usersForPersonnel,
  writeAudit,
} from '../../../_lib/audit';
import { requireUser } from '../../../_lib/auth';
import { checkOrigin, fail, now, ok, readBody, type Env } from '../../../_lib/http';
import { availabilityKindLabels } from '../../../../shared/messages.he';
import type { AvailabilityKind } from '../../../../shared/types';

/**
 * Two edits share this route: a manager's decision (`status`) and a
 * correction to what was actually requested (`kind`, the dates, `reason`).
 * Each is gated on its own permission so approving something never doubles
 * as a licence to rewrite it, and rewriting a request never doubles as
 * approving it.
 */
export const onRequestPatch: PagesFunction<Env> = async ({ request, env, params }) => {
  const origin = checkOrigin(request);
  if (origin) return origin;
  const user = await requireUser(request, env);
  if (user instanceof Response) return user;
  const id = String(params.id);
  const input = await readBody(request, availabilityPatchSchema);
  if (input instanceof Response) return input;

  const existing = await env.DB.prepare(
    'SELECT personnel_id, kind, status, start_at, end_at, reason FROM availability WHERE id = ?',
  )
    .bind(id)
    .first<{
      personnel_id: string;
      kind: AvailabilityKind;
      status: string;
      start_at: number;
      end_at: number;
      reason: string | null;
    }>();
  if (!existing) return fail(404, ErrorCodes.NOT_FOUND);

  const editingFields =
    input.kind !== undefined ||
    input.startAt !== undefined ||
    input.endAt !== undefined ||
    (input.reason !== undefined && input.status === undefined);
  const isDecision = input.status !== undefined;
  if (!editingFields && !isDecision) {
    return fail(422, ErrorCodes.VALIDATION_FAILED, { fields: {} });
  }
  const isOwnPending = existing.personnel_id === user.personnelId && existing.status === 'pending';
  if (editingFields && !can(user, Permissions.availabilityWrite) && !isOwnPending) {
    return fail(403, ErrorCodes.FORBIDDEN);
  }
  if (isDecision && !can(user, Permissions.availabilityApprove)) {
    return fail(403, ErrorCodes.FORBIDDEN);
  }

  const kind = input.kind ?? existing.kind;
  const startAt = input.startAt ?? existing.start_at;
  const endAt = input.endAt ?? existing.end_at;
  if (endAt <= startAt) {
    return fail(422, ErrorCodes.VALIDATION_FAILED, {
      fields: { endAt: 'שעת הסיום חייבת להיות אחרי שעת ההתחלה' },
    });
  }
  const reason = input.reason !== undefined ? input.reason : existing.reason;
  const status = input.status ?? existing.status;

  const timestamp = now();
  const statements = [
    env.DB.prepare(
      `UPDATE availability
          SET kind = ?, start_at = ?, end_at = ?, reason = ?, status = ?,
              decided_by = CASE WHEN ? THEN ? ELSE decided_by END,
              decided_at = CASE WHEN ? THEN ? ELSE decided_at END,
              updated_at = ?
        WHERE id = ?`,
    ).bind(
      kind,
      startAt,
      endAt,
      reason,
      status,
      isDecision ? 1 : 0,
      user.id,
      isDecision ? 1 : 0,
      timestamp,
      timestamp,
      id,
    ),
  ];

  if (isDecision) {
    const recipients = await usersForPersonnel(env, [existing.personnel_id]);
    const recipient = recipients.get(existing.personnel_id);
    if (recipient) {
      statements.push(
        notificationStatement(
          env,
          recipient,
          input.status === 'approved' ? 'AVAILABILITY_APPROVED' : 'AVAILABILITY_REJECTED',
          input.status === 'approved' ? 'בקשת הזמינות אושרה' : 'בקשת הזמינות נדחתה',
          availabilityKindLabels[kind],
          'availability',
          id,
        ),
      );
    }
  } else if (editingFields && existing.personnel_id !== user.personnelId) {
    const recipients = await usersForPersonnel(env, [existing.personnel_id]);
    const recipient = recipients.get(existing.personnel_id);
    if (recipient) {
      statements.push(
        notificationStatement(
          env,
          recipient,
          'AVAILABILITY_UPDATED',
          'בקשת הזמינות עודכנה',
          availabilityKindLabels[kind],
          'availability',
          id,
        ),
      );
    }
  }

  await env.DB.batch(statements);
  if (isDecision) {
    await writeAudit(env, user, AuditActions.AVAILABILITY_DECIDED, 'availability', id, {
      status: input.status,
    });
  }
  if (editingFields) {
    await writeAudit(env, user, AuditActions.AVAILABILITY_UPDATED, 'availability', id, {
      changed: diff(
        { kind: existing.kind, startAt: existing.start_at, endAt: existing.end_at },
        { kind, startAt, endAt },
        ['kind', 'startAt', 'endAt'],
      ),
    });
  }
  return ok({ id, status });
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
