import { AuditActions, writeAudit } from '../../../_lib/audit';
import {
  clearedSessionCookie,
  loadSessionUser,
  readCookie,
  revokeSession,
} from '../../../_lib/auth';
import { checkOrigin, ok, type Env } from '../../../_lib/http';

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const origin = checkOrigin(request);
  if (origin) return origin;
  const user = await loadSessionUser(request, env);
  const raw = readCookie(request);
  if (raw) await revokeSession(env, raw);
  if (user) await writeAudit(env, user, AuditActions.LOGOUT, 'user', user.id);
  return ok({ loggedOut: true }, { 'Set-Cookie': clearedSessionCookie() });
};
