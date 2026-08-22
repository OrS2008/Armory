import { ErrorCodes } from '../../../../shared/errors';
import { Permissions } from '../../../../shared/rbac';
import { qualificationSchema } from '../../../../shared/schemas';
import { AuditActions, writeAudit } from '../../../_lib/audit';
import { requireUser } from '../../../_lib/auth';
import { boolToInt } from '../../../_lib/data';
import { checkOrigin, fail, now, ok, readBody, type Env } from '../../../_lib/http';

export const onRequestPatch: PagesFunction<Env> = async ({ request, env, params }) => {
  const origin = checkOrigin(request);
  if (origin) return origin;
  const user = await requireUser(request, env, Permissions.qualificationsWrite);
  if (user instanceof Response) return user;
  const id = String(params.id);
  const input = await readBody(request, qualificationSchema.partial());
  if (input instanceof Response) return input;

  const existing = await env.DB.prepare(
    'SELECT active, exclusive, blocks_scheduling FROM qualifications WHERE id = ?',
  )
    .bind(id)
    .first<{ active: number; exclusive: number; blocks_scheduling: number }>();
  if (!existing) return fail(404, ErrorCodes.NOT_FOUND);

  await env.DB.prepare(
    `UPDATE qualifications
        SET code = COALESCE(?, code), name = COALESCE(?, name), description = COALESCE(?, description),
            active = ?, exclusive = ?, blocks_scheduling = ?, updated_at = ?
      WHERE id = ?`,
  )
    .bind(
      input.code ?? null,
      input.name ?? null,
      input.description ?? null,
      boolToInt(input.active, existing.active),
      boolToInt(input.exclusive, existing.exclusive),
      boolToInt(input.blocksScheduling, existing.blocks_scheduling),
      now(),
      id,
    )
    .run();
  await writeAudit(env, user, AuditActions.QUALIFICATION_UPDATED, 'qualification', id, {
    fields: Object.keys(input),
  });
  return ok({ id });
};
