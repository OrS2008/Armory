import { ErrorCodes } from '../../../../shared/errors';
import { passwordChangeSchema } from '../../../../shared/schemas';
import { AuditActions, writeAudit } from '../../../_lib/audit';
import {
  hashPassword,
  newSalt,
  passwordIterations,
  readCookie,
  requireUser,
  verifyPassword,
} from '../../../_lib/auth';
import { checkOrigin, fail, now, ok, readBody, sha256, type Env } from '../../../_lib/http';

interface Row {
  password_hash: string;
  password_salt: string;
  password_iterations: number;
}

/** A person changing their own password. An administrator resetting someone
 *  else's goes through PATCH /users/:id, which is a different act. */
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const origin = checkOrigin(request);
  if (origin) return origin;
  const user = await requireUser(request, env);
  if (user instanceof Response) return user;
  const input = await readBody(request, passwordChangeSchema);
  if (input instanceof Response) return input;

  const row = await env.DB.prepare(
    'SELECT password_hash, password_salt, password_iterations FROM users WHERE id = ?',
  )
    .bind(user.id)
    .first<Row>();
  if (!row) return fail(404, ErrorCodes.NOT_FOUND);

  const valid = await verifyPassword(
    input.currentPassword,
    row.password_salt,
    row.password_iterations,
    row.password_hash,
  );
  if (!valid) {
    await writeAudit(env, user, AuditActions.LOGIN_FAILED, 'user', user.id, {
      reason: 'password_change',
    });
    return fail(403, ErrorCodes.WRONG_PASSWORD);
  }

  const salt = newSalt();
  const iterations = passwordIterations(env);
  const hash = await hashPassword(input.newPassword, salt, iterations);
  const raw = readCookie(request);
  const currentTokenHash = raw ? await sha256(raw) : '';

  await env.DB.batch([
    env.DB.prepare(
      `UPDATE users SET password_hash = ?, password_salt = ?, password_iterations = ?, updated_at = ?
        WHERE id = ?`,
    ).bind(hash, salt, iterations, now(), user.id),
    // Every other device is signed out: a password is changed because the old
    // one is no longer trusted. This browser keeps its session.
    env.DB.prepare(
      `UPDATE sessions SET revoked_at = ?
        WHERE user_id = ? AND revoked_at IS NULL AND token_hash != ?`,
    ).bind(now(), user.id, currentTokenHash),
  ]);

  await writeAudit(env, user, AuditActions.USER_UPDATED, 'user', user.id, {
    changed: ['password'],
    self: true,
  });
  return ok({ ok: true });
};
