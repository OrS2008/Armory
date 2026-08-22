import { ErrorCodes } from '../../../../shared/errors';
import { permissionsForRole } from '../../../../shared/rbac';
import { loginSchema } from '../../../../shared/schemas';
import type { Role } from '../../../../shared/types';
import { AuditActions, writeAudit } from '../../../_lib/audit';
import {
  createSession,
  hashPassword,
  loginThrottled,
  newSalt,
  passwordIterations,
  recordLoginAttempt,
  sessionCookie,
  sessionTtlMs,
  verifyPassword,
} from '../../../_lib/auth';
import { schemaReady } from '../../../_lib/data';
import { checkOrigin, fail, newId, now, ok, readBody, type Env } from '../../../_lib/http';

interface Row {
  id: string;
  email: string;
  display_name: string;
  password_hash: string;
  password_salt: string;
  password_iterations: number;
  role: Role;
  personnel_id: string | null;
  mfa_enabled: number;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const origin = checkOrigin(request);
  if (origin) return origin;

  const input = await readBody(request, loginSchema);
  if (input instanceof Response) return input;
  const email = input.email.toLowerCase();

  // Every query below assumes the tables exist. Without this, an un-migrated
  // database surfaces as an unexplained 500 on the login screen.
  if (!(await schemaReady(env))) return fail(503, ErrorCodes.SCHEMA_NOT_READY);

  if (await loginThrottled(env, email)) {
    return fail(429, ErrorCodes.RATE_LIMITED);
  }

  let row = await env.DB.prepare(
    `SELECT id, email, display_name, password_hash, password_salt, password_iterations, role,
            personnel_id, mfa_enabled
       FROM users WHERE email = ? AND active = 1`,
  )
    .bind(email)
    .first<Row>();

  // First-run bootstrap: the very first administrator is created from the
  // deployment secrets, and only while the user table is still empty.
  let bootstrapped = false;
  if (!row) {
    const created = await bootstrapAdmin(env, email, input.password);
    if (created === 'not_configured') return fail(503, ErrorCodes.NOT_CONFIGURED);
    row = created;
    bootstrapped = created !== null;
  }

  if (!row) {
    await recordLoginAttempt(env, email, false);
    await writeAudit(env, null, AuditActions.LOGIN_FAILED, 'user', email, { reason: 'unknown' });
    return fail(401, ErrorCodes.INVALID_CREDENTIALS);
  }

  // The bootstrap path compared the supplied password against the deployment
  // secret before inserting the row, so deriving the hash a second time here
  // would only double the cost of the one request that can least afford it.
  const valid =
    bootstrapped ||
    (await verifyPassword(
      input.password,
      row.password_salt,
      row.password_iterations,
      row.password_hash,
    ));
  if (!valid) {
    await recordLoginAttempt(env, email, false);
    await writeAudit(env, null, AuditActions.LOGIN_FAILED, 'user', row.id, {
      reason: 'password',
    });
    return fail(401, ErrorCodes.INVALID_CREDENTIALS);
  }

  // The scope belongs to the account, not to the session; leaving it empty
  // here made a scoped user look unrestricted until the first /auth/me.
  const scopes = await env.DB.prepare('SELECT unit_id FROM user_scopes WHERE user_id = ?')
    .bind(row.id)
    .all<{ unit_id: string }>();

  const session = await createSession(
    env,
    row.id,
    request.headers.get('User-Agent')?.slice(0, 80) ?? null,
  );
  await env.DB.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').bind(now(), row.id).run();
  await recordLoginAttempt(env, email, true);
  await writeAudit(
    env,
    { id: row.id, displayName: row.display_name },
    AuditActions.LOGIN,
    'user',
    row.id,
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
        mfaEnabled: row.mfa_enabled === 1,
      },
      expiresAt: session.expiresAt,
    },
    { 'Set-Cookie': sessionCookie(session.raw, Math.floor(sessionTtlMs(env) / 1000)) },
  );
};

async function bootstrapAdmin(
  env: Env,
  email: string,
  password: string,
): Promise<Row | null | 'not_configured'> {
  const bootstrapEmail = env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  const bootstrapPassword = env.BOOTSTRAP_ADMIN_PASSWORD;
  const existing = await env.DB.prepare('SELECT COUNT(*) AS count FROM users').first<{
    count: number;
  }>();
  if ((existing?.count ?? 0) > 0) return null;
  if (!bootstrapEmail || !bootstrapPassword) return 'not_configured';
  if (email !== bootstrapEmail || password !== bootstrapPassword) return null;

  const salt = newSalt();
  const iterations = passwordIterations(env);
  const hash = await hashPassword(password, salt, iterations);
  const id = newId('usr');
  const timestamp = now();
  await env.DB.prepare(
    `INSERT INTO users (id, email, display_name, password_hash, password_salt, password_iterations,
                        role, personnel_id, mfa_enabled, active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'system_admin', NULL, 0, 1, ?, ?)`,
  )
    .bind(id, bootstrapEmail, 'מנהל מערכת', hash, salt, iterations, timestamp, timestamp)
    .run();
  await writeAudit(env, null, AuditActions.USER_CREATED, 'user', id, { reason: 'bootstrap' });

  return {
    id,
    email: bootstrapEmail,
    display_name: 'מנהל מערכת',
    password_hash: hash,
    password_salt: salt,
    password_iterations: iterations,
    role: 'system_admin',
    personnel_id: null,
    mfa_enabled: 0,
  };
}
