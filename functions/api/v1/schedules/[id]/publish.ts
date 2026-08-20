import { blockingConflicts, summarizeConflicts } from '../../../../../shared/conflicts';
import { ErrorCodes } from '../../../../../shared/errors';
import { formatDayKey } from '../../../../../shared/format';
import { Permissions } from '../../../../../shared/rbac';
import { publishSchema } from '../../../../../shared/schemas';
import {
  AuditActions,
  auditStatement,
  notificationStatement,
  usersForPersonnel,
} from '../../../../_lib/audit';
import { requireScope, requireUser } from '../../../../_lib/auth';
import { evaluateWindow } from '../../../../_lib/data';
import { checkOrigin, fail, newId, now, ok, readBody, type Env } from '../../../../_lib/http';
import { loadSchedule, scheduleWindow } from '../../../../_lib/schedules';

/**
 * Publication is atomic: assignment states, the schedule row, the immutable
 * version snapshot, the notifications and the audit entry are written in one
 * D1 batch, so a failure leaves the previous published schedule untouched
 * (plan sections 8 and 47).
 */
export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) => {
  const origin = checkOrigin(request);
  if (origin) return origin;
  const user = await requireUser(request, env, Permissions.schedulesPublish);
  if (user instanceof Response) return user;
  const input = await readBody(request, publishSchema);
  if (input instanceof Response) return input;

  const schedule = await loadSchedule(env, String(params.id));
  if (!schedule) return fail(404, ErrorCodes.NOT_FOUND);
  const outOfScope = await requireScope(env, user, schedule.unitId);
  if (outOfScope) return outOfScope;

  const window = await scheduleWindow(env, schedule);
  const evaluation = await evaluateWindow(env, {
    from: window.from,
    to: window.to,
    scheduleId: schedule.id,
  });
  const summary = summarizeConflicts(evaluation.conflicts);
  const blocking = blockingConflicts(evaluation.conflicts);
  if (blocking.length > 0) {
    return fail(409, ErrorCodes.SCHEDULE_NOT_PUBLISHABLE, { summary, conflicts: blocking });
  }

  const timestamp = now();
  const version = schedule.version + 1;
  const changed = evaluation.assignments.filter(
    (assignment) => assignment.publicationState !== 'published',
  );

  const snapshot = {
    version,
    publishedAt: timestamp,
    range: { startDate: schedule.startDate, endDate: schedule.endDate },
    assignments: evaluation.assignments.map((assignment) => ({
      id: assignment.id,
      typeId: assignment.assignmentTypeId,
      startAt: assignment.startAt,
      endAt: assignment.endAt,
      requiredHeadcount: assignment.requiredHeadcount,
      personnelIds: assignment.assignees.map((assignee) => assignee.personnelId),
    })),
  };

  const affectedPersonnel = [
    ...new Set(
      changed.flatMap((assignment) => assignment.assignees.map((assignee) => assignee.personnelId)),
    ),
  ];
  const recipients = await usersForPersonnel(env, affectedPersonnel);

  const statements = [
    env.DB.prepare(
      `UPDATE assignment_instances SET publication_state = 'published', updated_at = ?
        WHERE schedule_id = ? AND status = 'planned'`,
    ).bind(timestamp, schedule.id),
    env.DB.prepare(
      `UPDATE schedules SET status = 'published', version = ?, published_at = ?, published_by = ?,
                            updated_at = ?
        WHERE id = ?`,
    ).bind(version, timestamp, user.id, timestamp, schedule.id),
    env.DB.prepare(
      `INSERT INTO schedule_versions (id, schedule_id, version, snapshot, note, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      newId('scv'),
      schedule.id,
      version,
      JSON.stringify(snapshot),
      input.note ?? null,
      user.id,
      timestamp,
    ),
    auditStatement(env, user, AuditActions.SCHEDULE_PUBLISHED, 'schedule', schedule.id, {
      version,
      assignmentCount: evaluation.assignments.length,
      changedCount: changed.length,
      warnings: summary.warning,
    }),
  ];

  // Notifications carry only what a soldier needs in order to open the app.
  for (const [personnelId, userId] of recipients) {
    const count = changed.filter((assignment) =>
      assignment.assignees.some((assignee) => assignee.personnelId === personnelId),
    ).length;
    statements.push(
      notificationStatement(
        env,
        userId,
        'SCHEDULE_PUBLISHED',
        'פורסם שבצ״ק מעודכן',
        `${formatDayKey(schedule.startDate)}–${formatDayKey(schedule.endDate)} · ${count} שינויים הנוגעים אליך`,
        'schedule',
        schedule.id,
      ),
    );
  }

  await env.DB.batch(statements);

  return ok({
    scheduleId: schedule.id,
    version,
    publishedAt: timestamp,
    notified: recipients.size,
    changedCount: changed.length,
    summary,
  });
};
