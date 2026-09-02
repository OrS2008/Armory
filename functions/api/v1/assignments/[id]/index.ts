import { ErrorCodes } from '../../../../../shared/errors';
import { Permissions } from '../../../../../shared/rbac';
import { assignmentPatchSchema } from '../../../../../shared/schemas';
import { DAY } from '../../../../../shared/time';
import { AuditActions, diff, writeAudit } from '../../../../_lib/audit';
import { requireScope, requireUser } from '../../../../_lib/auth';
import { evaluateWindow, loadAssignments } from '../../../../_lib/data';
import { checkOrigin, fail, now, ok, readBody, type Env } from '../../../../_lib/http';

async function findAssignment(env: Env, id: string) {
  return env.DB.prepare(
    `SELECT id, unit_id, start_at, end_at, required_headcount, title, notes, status,
            publication_state, schedule_id
       FROM assignment_instances WHERE id = ?`,
  )
    .bind(id)
    .first<{
      id: string;
      unit_id: string | null;
      start_at: number;
      end_at: number;
      required_headcount: number;
      title: string | null;
      notes: string | null;
      status: string;
      publication_state: string;
      schedule_id: string | null;
    }>();
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env, params }) => {
  const user = await requireUser(request, env, Permissions.assignmentsRead);
  if (user instanceof Response) return user;
  const id = String(params.id);
  const existing = await findAssignment(env, id);
  if (!existing) return fail(404, ErrorCodes.NOT_FOUND);

  const [assignment] = await loadAssignments(env, {
    from: existing.start_at,
    to: existing.end_at,
    includeCancelled: true,
  }).then((list) => list.filter((item) => item.id === id));
  if (!assignment) return fail(404, ErrorCodes.NOT_FOUND);

  const evaluation = await evaluateWindow(env, {
    from: existing.start_at - DAY,
    to: existing.end_at + DAY,
  });
  return ok({
    assignment,
    conflicts: evaluation.conflicts.filter((conflict) => conflict.assignmentId === id),
  });
};

export const onRequestPatch: PagesFunction<Env> = async ({ request, env, params }) => {
  const origin = checkOrigin(request);
  if (origin) return origin;
  const user = await requireUser(request, env, Permissions.assignmentsWrite);
  if (user instanceof Response) return user;
  const id = String(params.id);
  const input = await readBody(request, assignmentPatchSchema);
  if (input instanceof Response) return input;

  const existing = await findAssignment(env, id);
  if (!existing) return fail(404, ErrorCodes.NOT_FOUND);
  const outOfScope = await requireScope(env, user, existing.unit_id);
  if (outOfScope) return outOfScope;

  const startAt = input.startAt ?? existing.start_at;
  const endAt = input.endAt ?? existing.end_at;
  if (endAt <= startAt) {
    return fail(422, ErrorCodes.VALIDATION_FAILED, {
      fields: { endAt: 'שעת הסיום חייבת להיות אחרי שעת ההתחלה' },
    });
  }

  // Editing a published assignment marks it as changed until the schedule is
  // published again, so the board can flag it (plan section 8).
  const publicationState =
    existing.publication_state === 'published' ? 'modified' : existing.publication_state;

  await env.DB.prepare(
    `UPDATE assignment_instances
        SET title = COALESCE(?, title), start_at = ?, end_at = ?,
            required_headcount = COALESCE(?, required_headcount),
            unit_id = ?, notes = COALESCE(?, notes), status = COALESCE(?, status),
            schedule_id = ?, publication_state = ?, updated_by = ?, updated_at = ?
      WHERE id = ?`,
  )
    .bind(
      input.title ?? null,
      startAt,
      endAt,
      input.requiredHeadcount ?? null,
      input.unitId === undefined ? existing.unit_id : input.unitId,
      input.notes ?? null,
      input.status ?? null,
      input.scheduleId === undefined ? existing.schedule_id : input.scheduleId,
      publicationState,
      user.id,
      now(),
      id,
    )
    .run();

  await writeAudit(env, user, AuditActions.ASSIGNMENT_UPDATED, 'assignment', id, {
    changed: diff(
      {
        startAt: existing.start_at,
        endAt: existing.end_at,
        requiredHeadcount: existing.required_headcount,
      },
      { startAt, endAt, requiredHeadcount: input.requiredHeadcount ?? existing.required_headcount },
      ['startAt', 'endAt', 'requiredHeadcount'],
    ),
  });

  const evaluation = await evaluateWindow(env, { from: startAt - DAY, to: endAt + DAY });
  return ok({
    id,
    publicationState,
    conflicts: evaluation.conflicts.filter((conflict) => conflict.assignmentId === id),
  });
};

/** Cancels the assignment; the row and its history are kept. */
export const onRequestDelete: PagesFunction<Env> = async ({ request, env, params }) => {
  const origin = checkOrigin(request);
  if (origin) return origin;
  const user = await requireUser(request, env, Permissions.assignmentsWrite);
  if (user instanceof Response) return user;
  const id = String(params.id);
  const existing = await findAssignment(env, id);
  if (!existing) return fail(404, ErrorCodes.NOT_FOUND);
  const outOfScope = await requireScope(env, user, existing.unit_id);
  if (outOfScope) return outOfScope;

  /*
   * Removing a shift is two different acts wearing one name.
   *
   * A shift somebody stood, or is standing, is a record: who was at the gate on
   * Tuesday is a question the sheet has to keep answering, so it is cancelled —
   * struck off the board, kept in the database, and counted as existing so that
   * laying the period out again never resurrects it.
   *
   * A shift still ahead of us that nobody is on records nothing. Cancelling it
   * leaves a tombstone that also blocks the post from ever being laid out over
   * that slot again, which is not what "we do not need this one" means. That
   * one is deleted.
   */
  const staffed = await env.DB.prepare(
    'SELECT COUNT(*) AS count FROM assignment_personnel WHERE assignment_id = ?',
  )
    .bind(id)
    .first<{ count: number }>();
  const emptyAndAhead = (staffed?.count ?? 0) === 0 && existing.start_at > now();

  if (emptyAndAhead) {
    await env.DB.prepare('DELETE FROM assignment_instances WHERE id = ?').bind(id).run();
    await writeAudit(env, user, AuditActions.ASSIGNMENT_DELETED, 'assignment', id);
    return ok({ id, status: 'deleted' });
  }

  await env.DB.prepare(
    "UPDATE assignment_instances SET status = 'cancelled', updated_by = ?, updated_at = ? WHERE id = ?",
  )
    .bind(user.id, now(), id)
    .run();
  await writeAudit(env, user, AuditActions.ASSIGNMENT_CANCELLED, 'assignment', id);
  return ok({ id, status: 'cancelled' });
};
