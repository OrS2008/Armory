import { ErrorCodes } from '../../../../shared/errors';
import { AuditActions, writeAudit } from '../../../_lib/audit';
import { requireUser } from '../../../_lib/auth';
import { checkOrigin, fail, now, ok, randomHex, sha256, type Env } from '../../../_lib/http';

/**
 * The subscription link for the signed-in person's own calendar.
 *
 * Only the hash of the token is stored, so this can say *whether* a link
 * exists and when it was issued, and can hand back a link only at the moment
 * it issues one. Losing it is answered by issuing another, which retires the
 * old — which is also the answer to sharing it by mistake.
 */
const feedUrl = (request: Request, token: string) =>
  new URL(`/api/v1/calendar/${token}.ics`, request.url).toString();

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const user = await requireUser(request, env);
  if (user instanceof Response) return user;
  const row = await env.DB.prepare(
    'SELECT calendar_token_hash, calendar_issued_at FROM users WHERE id = ?',
  )
    .bind(user.id)
    .first<{ calendar_token_hash: string | null; calendar_issued_at: number | null }>();
  return ok({
    subscribed: Boolean(row?.calendar_token_hash),
    issuedAt: row?.calendar_issued_at ?? null,
  });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const origin = checkOrigin(request);
  if (origin) return origin;
  const user = await requireUser(request, env);
  if (user instanceof Response) return user;
  // The feed is one person's duty times, so an account not standing for anyone
  // has nothing to publish.
  if (!user.personnelId) return fail(404, ErrorCodes.NOT_FOUND);

  const token = randomHex(24);
  const timestamp = now();
  await env.DB.prepare(
    'UPDATE users SET calendar_token_hash = ?, calendar_issued_at = ?, updated_at = ? WHERE id = ?',
  )
    .bind(await sha256(token), timestamp, timestamp, user.id)
    .run();
  await writeAudit(env, user, AuditActions.CALENDAR_ISSUED, 'user', user.id, {});
  return ok({ url: feedUrl(request, token), issuedAt: timestamp });
};

export const onRequestDelete: PagesFunction<Env> = async ({ request, env }) => {
  const origin = checkOrigin(request);
  if (origin) return origin;
  const user = await requireUser(request, env);
  if (user instanceof Response) return user;
  await env.DB.prepare(
    'UPDATE users SET calendar_token_hash = NULL, calendar_issued_at = NULL, updated_at = ? WHERE id = ?',
  )
    .bind(now(), user.id)
    .run();
  await writeAudit(env, user, AuditActions.CALENDAR_REVOKED, 'user', user.id, {});
  return ok({ subscribed: false });
};
