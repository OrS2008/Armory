import { ErrorCodes } from '../../../../shared/errors';
import { Permissions } from '../../../../shared/rbac';
import { personnelSchema } from '../../../../shared/schemas';
import { AuditActions, writeAudit } from '../../../_lib/audit';
import { requireScope, requireUser } from '../../../_lib/auth';
import { loadPersonnel } from '../../../_lib/data';
import { checkOrigin, fail, now, ok, readBody, type Env } from '../../../_lib/http';

export const onRequestGet: PagesFunction<Env> = async ({ request, env, params }) => {
  const user = await requireUser(request, env, Permissions.personnelRead);
  if (user instanceof Response) return user;
  const id = String(params.id);
  const person = (await loadPersonnel(env, { includeInactive: true })).find(
    (candidate) => candidate.id === id,
  );
  if (!person) return fail(404, ErrorCodes.NOT_FOUND);
  const outOfScope = await requireScope(env, user, person.unitId);
  if (outOfScope) return outOfScope;
  return ok({ person });
};

export const onRequestPatch: PagesFunction<Env> = async ({ request, env, params }) => {
  const origin = checkOrigin(request);
  if (origin) return origin;
  const user = await requireUser(request, env, Permissions.personnelWrite);
  if (user instanceof Response) return user;
  const id = String(params.id);
  const input = await readBody(request, personnelSchema.partial());
  if (input instanceof Response) return input;

  const existing = await env.DB.prepare('SELECT id, unit_id, status FROM personnel WHERE id = ?')
    .bind(id)
    .first<{ id: string; unit_id: string | null; status: string }>();
  if (!existing) return fail(404, ErrorCodes.NOT_FOUND);
  const outOfScope = await requireScope(env, user, existing.unit_id);
  if (outOfScope) return outOfScope;
  if (input.unitId !== undefined) {
    const targetOutOfScope = await requireScope(env, user, input.unitId ?? null);
    if (targetOutOfScope) return targetOutOfScope;
  }

  const timestamp = now();
  const statements = [
    env.DB.prepare(
      `UPDATE personnel
          SET unit_id = ?, external_id = COALESCE(?, external_id),
              display_name = COALESCE(?, display_name), role_title = COALESCE(?, role_title),
              phone = COALESCE(?, phone), status = COALESCE(?, status),
              notes = COALESCE(?, notes), updated_at = ?
        WHERE id = ?`,
    ).bind(
      input.unitId === undefined ? existing.unit_id : input.unitId,
      input.externalId ?? null,
      input.displayName ?? null,
      input.roleTitle ?? null,
      input.phone ?? null,
      input.status ?? null,
      input.notes ?? null,
      timestamp,
      id,
    ),
  ];

  if (input.qualificationIds) {
    statements.push(
      env.DB.prepare('DELETE FROM personnel_qualifications WHERE personnel_id = ?').bind(id),
      ...input.qualificationIds.map((qualificationId) =>
        env.DB.prepare(
          `INSERT OR IGNORE INTO personnel_qualifications (personnel_id, qualification_id, granted_at)
           VALUES (?, ?, ?)`,
        ).bind(id, qualificationId, timestamp),
      ),
    );
  }

  await env.DB.batch(statements);
  await writeAudit(env, user, AuditActions.PERSONNEL_UPDATED, 'personnel', id, {
    fields: Object.keys(input),
  });
  return ok({ id });
};

/** Archiving keeps history intact; personnel rows are never hard-deleted. */
export const onRequestDelete: PagesFunction<Env> = async ({ request, env, params }) => {
  const origin = checkOrigin(request);
  if (origin) return origin;
  const user = await requireUser(request, env, Permissions.personnelWrite);
  if (user instanceof Response) return user;
  const id = String(params.id);
  const existing = await env.DB.prepare('SELECT unit_id FROM personnel WHERE id = ?')
    .bind(id)
    .first<{ unit_id: string | null }>();
  if (!existing) return fail(404, ErrorCodes.NOT_FOUND);
  const outOfScope = await requireScope(env, user, existing.unit_id);
  if (outOfScope) return outOfScope;

  await env.DB.prepare("UPDATE personnel SET status = 'archived', updated_at = ? WHERE id = ?")
    .bind(now(), id)
    .run();
  await writeAudit(env, user, AuditActions.PERSONNEL_ARCHIVED, 'personnel', id);
  return ok({ id, status: 'archived' });
};
