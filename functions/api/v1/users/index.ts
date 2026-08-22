import { ErrorCodes } from '../../../../shared/errors';
import { Permissions } from '../../../../shared/rbac';
import { userSchema } from '../../../../shared/schemas';
import { AuditActions, writeAudit } from '../../../_lib/audit';
import { hashPassword, newSalt, passwordIterations, requireUser } from '../../../_lib/auth';
import { boolToInt, loadUsers } from '../../../_lib/data';
import { checkOrigin, fail, newId, now, ok, readBody, type Env } from '../../../_lib/http';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const user = await requireUser(request, env, Permissions.usersManage);
  if (user instanceof Response) return user;
  return ok({ users: await loadUsers(env) });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const origin = checkOrigin(request);
  if (origin) return origin;
  const user = await requireUser(request, env, Permissions.usersManage);
  if (user instanceof Response) return user;
  const input = await readBody(request, userSchema);
  if (input instanceof Response) return input;

  const email = input.email.toLowerCase();
  const taken = await env.DB.prepare('SELECT id FROM users WHERE email = ?')
    .bind(email)
    .first<{ id: string }>();
  if (taken) return fail(409, ErrorCodes.EMAIL_TAKEN);

  const salt = newSalt();
  const iterations = passwordIterations(env);
  const hash = await hashPassword(input.password, salt, iterations);
  const id = newId('usr');
  const timestamp = now();

  const statements = [
    env.DB.prepare(
      `INSERT INTO users (id, email, display_name, password_hash, password_salt, password_iterations,
                          role, personnel_id, mfa_enabled, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
    ).bind(
      id,
      email,
      input.displayName,
      hash,
      salt,
      iterations,
      input.role,
      input.personnelId ?? null,
      boolToInt(input.active, 1),
      timestamp,
      timestamp,
    ),
    ...(input.unitScope ?? []).map((unitId) =>
      env.DB.prepare('INSERT INTO user_scopes (user_id, unit_id) VALUES (?, ?)').bind(id, unitId),
    ),
  ];
  await env.DB.batch(statements);

  // The role and the scope are the interesting part of the record; the
  // password never appears in the trail, not even as a length.
  await writeAudit(env, user, AuditActions.USER_CREATED, 'user', id, {
    role: input.role,
    scopes: (input.unitScope ?? []).length,
  });
  return ok({ id });
};
