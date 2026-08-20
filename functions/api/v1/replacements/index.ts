import { ErrorCodes } from '../../../../shared/errors';
import { Permissions, can } from '../../../../shared/rbac';
import { replacementSchema } from '../../../../shared/schemas';
import { AuditActions, writeAudit } from '../../../_lib/audit';
import { requireUser } from '../../../_lib/auth';
import {
  checkOrigin,
  fail,
  newId,
  now,
  ok,
  readBody,
  searchParams,
  type Env,
} from '../../../_lib/http';
import type { ReplacementStatus } from '../../../../shared/types';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const user = await requireUser(request, env);
  if (user instanceof Response) return user;
  const params = searchParams(request);

  const filters: string[] = [];
  const bindings: unknown[] = [];
  if (!can(user, Permissions.replacementsRead)) {
    if (!user.personnelId) return ok({ replacements: [] });
    filters.push('(r.personnel_id = ? OR r.replacement_personnel_id = ?)');
    bindings.push(user.personnelId, user.personnelId);
  }
  if (params.has('status')) {
    filters.push('r.status = ?');
    bindings.push(params.get('status'));
  }
  const where = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';

  const rows = await env.DB.prepare(
    `SELECT r.id, r.assignment_id, COALESCE(a.title, t.name) AS assignment_title, a.start_at,
            a.end_at, r.personnel_id, p.display_name AS personnel_name,
            r.replacement_personnel_id, rp.display_name AS replacement_name, r.status, r.reason,
            r.created_at, r.decided_at
       FROM replacement_requests r
       JOIN assignment_instances a ON a.id = r.assignment_id
       JOIN assignment_types t ON t.id = a.assignment_type_id
       JOIN personnel p ON p.id = r.personnel_id
       LEFT JOIN personnel rp ON rp.id = r.replacement_personnel_id
       ${where}
      ORDER BY r.created_at DESC LIMIT 200`,
  )
    .bind(...bindings)
    .all<{
      id: string;
      assignment_id: string;
      assignment_title: string;
      start_at: number;
      end_at: number;
      personnel_id: string;
      personnel_name: string;
      replacement_personnel_id: string | null;
      replacement_name: string | null;
      status: ReplacementStatus;
      reason: string | null;
      created_at: number;
      decided_at: number | null;
    }>();

  return ok({
    replacements: (rows.results ?? []).map((row) => ({
      id: row.id,
      assignmentId: row.assignment_id,
      assignmentTitle: row.assignment_title,
      startAt: row.start_at,
      endAt: row.end_at,
      personnelId: row.personnel_id,
      personnelName: row.personnel_name,
      replacementPersonnelId: row.replacement_personnel_id,
      replacementPersonnelName: row.replacement_name,
      status: row.status,
      reason: row.reason,
      createdAt: row.created_at,
      decidedAt: row.decided_at,
    })),
  });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const origin = checkOrigin(request);
  if (origin) return origin;
  const user = await requireUser(request, env);
  if (user instanceof Response) return user;
  const input = await readBody(request, replacementSchema);
  if (input instanceof Response) return input;

  const isOwn = input.personnelId === user.personnelId;
  if (!isOwn && !can(user, Permissions.replacementsDecide)) {
    return fail(403, ErrorCodes.FORBIDDEN);
  }

  const assigned = await env.DB.prepare(
    'SELECT id FROM assignment_personnel WHERE assignment_id = ? AND personnel_id = ?',
  )
    .bind(input.assignmentId, input.personnelId)
    .first<{ id: string }>();
  if (!assigned) return fail(404, ErrorCodes.NOT_FOUND);

  const id = newId('rep');
  const timestamp = now();
  await env.DB.prepare(
    `INSERT INTO replacement_requests (id, assignment_id, personnel_id, status, reason,
                                       requested_by, created_at, updated_at)
     VALUES (?, ?, ?, 'pending', ?, ?, ?, ?)`,
  )
    .bind(
      id,
      input.assignmentId,
      input.personnelId,
      input.reason ?? null,
      user.id,
      timestamp,
      timestamp,
    )
    .run();
  await writeAudit(env, user, AuditActions.REPLACEMENT_REQUESTED, 'replacement', id, {
    assignmentId: input.assignmentId,
  });
  return ok({ id, status: 'pending' });
};
