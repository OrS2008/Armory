import { ErrorCodes } from '../../../../shared/errors';
import { Permissions } from '../../../../shared/rbac';
import { userPatchSchema } from '../../../../shared/schemas';
import type { Role } from '../../../../shared/types';
import { AuditActions, writeAudit } from '../../../_lib/audit';
import { hashPassword, newSalt, passwordIterations, requireUser } from '../../../_lib/auth';
import { otherActiveAdmins } from '../../../_lib/data';
import { checkOrigin, fail, now, ok, readBody, type Env } from '../../../_lib/http';

interface Row {
  id: string;
  role: Role;
  active: number;
  display_name: string;
}

export const onRequestPatch: PagesFunction<Env> = async ({ request, env, params }) => {
  const origin = checkOrigin(request);
  if (origin) return origin;
  const actor = await requireUser(request, env, Permissions.usersManage);
  if (actor instanceof Response) return actor;
  const id = String(params.id);
  const input = await readBody(request, userPatchSchema);
  if (input instanceof Response) return input;

  const existing = await env.DB.prepare(
    'SELECT id, role, active, display_name FROM users WHERE id = ?',
  )
    .bind(id)
    .first<Row>();
  if (!existing) return fail(404, ErrorCodes.NOT_FOUND);

  const losesRole = input.role !== undefined && input.role !== existing.role;
  const losesAccess = input.active === false && existing.active === 1;

  // Changing your own role or switching yourself off is how an administrator
  // locks themselves out. Someone else with the permission can still do it.
  if (id === actor.id && (losesRole || losesAccess)) {
    return fail(409, ErrorCodes.SELF_LOCKOUT);
  }

  // And the unit as a whole has to keep one working administrator.
  if (existing.role === 'system_admin' && existing.active === 1 && (losesRole || losesAccess)) {
    if ((await otherActiveAdmins(env, id)) === 0) return fail(409, ErrorCodes.LAST_ADMIN);
  }

  const sets: string[] = [];
  const values: unknown[] = [];
  const changed: string[] = [];

  if (input.displayName !== undefined) {
    sets.push('display_name = ?');
    values.push(input.displayName);
    changed.push('displayName');
  }
  if (input.role !== undefined) {
    sets.push('role = ?');
    values.push(input.role);
    changed.push('role');
  }
  if (input.personnelId !== undefined) {
    sets.push('personnel_id = ?');
    values.push(input.personnelId);
    changed.push('personnelId');
  }
  if (input.active !== undefined) {
    sets.push('active = ?');
    values.push(input.active ? 1 : 0);
    changed.push('active');
  }
  if (input.password !== undefined) {
    const salt = newSalt();
    const iterations = passwordIterations(env);
    sets.push('password_hash = ?', 'password_salt = ?', 'password_iterations = ?');
    values.push(await hashPassword(input.password, salt, iterations), salt, iterations);
    changed.push('password');
  }

  const statements = [];
  if (sets.length > 0) {
    sets.push('updated_at = ?');
    values.push(now(), id);
    statements.push(
      env.DB.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).bind(...values),
    );
  }
  if (input.unitScope !== undefined) {
    changed.push('unitScope');
    statements.push(env.DB.prepare('DELETE FROM user_scopes WHERE user_id = ?').bind(id));
    for (const unitId of input.unitScope) {
      statements.push(
        env.DB.prepare('INSERT INTO user_scopes (user_id, unit_id) VALUES (?, ?)').bind(id, unitId),
      );
    }
  }

  // A reset password, a new role or a switched-off account must not leave the
  // old session usable; the next request from it fails the active check.
  if (input.password !== undefined || losesRole || losesAccess) {
    statements.push(
      env.DB.prepare(
        'UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL',
      ).bind(now(), id),
    );
  }

  if (statements.length === 0) return ok({ id });
  await env.DB.batch(statements);
  await writeAudit(env, actor, AuditActions.USER_UPDATED, 'user', id, { changed });
  return ok({ id });
};
