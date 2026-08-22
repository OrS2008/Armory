import { ErrorCodes } from '../../../../../shared/errors';
import { mfaEnableSchema } from '../../../../../shared/schemas';
import { verifyTotp } from '../../../../../shared/totp';
import { AuditActions, writeAudit } from '../../../../_lib/audit';
import { requireUser } from '../../../../_lib/auth';
import { generateRecoveryCodes, replaceRecoveryCodes } from '../../../../_lib/mfa';
import { checkOrigin, fail, now, ok, readBody, type Env } from '../../../../_lib/http';

/** Confirms enrolment and hands over the recovery codes, once. */
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const origin = checkOrigin(request);
  if (origin) return origin;
  const user = await requireUser(request, env);
  if (user instanceof Response) return user;
  const input = await readBody(request, mfaEnableSchema);
  if (input instanceof Response) return input;

  const row = await env.DB.prepare('SELECT mfa_secret FROM users WHERE id = ?')
    .bind(user.id)
    .first<{ mfa_secret: string | null }>();
  if (!row?.mfa_secret) return fail(400, ErrorCodes.MFA_NOT_SET_UP);
  if (!(await verifyTotp(row.mfa_secret, input.code))) return fail(400, ErrorCodes.MFA_INVALID);

  const codes = generateRecoveryCodes();
  await env.DB.prepare('UPDATE users SET mfa_enabled = 1, updated_at = ? WHERE id = ?')
    .bind(now(), user.id)
    .run();
  await replaceRecoveryCodes(env, user.id, codes);
  await writeAudit(env, user, AuditActions.USER_UPDATED, 'user', user.id, {
    changed: ['mfaEnabled'],
    self: true,
  });

  // The only time these are readable. Hashes are what the database keeps.
  return ok({ recoveryCodes: codes });
};
