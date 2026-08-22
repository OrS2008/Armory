import { ErrorCodes } from '../../../../../shared/errors';
import { permissionsForRole } from '../../../../../shared/rbac';
import { mfaVerifySchema } from '../../../../../shared/schemas';
import { verifyTotp } from '../../../../../shared/totp';
import type { Role } from '../../../../../shared/types';
import { AuditActions, writeAudit } from '../../../../_lib/audit';
import {
  createSession,
  loginThrottled,
  recordLoginAttempt,
  sessionCookie,
  sessionTtlMs,
} from '../../../../_lib/auth';
import { consumeChallenge, readChallenge, useRecoveryCode } from '../../../../_lib/mfa';
import { checkOrigin, fail, now, ok, readBody, type Env } from '../../../../_lib/http';

interface Row {
  id: string;
  email: string;
  display_name: string;
  role: Role;
  personnel_id: string | null;
  mfa_secret: string | null;
}

/** The second half of a login: the password was accepted, this is the code. */
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const origin = checkOrigin(request);
  if (origin) return origin;
  const input = await readBody(request, mfaVerifySchema);
  if (input instanceof Response) return input;

  const challenge = await readChallenge(env, input.challenge);
  if (!challenge) return fail(400, ErrorCodes.MFA_INVALID);

  const row = await env.DB.prepare(
    `SELECT id, email, display_name, role, personnel_id, mfa_secret
       FROM users WHERE id = ? AND active = 1`,
  )
    .bind(challenge.userId)
    .first<Row>();
  if (!row) return fail(400, ErrorCodes.MFA_INVALID);

  // The same throttle the password has: without it a five-minute challenge is
  // long enough to walk through a six-digit space.
  if (await loginThrottled(env, row.email)) return fail(429, ErrorCodes.RATE_LIMITED);

  const isTotp = /^\d{6}$/.test(input.code);
  const accepted = isTotp
    ? row.mfa_secret !== null && (await verifyTotp(row.mfa_secret, input.code))
    : await useRecoveryCode(env, row.id, input.code);

  if (!accepted) {
    await recordLoginAttempt(env, row.email, false);
    await writeAudit(env, null, AuditActions.LOGIN_FAILED, 'user', row.id, { reason: 'mfa' });
    return fail(400, ErrorCodes.MFA_INVALID);
  }

  await consumeChallenge(env, challenge.id);
  const scopes = await env.DB.prepare('SELECT unit_id FROM user_scopes WHERE user_id = ?')
    .bind(row.id)
    .all<{ unit_id: string }>();
  const session = await createSession(
    env,
    row.id,
    request.headers.get('User-Agent')?.slice(0, 80) ?? null,
  );
  await env.DB.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').bind(now(), row.id).run();
  await recordLoginAttempt(env, row.email, true);
  await writeAudit(
    env,
    { id: row.id, displayName: row.display_name },
    AuditActions.LOGIN,
    'user',
    row.id,
    { mfa: isTotp ? 'totp' : 'recovery' },
  );

  return ok(
    {
      user: {
        id: row.id,
        email: row.email,
        displayName: row.display_name,
        role: row.role,
        personnelId: row.personnel_id,
        unitScope: (scopes.results ?? []).map((scope) => scope.unit_id),
        permissions: permissionsForRole(row.role),
        mfaEnabled: true,
      },
      expiresAt: session.expiresAt,
    },
    { 'Set-Cookie': sessionCookie(session.raw, Math.floor(sessionTtlMs(env) / 1000)) },
  );
};
