import { requireUser } from '../../../_lib/auth';
import { checkOrigin, now, ok, type Env } from '../../../_lib/http';

/** Marks one notification read, or all of them when no id is supplied. */
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const origin = checkOrigin(request);
  if (origin) return origin;
  const user = await requireUser(request, env);
  if (user instanceof Response) return user;

  const id = new URL(request.url).searchParams.get('id');
  const statement = id
    ? env.DB.prepare(
        'UPDATE notifications SET read_at = ? WHERE user_id = ? AND id = ? AND read_at IS NULL',
      ).bind(now(), user.id, id)
    : env.DB.prepare(
        'UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL',
      ).bind(now(), user.id);

  const result = await statement.run();
  return ok({ updated: result.meta.changes ?? 0 });
};
