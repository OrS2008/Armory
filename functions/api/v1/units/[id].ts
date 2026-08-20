import { ErrorCodes } from '../../../../shared/errors';
import { Permissions } from '../../../../shared/rbac';
import { unitSchema } from '../../../../shared/schemas';
import { AuditActions, writeAudit } from '../../../_lib/audit';
import { requireUser } from '../../../_lib/auth';
import { boolToInt } from '../../../_lib/data';
import { checkOrigin, fail, now, ok, readBody, type Env } from '../../../_lib/http';

export const onRequestPatch: PagesFunction<Env> = async ({ request, env, params }) => {
  const origin = checkOrigin(request);
  if (origin) return origin;
  const user = await requireUser(request, env, Permissions.unitsWrite);
  if (user instanceof Response) return user;
  const id = String(params.id);
  const input = await readBody(request, unitSchema.partial());
  if (input instanceof Response) return input;

  const existing = await env.DB.prepare('SELECT id, active FROM units WHERE id = ?')
    .bind(id)
    .first<{ id: string; active: number }>();
  if (!existing) return fail(404, ErrorCodes.NOT_FOUND);
  if (input.parentId === id) return fail(422, ErrorCodes.VALIDATION_FAILED);

  await env.DB.prepare(
    `UPDATE units
        SET name = COALESCE(?, name),
            kind = COALESCE(?, kind),
            parent_id = ?,
            sort_order = COALESCE(?, sort_order),
            active = ?,
            updated_at = ?
      WHERE id = ?`,
  )
    .bind(
      input.name ?? null,
      input.kind ?? null,
      input.parentId === undefined ? null : input.parentId,
      input.sortOrder ?? null,
      boolToInt(input.active, existing.active),
      now(),
      id,
    )
    .run();
  await writeAudit(env, user, AuditActions.UNIT_UPDATED, 'unit', id, {
    fields: Object.keys(input),
  });
  return ok({ id });
};
