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

  const existing = await env.DB.prepare(
    'SELECT active, standing FROM assignment_types WHERE id = ?',
  )
    .bind(id)
    .first<{ active: number; standing: number }>();
  if (!existing) return fail(404, ErrorCodes.NOT_FOUND);

  const statements = [
    env.DB.prepare(
      `UPDATE assignment_types
          SET name = COALESCE(?, name), category = COALESCE(?, category),
              default_duration_minutes = COALESCE(?, default_duration_minutes),
              required_headcount = COALESCE(?, required_headcount),
              priority = COALESCE(?, priority), color = COALESCE(?, color),
              instructions = COALESCE(?, instructions),
              briefing_minutes_before = COALESCE(?, briefing_minutes_before),
              section = COALESCE(?, section), sheet_label = COALESCE(?, sheet_label),
              crew_role_suffix = COALESCE(?, crew_role_suffix),
              sheet_column = COALESCE(?, sheet_column), active = ?,
              standing = ?, shift_hours = COALESCE(?, shift_hours),
              shift_start_hour = COALESCE(?, shift_start_hour),
              shift_start_minute = COALESCE(?, shift_start_minute), updated_at = ?
        WHERE id = ?`,
    ).bind(
      input.name ?? null,
      input.category ?? null,
      input.defaultDurationMinutes ?? null,
      input.requiredHeadcount ?? null,
      input.priority ?? null,
      input.color ?? null,
      input.instructions ?? null,
      input.briefingMinutesBefore ?? null,
      input.section ?? null,
      input.sheetLabel ?? null,
      input.crewRoleSuffix ?? null,
      input.sheetColumn ?? null,
      boolToInt(input.active, existing.active),
      boolToInt(input.standing, existing.standing),
      input.shiftHours ?? null,
      input.shiftStartHour ?? null,
      input.shiftStartMinute ?? null,
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

  if (input.excludedQualificationIds) {
    statements.push(
      env.DB.prepare('DELETE FROM assignment_type_exclusions WHERE assignment_type_id = ?').bind(
        id,
      ),
      ...input.excludedQualificationIds.map((qualificationId) =>
        env.DB.prepare(
          `INSERT OR IGNORE INTO assignment_type_exclusions (assignment_type_id, qualification_id)
           VALUES (?, ?)`,
        ).bind(id, qualificationId),
      ),
    );
  }

  await env.DB.batch(statements);
  await writeAudit(env, user, AuditActions.ASSIGNMENT_TYPE_UPDATED, 'assignment_type', id, {
    fields: Object.keys(input),
  });
  return ok({ id });
};

/**
 * Removes a post that was never used.
 *
 * A post that *has* been used cannot be deleted: assignment_instances points at
 * it without a cascade, so the database would refuse — and it is right to. Every
 * shift ever stood at that post names it, and deleting it would either take
 * those shifts with it or leave the sheet unable to say what anybody was doing.
 * The answer for a post the unit has finished with is to retire it (active = 0),
 * which stops it being offered while yesterday still reads correctly.
 */
export const onRequestDelete: PagesFunction<Env> = async ({ request, env, params }) => {
  const origin = checkOrigin(request);
  if (origin) return origin;
  const user = await requireUser(request, env, Permissions.assignmentTypesWrite);
  if (user instanceof Response) return user;
  const id = String(params.id);

  const existing = await env.DB.prepare('SELECT name FROM assignment_types WHERE id = ?')
    .bind(id)
    .first<{ name: string }>();
  if (!existing) return fail(404, ErrorCodes.NOT_FOUND);

  const used = await env.DB.prepare(
    'SELECT COUNT(*) AS count FROM assignment_instances WHERE assignment_type_id = ?',
  )
    .bind(id)
    .first<{ count: number }>();
  const shifts = used?.count ?? 0;

  /*
   * A post that has been stood takes its shifts with it, and everyone who was
   * ever on them. That is a large enough thing to do that it is refused unless
   * it was asked for in those words — `?shifts=delete` — rather than being the
   * quiet consequence of pressing delete on a screen. Without it the caller is
   * told how many stand in the way, so the choice is made knowing the size of
   * it; retiring the post instead leaves every one of them readable.
   */
  const cascade = new URL(request.url).searchParams.get('shifts') === 'delete';
  if (shifts > 0 && !cascade) return fail(409, ErrorCodes.IN_USE, { assignments: shifts });

  // assignment_instances carries no cascade from its type, so the shifts go
  // first and everything hanging off a shift follows them. The audit trail does
  // not: it holds no foreign key precisely so that it outlives what it
  // describes, and this removal is itself recorded there.
  if (shifts > 0) {
    await env.DB.prepare('DELETE FROM assignment_instances WHERE assignment_type_id = ?')
      .bind(id)
      .run();
  }
  // The requirement and exclusion rows cascade; nothing else refers to a type.
  await env.DB.prepare('DELETE FROM assignment_types WHERE id = ?').bind(id).run();
  await writeAudit(env, user, AuditActions.ASSIGNMENT_TYPE_DELETED, 'assignment_type', id, {
    name: existing.name,
    shifts,
  });
  return ok({ id, deleted: true, shifts });
};
