import { ErrorCodes } from '../../../../../shared/errors';
import { mfaDisableSchema } from '../../../../../shared/schemas';
import { AuditActions, writeAudit } from '../../../../_lib/audit';
import { requireUser, verifyPassword } from '../../../../_lib/auth';
import { clearMfa } from '../../../../_lib/mfa';
import { checkOrigin, fail, ok, readBody, type Env } from '../../../../_lib/http';

/** Turning the second factor off is a password-protected act, like changing it. */
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const origin = checkOrigin(request);
  if (origin) return origin;
  const user = await requireUser(request, env);
  if (user instanceof Response) return user;
  const input = await readBody(request, mfaDisableSchema);
  if (input instanceof Response) return input;

  const row = await env.DB.prepare(
    'SELECT password_hash, password_salt, password_iterations FROM users WHERE id = ?',
  )
    .bind(user.id)
    .first<{ password_hash: string; password_salt: string; password_iterations: number }>();
  if (!row) return fail(404, ErrorCodes.NOT_FOUND);

  const valid = await verifyPassword(
    input.password,
    row.password_salt,
    row.password_iterations,
    row.password_hash,
  );
  if (!valid) return fail(403, ErrorCodes.WRONG_PASSWORD);

  await clearMfa(env, user.id);
  await writeAudit(env, user, AuditActions.USER_UPDATED, 'user', user.id, {
    changed: ['mfaEnabled'],
    self: true,
  });
  return ok({ ok: true });
};
