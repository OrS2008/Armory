import { ErrorCodes } from '../../../../shared/errors';
import { Permissions } from '../../../../shared/rbac';
import { assignmentTypeSchema } from '../../../../shared/schemas';
import { AuditActions, writeAudit } from '../../../_lib/audit';
import { requireUser } from '../../../_lib/auth';
import { boolToInt } from '../../../_lib/data';
import { checkOrigin, fail, now, ok, readBody, type Env } from '../../../_lib/http';

export const onRequestPatch: PagesFunction<Env> = async ({ request, env, params }) => {
  const origin = checkOrigin(request);
  if (origin) return origin;
  const user = await requireUser(request, env, Permissions.assignmentTypesWrite);
  if (user instanceof Response) return user;
  const id = String(params.id);
  const input = await readBody(request, assignmentTypeSchema.partial());
  if (input instanceof Response) return input;

  const existing = await env.DB.prepare('SELECT active FROM assignment_types WHERE id = ?')
    .bind(id)
    .first<{ active: number }>();
  if (!existing) return fail(404, ErrorCodes.NOT_FOUND);

  const statements = [
    env.DB.prepare(
      `UPDATE assignment_types
          SET name = COALESCE(?, name), category = COALESCE(?, category),
              default_duration_minutes = COALESCE(?, default_duration_minutes),
              required_headcount = COALESCE(?, required_headcount),
              priority = COALESCE(?, priority), color = COALESCE(?, color),
              instructions = COALESCE(?, instructions), active = ?, updated_at = ?
        WHERE id = ?`,
    ).bind(
      input.name ?? null,
      input.category ?? null,
      input.defaultDurationMinutes ?? null,
      input.requiredHeadcount ?? null,
      input.priority ?? null,
      input.color ?? null,
      input.instructions ?? null,
      boolToInt(input.active, existing.active),
      now(),
      id,
    ),
  ];

  if (input.requiredQualifications) {
    statements.push(
      env.DB.prepare(
        'DELETE FROM assignment_type_qualifications WHERE assignment_type_id = ?',
      ).bind(id),
      ...input.requiredQualifications.map((requirement) =>
        env.DB.prepare(
          `INSERT OR REPLACE INTO assignment_type_qualifications
             (assignment_type_id, qualification_id, min_count)
           VALUES (?, ?, ?)`,
        ).bind(id, requirement.qualificationId, requirement.minCount),
      ),
    );
  }

  await env.DB.batch(statements);
  await writeAudit(env, user, AuditActions.ASSIGNMENT_TYPE_UPDATED, 'assignment_type', id, {
    fields: Object.keys(input),
  });
  return ok({ id });
};
