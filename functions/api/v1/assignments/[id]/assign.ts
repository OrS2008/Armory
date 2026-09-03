import { ErrorCodes } from '../../../../../shared/errors';
import { formatRange } from '../../../../../shared/format';
import { Permissions, can } from '../../../../../shared/rbac';
import { assignPersonnelSchema } from '../../../../../shared/schemas';
import { DAY } from '../../../../../shared/time';
import {
  AuditActions,
  notificationStatement,
  usersForPersonnel,
  writeAudit,
} from '../../../../_lib/audit';
import { requireScope, requireUser } from '../../../../_lib/auth';
import { evaluateWindow, engineQualifications } from '../../../../_lib/data';
import { verifySeat } from '../../../../_lib/seat';
import { checkOrigin, fail, newId, now, ok, readBody, type Env } from '../../../../_lib/http';

export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) => {
  const origin = checkOrigin(request);
  if (origin) return origin;
  const user = await requireUser(request, env, Permissions.assignmentsAssign);
  if (user instanceof Response) return user;
  const assignmentId = String(params.id);
  const input = await readBody(request, assignPersonnelSchema);
  if (input instanceof Response) return input;

  const row = await env.DB.prepare(
    'SELECT id, unit_id, start_at, end_at, publication_state FROM assignment_instances WHERE id = ? AND status = ?',
  )
    .bind(assignmentId, 'planned')
    .first<{
      id: string;
      unit_id: string | null;
      start_at: number;
      end_at: number;
      publication_state: string;
    }>();
  if (!row) return fail(404, ErrorCodes.NOT_FOUND);
  const outOfScope = await requireScope(env, user, row.unit_id);
  if (outOfScope) return outOfScope;

  const already = await env.DB.prepare(
    'SELECT id FROM assignment_personnel WHERE assignment_id = ? AND personnel_id = ?',
  )
    .bind(assignmentId, input.personnelId)
    .first<{ id: string }>();
  if (already) return fail(409, ErrorCodes.ALREADY_ASSIGNED);

  // A named seat is taken once. The partial unique index guarantees it, but a
  // constraint violation surfaces as a 500; checking first turns the same fact
  // into an answer the board can show.
  if (input.role) {
    const seatTaken = await env.DB.prepare(
      'SELECT id FROM assignment_personnel WHERE assignment_id = ? AND role_qualification_id = ?',
    )
      .bind(assignmentId, input.role)
      .first<{ id: string }>();
    if (seatTaken) return fail(409, ErrorCodes.ROLE_TAKEN);
  }

  const evaluation = await evaluateWindow(env, {
    from: row.start_at - 8 * DAY,
    to: row.end_at + 8 * DAY,
  });
  const person = evaluation.personnel.find((candidate) => candidate.id === input.personnelId);
  if (!person) return fail(404, ErrorCodes.NOT_FOUND);
  if (person.status !== 'active') {
    return fail(422, ErrorCodes.VALIDATION_FAILED, {
      fields: { personnelId: 'ניתן לשבץ רק אנשים פעילים' },
    });
  }

  /*
   * A named seat belongs to its qualification, and that is not negotiable.
   *
   * The conflict engine says the same thing, but it says it as a rule: a rule
   * can be switched off in settings, and a blocking one can be overridden with
   * a reason by anybody allowed to override. Neither is what "only a driver
   * drives" means. `verifySeat` answers it outside the engine, before anything
   * is written, and there is no way past it.
   */
  const qualifications = await engineQualifications(env);
  const verdict = verifySeat(evaluation, qualifications, person, {
    assignmentId,
    role: input.role ?? null,
  });
  if (verdict.refusal) {
    return fail(422, ErrorCodes.VALIDATION_FAILED, { fields: { role: verdict.refusal } });
  }
  const { conflicts, blocking } = verdict;
  if (blocking.length > 0) {
    if (!input.overrideReason) {
      return fail(409, ErrorCodes.SCHEDULING_CONFLICT, { conflicts: blocking });
    }
    if (!can(user, Permissions.assignmentsOverride)) {
      return fail(403, ErrorCodes.FORBIDDEN, { conflicts: blocking });
    }
    if (blocking.some((conflict) => !conflict.overridable)) {
      return fail(403, ErrorCodes.OVERRIDE_NOT_ALLOWED, { conflicts: blocking });
    }
  }

  const timestamp = now();
  const publicationState =
    row.publication_state === 'published' ? 'modified' : row.publication_state;
  const statements = [
    env.DB.prepare(
      `INSERT INTO assignment_personnel
         (id, assignment_id, personnel_id, assigned_by, assigned_at, override_reason, role_qualification_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      newId('apr'),
      assignmentId,
      input.personnelId,
      user.id,
      timestamp,
      blocking.length > 0 ? (input.overrideReason ?? null) : null,
      input.role ?? null,
    ),
    env.DB.prepare(
      'UPDATE assignment_instances SET publication_state = ?, updated_by = ?, updated_at = ? WHERE id = ?',
    ).bind(publicationState, user.id, timestamp, assignmentId),
  ];

  const recipients = await usersForPersonnel(env, [input.personnelId]);
  const recipient = recipients.get(input.personnelId);
  // Being put on a shift is news the moment it happens: there is no
  // publication step left to wait for.
  if (recipient) {
    statements.push(
      notificationStatement(
        env,
        recipient,
        'ASSIGNMENT_ADDED',
        'שובצת למשימה חדשה',
        formatRange(row.start_at, row.end_at, evaluation.timezone),
        'assignment',
        assignmentId,
      ),
    );
  }

  await env.DB.batch(statements);
  await writeAudit(env, user, AuditActions.PERSONNEL_ASSIGNED, 'assignment', assignmentId, {
    personnelId: input.personnelId,
    overridden: blocking.length > 0,
  });
  if (blocking.length > 0) {
    await writeAudit(env, user, AuditActions.ASSIGNMENT_OVERRIDE, 'assignment', assignmentId, {
      personnelId: input.personnelId,
      codes: blocking.map((conflict) => conflict.code),
    });
  }

  return ok({
    assignmentId,
    personnelId: input.personnelId,
    conflicts,
    overridden: blocking.length > 0,
  });
};
