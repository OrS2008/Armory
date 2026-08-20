import { ErrorCodes } from '../../../../shared/errors';
import { Permissions, can } from '../../../../shared/rbac';
import { availabilitySchema } from '../../../../shared/schemas';
import { AuditActions, writeAudit } from '../../../_lib/audit';
import { requireUser } from '../../../_lib/auth';
import { loadAvailability } from '../../../_lib/data';
import {
  checkOrigin,
  fail,
  intParam,
  newId,
  now,
  ok,
  readBody,
  searchParams,
  type Env,
} from '../../../_lib/http';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const user = await requireUser(request, env);
  if (user instanceof Response) return user;
  const params = searchParams(request);

  // A soldier may only read their own availability.
  const requestedPersonnelId = params.get('personnelId');
  const readsOthers = requestedPersonnelId !== user.personnelId;
  if (readsOthers && !can(user, Permissions.availabilityRead)) {
    return fail(403, ErrorCodes.FORBIDDEN);
  }

  const query: Parameters<typeof loadAvailability>[1] = {};
  if (params.has('from')) query.from = intParam(params, 'from', 0);
  if (params.has('to')) query.to = intParam(params, 'to', 0);
  if (requestedPersonnelId) query.personnelId = requestedPersonnelId;
  else if (!can(user, Permissions.availabilityRead) && user.personnelId) {
    query.personnelId = user.personnelId;
  }
  if (params.has('status')) query.status = params.get('status') as string;

  return ok({ availability: await loadAvailability(env, query) });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const origin = checkOrigin(request);
  if (origin) return origin;
  const user = await requireUser(request, env);
  if (user instanceof Response) return user;
  const input = await readBody(request, availabilitySchema);
  if (input instanceof Response) return input;

  const isOwn = input.personnelId === user.personnelId;
  const mayManage = can(user, Permissions.availabilityWrite);
  const mayRequest = can(user, Permissions.availabilityRequest);
  if (!mayManage && !(isOwn && mayRequest)) return fail(403, ErrorCodes.FORBIDDEN);

  // Records entered by a soldier start as requests; a scheduler's entry is
  // approved immediately (plan section 6.5).
  const status = mayManage ? (input.status ?? 'approved') : 'pending';

  const id = newId('avl');
  const timestamp = now();
  await env.DB.prepare(
    `INSERT INTO availability (id, personnel_id, kind, start_at, end_at, status, reason,
                               requested_by, decided_by, decided_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      input.personnelId,
      input.kind,
      input.startAt,
      input.endAt,
      status,
      input.reason ?? null,
      user.id,
      status === 'approved' ? user.id : null,
      status === 'approved' ? timestamp : null,
      timestamp,
      timestamp,
    )
    .run();
  await writeAudit(env, user, AuditActions.AVAILABILITY_CREATED, 'availability', id, {
    personnelId: input.personnelId,
    kind: input.kind,
    status,
  });
  return ok({ id, status });
};
