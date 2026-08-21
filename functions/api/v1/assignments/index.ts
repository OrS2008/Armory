import { blockingConflicts } from '../../../../shared/conflicts';
import { ErrorCodes } from '../../../../shared/errors';
import { Permissions, expandScope } from '../../../../shared/rbac';
import { expandRecurrence } from '../../../../shared/recurrence';
import { assignmentSchema } from '../../../../shared/schemas';
import { AuditActions, writeAudit } from '../../../_lib/audit';
import { requireScope, requireUser, unitParents } from '../../../_lib/auth';
import { DEFAULT_ORG_ID, evaluateWindow, orgTimezone } from '../../../_lib/data';
import {
  checkOrigin,
  fail,
  intParam,
  newId,
  now,
  ok,
  readBody,
  searchParams,
  type Env,
} from '../../../_lib/http';
import { DAY } from '../../../../shared/time';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const user = await requireUser(request, env, Permissions.assignmentsRead);
  if (user instanceof Response) return user;
  const params = searchParams(request);
  const from = intParam(params, 'from', Date.now() - DAY);
  const to = intParam(params, 'to', Date.now() + 7 * DAY);
  const scoped = expandScope(user.unitScope, await unitParents(env));

  const evaluation = await evaluateWindow(env, {
    from,
    to,
    unitIds: scoped,
    scheduleId: params.get('scheduleId'),
  });

  const unitFilter = params.get('unitId');
  const assignments = unitFilter
    ? evaluation.assignments.filter((assignment) => assignment.unitId === unitFilter)
    : evaluation.assignments;

  return ok({
    assignments,
    conflicts: evaluation.conflicts,
    timezone: evaluation.timezone,
    window: { from, to },
  });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const origin = checkOrigin(request);
  if (origin) return origin;
  const user = await requireUser(request, env, Permissions.assignmentsWrite);
  if (user instanceof Response) return user;
  const input = await readBody(request, assignmentSchema);
  if (input instanceof Response) return input;

  const outOfScope = await requireScope(env, user, input.unitId ?? null);
  if (outOfScope) return outOfScope;

  const type = await env.DB.prepare(
    'SELECT id, name FROM assignment_types WHERE id = ? AND org_id = ? AND active = 1',
  )
    .bind(input.assignmentTypeId, DEFAULT_ORG_ID)
    .first<{ id: string; name: string }>();
  if (!type)
    return fail(422, ErrorCodes.VALIDATION_FAILED, {
      fields: { assignmentTypeId: 'סוג משימה אינו קיים' },
    });

  const timezone = await orgTimezone(env);
  const occurrences = expandRecurrence(
    input.startAt,
    input.endAt,
    input.recurrence
      ? {
          frequency: input.recurrence.frequency,
          weekdays: input.recurrence.weekdays,
          untilDate: input.recurrence.untilDate,
          shiftHours: input.recurrence.shiftHours,
        }
      : undefined,
    timezone,
  );

  const timestamp = now();
  const ids: string[] = [];
  const statements = [];
  for (const occurrence of occurrences) {
    const id = newId('asg');
    ids.push(id);
    statements.push(
      env.DB.prepare(
        `INSERT INTO assignment_instances (id, org_id, schedule_id, assignment_type_id, unit_id,
                                           title, start_at, end_at, required_headcount, status,
                                           publication_state, notes, created_by, updated_by,
                                           created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'planned', 'draft', ?, ?, ?, ?, ?)`,
      ).bind(
        id,
        DEFAULT_ORG_ID,
        input.scheduleId ?? null,
        input.assignmentTypeId,
        input.unitId ?? null,
        input.title ?? null,
        occurrence.startAt,
        occurrence.endAt,
        input.requiredHeadcount,
        input.notes ?? null,
        user.id,
        user.id,
        timestamp,
        timestamp,
      ),
    );
    for (const personnelId of input.personnelIds ?? []) {
      statements.push(
        env.DB.prepare(
          `INSERT OR IGNORE INTO assignment_personnel (id, assignment_id, personnel_id, assigned_by, assigned_at)
           VALUES (?, ?, ?, ?, ?)`,
        ).bind(newId('apr'), id, personnelId, user.id, timestamp),
      );
    }
  }

  await env.DB.batch(statements);
  await writeAudit(env, user, AuditActions.ASSIGNMENT_CREATED, 'assignment', ids[0] ?? 'batch', {
    count: ids.length,
    assignmentTypeId: input.assignmentTypeId,
    recurring: occurrences.length > 1,
    shiftHours: input.recurrence?.shiftHours ?? null,
  });

  // Report — but do not silently undo — any conflict the new assignments create.
  const evaluation = await evaluateWindow(env, {
    from: Math.min(...occurrences.map((occurrence) => occurrence.startAt)) - DAY,
    to: Math.max(...occurrences.map((occurrence) => occurrence.endAt)) + DAY,
  });
  const related = evaluation.conflicts.filter(
    (conflict) => conflict.assignmentId && ids.includes(conflict.assignmentId),
  );

  return ok({
    ids,
    count: ids.length,
    conflicts: related,
    blocking: blockingConflicts(related).length,
  });
};
