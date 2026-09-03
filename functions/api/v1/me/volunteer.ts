import { ErrorCodes } from '../../../../shared/errors';
import { formatRange } from '../../../../shared/format';
import { volunteerSchema } from '../../../../shared/schemas';
import { DAY } from '../../../../shared/time';
import {
  AuditActions,
  auditStatement,
  notificationStatement,
  usersWhoDecide,
  writeAudit,
} from '../../../_lib/audit';
import { requireUser } from '../../../_lib/auth';
import { engineQualifications, evaluateWindow, orgTimezone } from '../../../_lib/data';
import { verifySeat } from '../../../_lib/seat';
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

/**
 * Putting your name down for a seat nobody is standing.
 *
 * An offer, not an assignment: the commander still decides who stands where.
 * It is checked against the engine before it is filed all the same, because an
 * offer the roster would refuse wastes the time of both people.
 */
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const origin = checkOrigin(request);
  if (origin) return origin;
  const user = await requireUser(request, env);
  if (user instanceof Response) return user;
  const me = user.personnelId;
  if (!me) return fail(404, ErrorCodes.NOT_FOUND);
  const input = await readBody(request, volunteerSchema);
  if (input instanceof Response) return input;

  const row = await env.DB.prepare(
    "SELECT id, start_at, end_at FROM assignment_instances WHERE id = ? AND status = 'planned'",
  )
    .bind(input.assignmentId)
    .first<{ id: string; start_at: number; end_at: number }>();
  if (!row) return fail(404, ErrorCodes.NOT_FOUND);

  const evaluation = await evaluateWindow(env, {
    from: row.start_at - 8 * DAY,
    to: row.end_at + 8 * DAY,
  });
  const assignment = evaluation.assignments.find((one) => one.id === input.assignmentId);
  const person = evaluation.personnel.find((candidate) => candidate.id === me);
  if (!assignment || !person) return fail(404, ErrorCodes.NOT_FOUND);
  if (assignment.assignees.some((assignee) => assignee.personnelId === me)) {
    return fail(409, ErrorCodes.ALREADY_ASSIGNED);
  }

  const verdict = verifySeat(evaluation, await engineQualifications(env), person, {
    assignmentId: input.assignmentId,
    role: input.role ?? null,
  });
  if (verdict.refusal) {
    return fail(422, ErrorCodes.VALIDATION_FAILED, { fields: { role: verdict.refusal } });
  }
  if (verdict.blocking.length > 0) {
    return fail(409, ErrorCodes.SCHEDULING_CONFLICT, { conflicts: verdict.blocking });
  }

  const id = newId('vol');
  const timestamp = now();
  const statements = [
    // Offering twice says nothing new, and withdrawing then offering again
    // should reuse the row rather than leave the commander two of them.
    env.DB.prepare(
      `INSERT INTO shift_volunteers
         (id, assignment_id, personnel_id, role_qualification_id, status, note, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'offered', ?, ?, ?)
       ON CONFLICT(assignment_id, personnel_id) DO UPDATE
         SET status = 'offered', role_qualification_id = excluded.role_qualification_id,
             note = excluded.note, updated_at = excluded.updated_at,
             decided_by = NULL, decided_at = NULL`,
    ).bind(
      id,
      input.assignmentId,
      me,
      input.role ?? null,
      input.note ?? null,
      timestamp,
      timestamp,
    ),
    auditStatement(env, user, AuditActions.VOLUNTEER_OFFERED, 'assignment', input.assignmentId, {
      personnelId: me,
    }),
  ];

  const range = formatRange(row.start_at, row.end_at, await orgTimezone(env));
  for (const decider of await usersWhoDecide(env)) {
    statements.push(
      notificationStatement(
        env,
        decider,
        'VOLUNTEER_OFFERED',
        `${person.displayName} מציע לקחת משמרת`,
        range,
        'assignment',
        input.assignmentId,
      ),
    );
  }

  await env.DB.batch(statements);
  return ok({ assignmentId: input.assignmentId, status: 'offered' });
};

/** Withdrawing an offer. Yours only, and only while nobody has acted on it. */
export const onRequestDelete: PagesFunction<Env> = async ({ request, env }) => {
  const origin = checkOrigin(request);
  if (origin) return origin;
  const user = await requireUser(request, env);
  if (user instanceof Response) return user;
  const me = user.personnelId;
  if (!me) return fail(404, ErrorCodes.NOT_FOUND);
  const id = searchParams(request).get('id');
  if (!id) return fail(422, ErrorCodes.VALIDATION_FAILED, { fields: { id: 'חסר מזהה' } });

  const result = await env.DB.prepare(
    "UPDATE shift_volunteers SET status = 'withdrawn', updated_at = ? WHERE id = ? AND personnel_id = ? AND status = 'offered'",
  )
    .bind(now(), id, me)
    .run();
  if (result.meta.changes === 0) return fail(404, ErrorCodes.NOT_FOUND);
  await writeAudit(env, user, AuditActions.VOLUNTEER_WITHDRAWN, 'volunteer', id, {});
  return ok({ id, status: 'withdrawn' });
};
