import { ErrorCodes } from '../../../../shared/errors';
import { Permissions } from '../../../../shared/rbac';
import { standingRosterSchema } from '../../../../shared/schemas';
import { planStandingShifts, shiftKey } from '../../../../shared/standing';
import { AuditActions, writeAudit } from '../../../_lib/audit';
import { requireUser } from '../../../_lib/auth';
import { DEFAULT_ORG_ID, loadAssignmentTypes, orgTimezone } from '../../../_lib/data';
import { checkOrigin, fail, newId, now, ok, readBody, type Env } from '../../../_lib/http';

/** D1 rejects an unbounded batch; the roster for a long period is written in runs. */
const BATCH_SIZE = 100;

/**
 * Lay out the fixed roster for a period.
 *
 * The four standing posts run continuously, so their shifts are a fact about
 * the period rather than a decision taken each morning. This writes every shift
 * the period needs and skips the ones already there — including cancelled ones,
 * so re-running never resurrects a shift somebody deliberately called off.
 */
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const origin = checkOrigin(request);
  if (origin) return origin;
  const user = await requireUser(request, env, Permissions.assignmentsWrite);
  if (user instanceof Response) return user;
  const input = await readBody(request, standingRosterSchema);
  if (input instanceof Response) return input;

  const [types, timezone] = await Promise.all([loadAssignmentTypes(env), orgTimezone(env)]);
  const posts = types
    .filter((type) => type.active && type.standing)
    .filter((type) => !input.assignmentTypeIds || input.assignmentTypeIds.includes(type.id))
    .map((type) => ({
      assignmentTypeId: type.id,
      name: type.name,
      requiredHeadcount: type.requiredHeadcount,
      shiftHours: type.shiftHours,
      shiftStartHour: type.shiftStartHour,
      shiftStartMinute: type.shiftStartMinute,
      briefingMinutesBefore: type.briefingMinutesBefore,
    }));

  if (posts.length === 0) {
    return fail(422, ErrorCodes.VALIDATION_FAILED, {
      fields: {
        assignmentTypeIds: 'לא הוגדרו משימות קבועות. סמנו משימה כקבועה במסך סוגי המשימות.',
      },
    });
  }

  const planned = planStandingShifts(posts, input.fromDate, input.toDate, timezone);
  if (planned.length === 0) return ok({ created: 0, skipped: 0, posts: posts.length });

  const from = Math.min(...planned.map((shift) => shift.startAt));
  const to = Math.max(...planned.map((shift) => shift.startAt));
  const existingRows = await env.DB.prepare(
    `SELECT assignment_type_id, start_at FROM assignment_instances
      WHERE org_id = ? AND start_at >= ? AND start_at <= ?`,
  )
    .bind(DEFAULT_ORG_ID, from, to)
    .all<{ assignment_type_id: string; start_at: number }>();
  const existing = new Set(
    (existingRows.results ?? []).map((row) =>
      shiftKey({ assignmentTypeId: row.assignment_type_id, startAt: row.start_at }),
    ),
  );

  const missing = planned.filter((shift) => !existing.has(shiftKey(shift)));
  const timestamp = now();
  const ids: string[] = [];
  const statements = missing.map((shift) => {
    const id = newId('asg');
    ids.push(id);
    return env.DB.prepare(
      `INSERT INTO assignment_instances (id, org_id, schedule_id, assignment_type_id, unit_id,
                                         title, start_at, end_at, required_headcount, status,
                                         publication_state, notes, created_by, updated_by,
                                         created_at, updated_at)
       VALUES (?, ?, NULL, ?, NULL, NULL, ?, ?, ?, 'planned', 'draft', ?, ?, ?, ?, ?)`,
    ).bind(
      id,
      DEFAULT_ORG_ID,
      shift.assignmentTypeId,
      shift.startAt,
      shift.endAt,
      shift.requiredHeadcount,
      shift.notes,
      user.id,
      user.id,
      timestamp,
      timestamp,
    );
  });

  for (let index = 0; index < statements.length; index += BATCH_SIZE) {
    await env.DB.batch(statements.slice(index, index + BATCH_SIZE));
  }

  if (ids.length > 0) {
    await writeAudit(env, user, AuditActions.ASSIGNMENT_CREATED, 'assignment', ids[0]!, {
      count: ids.length,
      standing: true,
      fromDate: input.fromDate,
      toDate: input.toDate,
      posts: posts.length,
    });
  }

  return ok({
    created: ids.length,
    skipped: planned.length - missing.length,
    posts: posts.length,
    fromDate: input.fromDate,
    toDate: input.toDate,
  });
};
