import { Permissions } from '../../../../shared/rbac';
import { scheduleSchema } from '../../../../shared/schemas';
import type { Schedule } from '../../../../shared/types';
import { AuditActions, writeAudit } from '../../../_lib/audit';
import { requireScope, requireUser } from '../../../_lib/auth';
import { DEFAULT_ORG_ID } from '../../../_lib/data';
import { checkOrigin, newId, now, ok, readBody, type Env } from '../../../_lib/http';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const user = await requireUser(request, env, Permissions.schedulesRead);
  if (user instanceof Response) return user;
  const rows = await env.DB.prepare(
    `SELECT id, unit_id, name, start_date, end_date, status, version, published_at, created_at
       FROM schedules WHERE org_id = ? ORDER BY start_date DESC LIMIT 100`,
  )
    .bind(DEFAULT_ORG_ID)
    .all<{
      id: string;
      unit_id: string | null;
      name: string;
      start_date: string;
      end_date: string;
      status: Schedule['status'];
      version: number;
      published_at: number | null;
      created_at: number;
    }>();

  return ok({
    schedules: (rows.results ?? []).map((row) => ({
      id: row.id,
      unitId: row.unit_id,
      name: row.name,
      startDate: row.start_date,
      endDate: row.end_date,
      status: row.status,
      version: row.version,
      publishedAt: row.published_at,
      createdAt: row.created_at,
    })),
  });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const origin = checkOrigin(request);
  if (origin) return origin;
  const user = await requireUser(request, env, Permissions.schedulesWrite);
  if (user instanceof Response) return user;
  const input = await readBody(request, scheduleSchema);
  if (input instanceof Response) return input;
  const outOfScope = await requireScope(env, user, input.unitId ?? null);
  if (outOfScope) return outOfScope;

  const id = newId('sch');
  const timestamp = now();
  await env.DB.prepare(
    `INSERT INTO schedules (id, org_id, unit_id, name, start_date, end_date, status, version,
                            created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'draft', 0, ?, ?, ?)`,
  )
    .bind(
      id,
      DEFAULT_ORG_ID,
      input.unitId ?? null,
      input.name,
      input.startDate,
      input.endDate,
      user.id,
      timestamp,
      timestamp,
    )
    .run();
  await writeAudit(env, user, AuditActions.SCHEDULE_CREATED, 'schedule', id, {
    startDate: input.startDate,
    endDate: input.endDate,
  });
  return ok({ id });
};
