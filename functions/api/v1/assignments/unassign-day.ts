import { ErrorCodes } from '../../../../shared/errors';
import { Permissions, expandScope } from '../../../../shared/rbac';
import { unassignDaySchema } from '../../../../shared/schemas';
import { endOfDay, startOfDay } from '../../../../shared/time';
import {
  AuditActions,
  notificationStatement,
  usersForPersonnel,
  writeAudit,
} from '../../../_lib/audit';
import { requireUser, unitParents } from '../../../_lib/auth';
import { DEFAULT_ORG_ID, chunked, orgTimezone, placeholders } from '../../../_lib/data';
import { checkOrigin, fail, now, ok, readBody, type Env } from '../../../_lib/http';

/**
 * "כפתור שמנקה את כל השיבוצים לאותו יום" — the group version of the per-person
 * "day" unassign scope: every person comes off every shift that starts on one
 * local day, in one action. The shifts themselves stay, empty and ready to be
 * staffed again; only the roster on them is undone.
 */
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const origin = checkOrigin(request);
  if (origin) return origin;
  const user = await requireUser(request, env, Permissions.assignmentsAssign);
  if (user instanceof Response) return user;
  const input = await readBody(request, unassignDaySchema);
  if (input instanceof Response) return input;

  const timezone = await orgTimezone(env);
  const scoped = expandScope(user.unitScope, await unitParents(env));
  // An empty scope list means "no unit at all", which must not silently widen
  // into the whole company.
  if (scoped && scoped.length === 0) return fail(403, ErrorCodes.OUT_OF_SCOPE);
  const scopeFilter =
    scoped && scoped.length > 0
      ? `AND (unit_id IS NULL OR unit_id IN (${scoped.map(() => '?').join(',')}))`
      : '';

  const rows = await env.DB.prepare(
    `SELECT id FROM assignment_instances
      WHERE org_id = ? AND status = 'planned' AND start_at >= ? AND start_at < ? ${scopeFilter}`,
  )
    .bind(
      DEFAULT_ORG_ID,
      startOfDay(input.day, timezone),
      endOfDay(input.day, timezone),
      ...(scoped ?? []),
    )
    .all<{ id: string }>();
  const assignmentIds = (rows.results ?? []).map((row) => row.id);
  if (assignmentIds.length === 0) return ok({ day: input.day, assignments: 0, removed: 0 });

  const pages = await Promise.all(
    chunked(assignmentIds).map((slice) =>
      env.DB.prepare(
        `SELECT assignment_id, personnel_id FROM assignment_personnel
          WHERE assignment_id IN (${placeholders(slice)})`,
      )
        .bind(...slice)
        .all<{ assignment_id: string; personnel_id: string }>(),
    ),
  );
  const removedRows = pages.flatMap((page) => page.results ?? []);
  if (removedRows.length === 0)
    return ok({ day: input.day, assignments: assignmentIds.length, removed: 0 });

  const timestamp = now();
  const statements: D1PreparedStatement[] = [];
  for (const slice of chunked(assignmentIds)) {
    statements.push(
      env.DB.prepare(
        `DELETE FROM assignment_personnel WHERE assignment_id IN (${placeholders(slice)})`,
      ).bind(...slice),
    );
    statements.push(
      env.DB.prepare(
        `UPDATE assignment_instances
            SET publication_state = CASE publication_state WHEN 'published' THEN 'modified'
                                    ELSE publication_state END,
                updated_by = ?, updated_at = ?
          WHERE id IN (${placeholders(slice)})`,
      ).bind(user.id, timestamp, ...slice),
    );
  }

  const personnelIds = [...new Set(removedRows.map((row) => row.personnel_id))];
  const recipients = await usersForPersonnel(env, personnelIds);
  for (const personnelId of personnelIds) {
    const recipient = recipients.get(personnelId);
    if (!recipient) continue;
    statements.push(
      notificationStatement(
        env,
        recipient,
        'ASSIGNMENT_REMOVED',
        'הוסרת ממשימות היום',
        null,
        'assignment',
        assignmentIds[0]!,
      ),
    );
  }

  await env.DB.batch(statements);
  await writeAudit(env, user, AuditActions.PERSONNEL_UNASSIGNED, 'assignment', assignmentIds[0]!, {
    day: input.day,
    assignments: assignmentIds.length,
    removed: removedRows.length,
  });

  return ok({ day: input.day, assignments: assignmentIds.length, removed: removedRows.length });
};
