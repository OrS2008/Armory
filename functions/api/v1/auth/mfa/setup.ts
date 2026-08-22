import { otpauthUri, randomBase32Secret } from '../../../../../shared/totp';
import { requireUser } from '../../../../_lib/auth';
import { checkOrigin, now, ok, type Env } from '../../../../_lib/http';

/**
 * Starts enrolment. The secret is stored but `mfa_enabled` stays 0 until a
 * code proves the authenticator actually has it — otherwise a mistyped setup
 * locks the account out of its own login.
 */
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const origin = checkOrigin(request);
  if (origin) return origin;
  const user = await requireUser(request, env);
  if (user instanceof Response) return user;

  const secret = randomBase32Secret();
  await env.DB.prepare('UPDATE users SET mfa_secret = ?, updated_at = ? WHERE id = ?')
    .bind(secret, now(), user.id)
    .run();

  return ok({ secret, uri: otpauthUri(secret, user.email) });
};
