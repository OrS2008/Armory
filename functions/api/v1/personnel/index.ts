import { ErrorCodes } from '../../../../shared/errors';
import { Permissions, expandScope } from '../../../../shared/rbac';
import { personnelSchema } from '../../../../shared/schemas';
import { AuditActions, writeAudit } from '../../../_lib/audit';
import { requireScope, requireUser, unitParents } from '../../../_lib/auth';
import { DEFAULT_ORG_ID, loadPersonnel } from '../../../_lib/data';
import {
  checkOrigin,
  fail,
  newId,
  now,
  ok,
  readBody,
  searchParams,
  type Env,
} from '../../../_lib/http';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const user = await requireUser(request, env, Permissions.personnelRead);
  if (user instanceof Response) return user;

  const params = searchParams(request);
  const scoped = expandScope(user.unitScope, await unitParents(env));
  let personnel = await loadPersonnel(env, {
    unitIds: scoped,
    includeInactive: params.get('includeInactive') === 'true',
  });

  const unitId = params.get('unitId');
  const status = params.get('status');
  const qualificationId = params.get('qualificationId');
  const query = params.get('q')?.trim().toLowerCase();

  if (unitId) personnel = personnel.filter((person) => person.unitId === unitId);
  if (status) personnel = personnel.filter((person) => person.status === status);
  if (qualificationId) {
    personnel = personnel.filter((person) => person.qualificationIds.includes(qualificationId));
  }
  if (query) {
    personnel = personnel.filter(
      (person) =>
        person.displayName.toLowerCase().includes(query) ||
        (person.externalId ?? '').toLowerCase().includes(query) ||
        (person.roleTitle ?? '').toLowerCase().includes(query),
    );
  }

  return ok({ personnel });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const origin = checkOrigin(request);
  if (origin) return origin;
  const user = await requireUser(request, env, Permissions.personnelWrite);
  if (user instanceof Response) return user;
  const input = await readBody(request, personnelSchema);
  if (input instanceof Response) return input;

  const outOfScope = await requireScope(env, user, input.unitId ?? null);
  if (outOfScope) return outOfScope;

  if (input.externalId) {
    const duplicate = await env.DB.prepare(
      'SELECT id FROM personnel WHERE org_id = ? AND external_id = ?',
    )
      .bind(DEFAULT_ORG_ID, input.externalId)
      .first<{ id: string }>();
    if (duplicate) return fail(409, ErrorCodes.CONFLICT);
  }

  const id = newId('per');
  const timestamp = now();
  const statements = [
    env.DB.prepare(
      `INSERT INTO personnel (id, org_id, unit_id, external_id, display_name, role_title, phone,
                              status, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      id,
      DEFAULT_ORG_ID,
      input.unitId ?? null,
      input.externalId ?? null,
      input.displayName,
      input.roleTitle ?? null,
      input.phone ?? null,
      input.status ?? 'active',
      input.notes ?? null,
      timestamp,
      timestamp,
    ),
    ...(input.qualificationIds ?? []).map((qualificationId) =>
      env.DB.prepare(
        `INSERT OR IGNORE INTO personnel_qualifications (personnel_id, qualification_id, granted_at)
         VALUES (?, ?, ?)`,
      ).bind(id, qualificationId, timestamp),
    ),
  ];
  await env.DB.batch(statements);
  await writeAudit(env, user, AuditActions.PERSONNEL_CREATED, 'personnel', id, {
    unitId: input.unitId ?? null,
  });
  return ok({ id });
};
