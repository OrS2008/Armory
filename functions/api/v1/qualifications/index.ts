import { Permissions } from '../../../../shared/rbac';
import { qualificationSchema } from '../../../../shared/schemas';
import { AuditActions, writeAudit } from '../../../_lib/audit';
import { requireUser } from '../../../_lib/auth';
import { DEFAULT_ORG_ID, boolToInt, loadQualifications } from '../../../_lib/data';
import { checkOrigin, fail, newId, now, ok, readBody, type Env } from '../../../_lib/http';
import { ErrorCodes } from '../../../../shared/errors';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const user = await requireUser(request, env, Permissions.qualificationsRead);
  if (user instanceof Response) return user;
  return ok({ qualifications: await loadQualifications(env) });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const origin = checkOrigin(request);
  if (origin) return origin;
  const user = await requireUser(request, env, Permissions.qualificationsWrite);
  if (user instanceof Response) return user;
  const input = await readBody(request, qualificationSchema);
  if (input instanceof Response) return input;

  const duplicate = await env.DB.prepare(
    'SELECT id FROM qualifications WHERE org_id = ? AND code = ?',
  )
    .bind(DEFAULT_ORG_ID, input.code)
    .first<{ id: string }>();
  if (duplicate) return fail(409, ErrorCodes.CONFLICT);

  const id = newId('qlf');
  const timestamp = now();
  await env.DB.prepare(
    `INSERT INTO qualifications
       (id, org_id, code, name, description, active, exclusive, blocks_scheduling,
        created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      DEFAULT_ORG_ID,
      input.code,
      input.name,
      input.description ?? null,
      boolToInt(input.active, 1),
      boolToInt(input.exclusive, 0),
      boolToInt(input.blocksScheduling, 0),
      timestamp,
      timestamp,
    )
    .run();
  await writeAudit(env, user, AuditActions.QUALIFICATION_CREATED, 'qualification', id);
  return ok({ id });
};
