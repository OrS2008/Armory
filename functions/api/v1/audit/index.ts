import { Permissions } from '../../../../shared/rbac';
import { requireUser } from '../../../_lib/auth';
import { safeJson } from '../../../_lib/data';
import { clampLimit, intParam, ok, searchParams, type Env } from '../../../_lib/http';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const user = await requireUser(request, env, Permissions.auditRead);
  if (user instanceof Response) return user;
  const params = searchParams(request);
  const limit = clampLimit(intParam(params, 'limit', 100), 500);

  const filters: string[] = [];
  const bindings: unknown[] = [];
  if (params.has('entityType')) {
    filters.push('entity_type = ?');
    bindings.push(params.get('entityType'));
  }
  if (params.has('entityId')) {
    filters.push('entity_id = ?');
    bindings.push(params.get('entityId'));
  }
  if (params.has('action')) {
    filters.push('action = ?');
    bindings.push(params.get('action'));
  }
  if (params.has('from')) {
    filters.push('created_at >= ?');
    bindings.push(intParam(params, 'from', 0));
  }
  if (params.has('to')) {
    filters.push('created_at <= ?');
    bindings.push(intParam(params, 'to', Date.now()));
  }
  const where = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';

  const rows = await env.DB.prepare(
    `SELECT id, actor_name, action, entity_type, entity_id, metadata, created_at
       FROM audit_events ${where} ORDER BY created_at DESC LIMIT ?`,
  )
    .bind(...bindings, limit)
    .all<{
      id: string;
      actor_name: string;
      action: string;
      entity_type: string;
      entity_id: string;
      metadata: string;
      created_at: number;
    }>();

  return ok({
    events: (rows.results ?? []).map((row) => ({
      id: row.id,
      actorName: row.actor_name,
      action: row.action,
      entityType: row.entity_type,
      entityId: row.entity_id,
      metadata: safeJson<Record<string, unknown>>(row.metadata, {}),
      createdAt: row.created_at,
    })),
  });
};
