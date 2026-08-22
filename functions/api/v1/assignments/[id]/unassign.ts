import { ErrorCodes } from '../../../../../shared/errors';
import { Permissions, expandScope } from '../../../../../shared/rbac';
import { unassignPersonnelSchema } from '../../../../../shared/schemas';
import { dayKey, endOfDay, startOfDay } from '../../../../../shared/time';
import {
  AuditActions,
  notificationStatement,
  usersForPersonnel,
  writeAudit,
} from '../../../../_lib/audit';
import { requireScope, requireUser, unitParents } from '../../../../_lib/auth';
import { DEFAULT_ORG_ID, orgTimezone } from '../../../../_lib/data';
import { checkOrigin, fail, now, ok, readBody, type Env } from '../../../../_lib/http';

export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) => {
  const origin = checkOrigin(request);
  if (origin) return origin;
  const user = await requireUser(request, env, Permissions.assignmentsAssign);
  if (user instanceof Response) return user;
  const assignmentId = String(params.id);
  const input = await readBody(request, unassignPersonnelSchema);
  if (input instanceof Response) return input;

  const row = await env.DB.prepare(
    'SELECT unit_id, start_at, publication_state FROM assignment_instances WHERE id = ?',
  )
    .bind(assignmentId)
    .first<{ unit_id: string | null; start_at: number; publication_state: string }>();
  if (!row) return fail(404, ErrorCodes.NOT_FOUND);
  const outOfScope = await requireScope(env, user, row.unit_id);
  if (outOfScope) return outOfScope;

  /*
   * "כפתור הסרת שיבוץ כולל לאותו היום".
   *
   * Taking somebody off one shift at a time is how a person ends up half
   * removed — off the morning patrol, still down for the evening one. When the
   * caller means the day, the day is what happens, in one transaction.
   */
  let assignmentIds = [assignmentId];
  if (input.scope === 'day') {
    const timezone = await orgTimezone(env);
    const key = dayKey(row.start_at, timezone);
    const scoped = expandScope(user.unitScope, await unitParents(env));
    const scopeFilter =
      scoped && scoped.length > 0
        ? `AND (a.unit_id IS NULL OR a.unit_id IN (${scoped.map(() => '?').join(',')}))`
        : '';
    // An empty scope list means "no unit at all", which must not silently widen
    // into the whole company.
    if (scoped && scoped.length === 0) return fail(403, ErrorCodes.OUT_OF_SCOPE);

    const sameDay = await env.DB.prepare(
      `SELECT a.id FROM assignment_instances a
         JOIN assignment_personnel ap ON ap.assignment_id = a.id
        WHERE ap.personnel_id = ? AND a.org_id = ? AND a.start_at >= ? AND a.start_at <= ?
          ${scopeFilter}`,
    )
      .bind(
        input.personnelId,
        DEFAULT_ORG_ID,
        startOfDay(key, timezone),
        endOfDay(key, timezone),
        ...(scoped ?? []),
      )
      .all<{ id: string }>();
    assignmentIds = [...new Set([assignmentId, ...(sameDay.results ?? []).map((item) => item.id)])];
  }

  const timestamp = now();
  const placeholders = assignmentIds.map(() => '?').join(',');
  const statements = [
    env.DB.prepare(
      `DELETE FROM assignment_personnel
        WHERE personnel_id = ? AND assignment_id IN (${placeholders})`,
    ).bind(input.personnelId, ...assignmentIds),
    env.DB.prepare(
      `UPDATE assignment_instances
          SET publication_state = CASE publication_state WHEN 'published' THEN 'modified'
                                  ELSE publication_state END,
              updated_by = ?, updated_at = ?
        WHERE id IN (${placeholders})`,
    ).bind(user.id, timestamp, ...assignmentIds),
  ];

  const recipients = await usersForPersonnel(env, [input.personnelId]);
  const recipient = recipients.get(input.personnelId);
  // Being taken off a shift is news the moment it happens.
  if (recipient) {
    statements.push(
      notificationStatement(
        env,
        recipient,
        'ASSIGNMENT_REMOVED',
        assignmentIds.length > 1 ? 'הוסרת ממשימות היום' : 'הוסרת ממשימה',
        null,
        'assignment',
        assignmentId,
      ),
    );
  }

  await env.DB.batch(statements);
  await writeAudit(env, user, AuditActions.PERSONNEL_UNASSIGNED, 'assignment', assignmentId, {
    personnelId: input.personnelId,
    scope: input.scope ?? 'shift',
    assignments: assignmentIds.length,
  });
  return ok({
    assignmentId,
    personnelId: input.personnelId,
    removed: assignmentIds.length,
  });
};
