import { requireUser } from '../../../_lib/auth';
import { clampLimit, intParam, ok, searchParams, type Env } from '../../../_lib/http';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const user = await requireUser(request, env);
  if (user instanceof Response) return user;
  const params = searchParams(request);
  const limit = clampLimit(intParam(params, 'limit', 50), 200);

  const rows = await env.DB.prepare(
    `SELECT id, type, title, body, entity_type, entity_id, read_at, created_at
       FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`,
  )
    .bind(user.id, limit)
    .all<{
      id: string;
      type: string;
      title: string;
      body: string | null;
      entity_type: string | null;
      entity_id: string | null;
      read_at: number | null;
      created_at: number;
    }>();

  const notifications = (rows.results ?? []).map((row) => ({
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    entityType: row.entity_type,
    entityId: row.entity_id,
    readAt: row.read_at,
    createdAt: row.created_at,
  }));

  return ok({
    notifications,
    unreadCount: notifications.filter((notification) => notification.readAt === null).length,
  });
};
