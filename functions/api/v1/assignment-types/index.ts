import { Permissions } from '../../../../shared/rbac';
import { assignmentTypeSchema } from '../../../../shared/schemas';
import { AuditActions, writeAudit } from '../../../_lib/audit';
import { requireUser } from '../../../_lib/auth';
import { DEFAULT_ORG_ID, boolToInt, loadAssignmentTypes } from '../../../_lib/data';
import { checkOrigin, newId, now, ok, readBody, type Env } from '../../../_lib/http';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const user = await requireUser(request, env, Permissions.assignmentTypesRead);
  if (user instanceof Response) return user;
  return ok({ assignmentTypes: await loadAssignmentTypes(env) });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const origin = checkOrigin(request);
  if (origin) return origin;
  const user = await requireUser(request, env, Permissions.assignmentTypesWrite);
  if (user instanceof Response) return user;
  const input = await readBody(request, assignmentTypeSchema);
  if (input instanceof Response) return input;

  const id = newId('atp');
  const timestamp = now();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO assignment_types (id, org_id, name, category, default_duration_minutes,
                                     required_headcount, priority, color, instructions,
                                     briefing_minutes_before, section, sheet_label,
                                     crew_role_suffix, sheet_column, active, standing, shift_hours,
                                     shift_start_hour, shift_start_minute, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      id,
      DEFAULT_ORG_ID,
      input.name,
      input.category ?? null,
      input.defaultDurationMinutes,
      input.requiredHeadcount,
      input.priority ?? 2,
      input.color ?? 'slate',
      input.instructions ?? null,
      input.briefingMinutesBefore ?? null,
      input.section ?? null,
      input.sheetLabel ?? null,
      input.crewRoleSuffix ?? null,
      input.sheetColumn ?? null,
      boolToInt(input.active, 1),
      boolToInt(input.standing, 0),
      input.shiftHours ?? 8,
      input.shiftStartHour ?? 0,
      input.shiftStartMinute ?? 0,
      timestamp,
      timestamp,
    ),
    ...(input.requiredQualifications ?? []).map((requirement) =>
      env.DB.prepare(
        `INSERT OR REPLACE INTO assignment_type_qualifications
           (assignment_type_id, qualification_id, min_count)
         VALUES (?, ?, ?)`,
      ).bind(id, requirement.qualificationId, requirement.minCount),
    ),
    ...(input.excludedQualificationIds ?? []).map((qualificationId) =>
      env.DB.prepare(
        `INSERT OR IGNORE INTO assignment_type_exclusions (assignment_type_id, qualification_id)
         VALUES (?, ?)`,
      ).bind(id, qualificationId),
    ),
  ]);
  await writeAudit(env, user, AuditActions.ASSIGNMENT_TYPE_CREATED, 'assignment_type', id);
  return ok({ id });
};
