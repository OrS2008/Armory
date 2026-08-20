import { ErrorCodes } from '../../../../shared/errors';
import { Permissions } from '../../../../shared/rbac';
import { replacementDecisionSchema } from '../../../../shared/schemas';
import {
  AuditActions,
  auditStatement,
  notificationStatement,
  usersForPersonnel,
} from '../../../_lib/audit';
import { requireUser } from '../../../_lib/auth';
import { checkOrigin, fail, newId, now, ok, readBody, type Env } from '../../../_lib/http';

/**
 * Approving a replacement swaps the two people on the assignment in a single
 * batch, so the schedule never shows both or neither.
 */
export const onRequestPatch: PagesFunction<Env> = async ({ request, env, params }) => {
  const origin = checkOrigin(request);
  if (origin) return origin;
  const user = await requireUser(request, env, Permissions.replacementsDecide);
  if (user instanceof Response) return user;
  const id = String(params.id);
  const input = await readBody(request, replacementDecisionSchema);
  if (input instanceof Response) return input;

  const existing = await env.DB.prepare(
    `SELECT r.id, r.assignment_id, r.personnel_id, r.replacement_personnel_id, r.status,
            a.publication_state
       FROM replacement_requests r
       JOIN assignment_instances a ON a.id = r.assignment_id
      WHERE r.id = ?`,
  )
    .bind(id)
    .first<{
      id: string;
      assignment_id: string;
      personnel_id: string;
      replacement_personnel_id: string | null;
      status: string;
      publication_state: string;
    }>();
  if (!existing) return fail(404, ErrorCodes.NOT_FOUND);

  const replacementId = input.replacementPersonnelId ?? existing.replacement_personnel_id;
  if (input.status === 'approved' && !replacementId) {
    return fail(422, ErrorCodes.VALIDATION_FAILED, {
      fields: { replacementPersonnelId: 'יש לבחור מחליף לפני האישור' },
    });
  }

  const timestamp = now();
  const statements = [
    env.DB.prepare(
      `UPDATE replacement_requests
          SET status = ?, replacement_personnel_id = ?, decided_by = ?, decided_at = ?, updated_at = ?
        WHERE id = ?`,
    ).bind(input.status, replacementId ?? null, user.id, timestamp, timestamp, id),
  ];

  if (input.status === 'approved' && replacementId) {
    statements.push(
      env.DB.prepare(
        'DELETE FROM assignment_personnel WHERE assignment_id = ? AND personnel_id = ?',
      ).bind(existing.assignment_id, existing.personnel_id),
      env.DB.prepare(
        `INSERT OR IGNORE INTO assignment_personnel (id, assignment_id, personnel_id, assigned_by, assigned_at)
         VALUES (?, ?, ?, ?, ?)`,
      ).bind(newId('apr'), existing.assignment_id, replacementId, user.id, timestamp),
      env.DB.prepare(
        `UPDATE assignment_instances
            SET publication_state = CASE WHEN publication_state = 'published' THEN 'modified' ELSE publication_state END,
                updated_by = ?, updated_at = ?
          WHERE id = ?`,
      ).bind(user.id, timestamp, existing.assignment_id),
    );

    const recipients = await usersForPersonnel(
      env,
      [existing.personnel_id, replacementId].filter(Boolean),
    );
    for (const [personnelId, userId] of recipients) {
      statements.push(
        notificationStatement(
          env,
          userId,
          'REPLACEMENT_APPROVED',
          personnelId === replacementId ? 'שובצת כמחליף' : 'בקשת ההחלפה אושרה',
          null,
          'assignment',
          existing.assignment_id,
        ),
      );
    }
  }

  statements.push(
    auditStatement(env, user, AuditActions.REPLACEMENT_DECIDED, 'replacement', id, {
      status: input.status,
      assignmentId: existing.assignment_id,
    }),
  );

  await env.DB.batch(statements);
  return ok({ id, status: input.status, replacementPersonnelId: replacementId ?? null });
};
