import { Permissions } from '../../../../shared/rbac';
import { unitSchema } from '../../../../shared/schemas';
import { AuditActions, writeAudit } from '../../../_lib/audit';
import { requireUser } from '../../../_lib/auth';
import { DEFAULT_ORG_ID, boolToInt, loadUnits } from '../../../_lib/data';
import { checkOrigin, newId, now, ok, readBody, type Env } from '../../../_lib/http';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const user = await requireUser(request, env, Permissions.unitsRead);
  if (user instanceof Response) return user;
  return ok({ units: await loadUnits(env) });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const origin = checkOrigin(request);
  if (origin) return origin;
  const user = await requireUser(request, env, Permissions.unitsWrite);
  if (user instanceof Response) return user;
  const input = await readBody(request, unitSchema);
  if (input instanceof Response) return input;

  const id = newId('unt');
  const timestamp = now();
  await env.DB.prepare(
    `INSERT INTO units (id, org_id, parent_id, name, kind, sort_order, active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      DEFAULT_ORG_ID,
      input.parentId ?? null,
      input.name,
      input.kind,
      input.sortOrder ?? 0,
      boolToInt(input.active, 1),
      timestamp,
      timestamp,
    )
    .run();
  await writeAudit(env, user, AuditActions.UNIT_CREATED, 'unit', id, { kind: input.kind });
  return ok({ id });
};
