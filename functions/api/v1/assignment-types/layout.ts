import { ErrorCodes } from '../../../../shared/errors';
import { Permissions } from '../../../../shared/rbac';
import { sheetLayoutSchema } from '../../../../shared/schemas';
import { AuditActions, writeAudit } from '../../../_lib/audit';
import { requireUser } from '../../../_lib/auth';
import { DEFAULT_ORG_ID, loadAssignmentTypes } from '../../../_lib/data';
import { checkOrigin, fail, now, ok, readBody, type Env } from '../../../_lib/http';

/**
 * Where the posts sit on the duty sheet, written in one action.
 *
 * Dragging one card changes the place of every card below it, so the sheet
 * sends the whole page rather than one post: a page written a post at a time
 * is a page that can be half written, and the half-written state is a sheet
 * with two posts in the same slot. One batch, or none of it.
 */
export const onRequestPut: PagesFunction<Env> = async ({ request, env }) => {
  const origin = checkOrigin(request);
  if (origin) return origin;
  const user = await requireUser(request, env, Permissions.assignmentTypesWrite);
  if (user instanceof Response) return user;
  const input = await readBody(request, sheetLayoutSchema);
  if (input instanceof Response) return input;

  const known = new Set((await loadAssignmentTypes(env)).map((type) => type.id));
  const unknown = input.placements.filter((item) => !known.has(item.assignmentTypeId));
  if (unknown.length > 0) return fail(404, ErrorCodes.NOT_FOUND);

  const timestamp = now();
  await env.DB.batch(
    input.placements.map((item) =>
      env.DB.prepare(
        `UPDATE assignment_types
            SET sheet_column = ?, priority = ?, updated_at = ?
          WHERE id = ? AND org_id = ?`,
      ).bind(item.column, item.priority, timestamp, item.assignmentTypeId, DEFAULT_ORG_ID),
    ),
  );

  await writeAudit(
    env,
    user,
    AuditActions.ASSIGNMENT_TYPE_UPDATED,
    'assignment_type_layout',
    DEFAULT_ORG_ID,
    { placements: input.placements },
  );

  return ok({ placements: input.placements.length });
};
