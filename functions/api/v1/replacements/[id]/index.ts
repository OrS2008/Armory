import { ErrorCodes } from '../../../../../shared/errors';
import { Permissions, can } from '../../../../../shared/rbac';
import { replacementDecisionSchema } from '../../../../../shared/schemas';
import { DAY } from '../../../../../shared/time';
import {
  AuditActions,
  auditStatement,
  notificationStatement,
  usersForPersonnel,
} from '../../../../_lib/audit';
import { requireUser } from '../../../../_lib/auth';
import { engineQualifications, evaluateWindow } from '../../../../_lib/data';
import { verifySeat } from '../../../../_lib/seat';
import { checkOrigin, fail, newId, now, ok, readBody, type Env } from '../../../../_lib/http';

/**
 * Approving a replacement swaps the two people on the assignment in a single
 * batch, so the schedule never shows both or neither.
 *
 * It is a scheduling decision like any other, and so it goes through the same
 * gate. Before this, it did not: the swap was written unchecked, which let an
 * approval do what the board would have refused — double-book the incoming
 * person, spend their rest, or drop them into a מפקד seat they do not hold. The
 * seat's mark travels with the seat, so a driver is replaced by a driver.
 */
export const onRequestPatch: PagesFunction<Env> = async ({ request, env, params }) => {
  const origin = checkOrigin(request);
  if (origin) return origin;
  const user = await requireUser(request, env);
  if (user instanceof Response) return user;
  const id = String(params.id);
  const input = await readBody(request, replacementDecisionSchema);
  if (input instanceof Response) return input;

  const existing = await env.DB.prepare(
    `SELECT r.id, r.assignment_id, r.personnel_id, r.replacement_personnel_id, r.status,
            a.publication_state, a.start_at, a.end_at
       FROM replacement_requests r
       JOIN assignment_instances a ON a.id = r.assignment_id
      WHERE r.id = ?`,
  )
    .bind(id)
    .first<{
      id: string;
      assignment_id: string;
      personnel_id: string;
      replacement_personnel_id: string | null;
      status: string;
      publication_state: string;
      start_at: number;
      end_at: number;
    }>();
  if (!existing) return fail(404, ErrorCodes.NOT_FOUND);

  /*
   * Withdrawing a request you made yourself is not a decision, so it does not
   * need the permission to decide. Without this a soldier whose plans changed
   * could only leave the request standing and hope somebody noticed — and the
   * commander's screen filled with cover nobody needed any more.
   */
  const own = Boolean(user.personnelId) && user.personnelId === existing.personnel_id;
  const withdrawing =
    input.status === 'cancelled' && own && ['pending', 'proposed'].includes(existing.status);
  if (!withdrawing && !can(user, Permissions.replacementsDecide)) {
    return fail(403, ErrorCodes.FORBIDDEN);
  }

  const replacementId = input.replacementPersonnelId ?? existing.replacement_personnel_id;
  if (input.status === 'approved' && !replacementId) {
    return fail(422, ErrorCodes.VALIDATION_FAILED, {
      fields: { replacementPersonnelId: 'יש לבחור מחליף לפני האישור' },
    });
  }

  const timestamp = now();
  const statements = [
    env.DB.prepare(
      `UPDATE replacement_requests
          SET status = ?, replacement_personnel_id = ?, decided_by = ?, decided_at = ?, updated_at = ?
        WHERE id = ?`,
    ).bind(input.status, replacementId ?? null, user.id, timestamp, timestamp, id),
  ];

  if (input.status === 'approved' && replacementId) {
    if (replacementId === existing.personnel_id) {
      return fail(422, ErrorCodes.VALIDATION_FAILED, {
        fields: { replacementPersonnelId: 'המחליף והמוחלף הם אותו אדם' },
      });
    }

    // The seat the outgoing person stands in. It is the seat the incoming
    // person inherits, mark and all.
    const seat = await env.DB.prepare(
      `SELECT personnel_id, role_qualification_id
         FROM assignment_personnel WHERE assignment_id = ? AND personnel_id IN (?, ?)`,
    )
      .bind(existing.assignment_id, existing.personnel_id, replacementId)
      .all<{ personnel_id: string; role_qualification_id: string | null }>();
    const rows = seat.results ?? [];
    if (rows.some((seatRow) => seatRow.personnel_id === replacementId)) {
      return fail(409, ErrorCodes.ALREADY_ASSIGNED);
    }
    const role =
      rows.find((seatRow) => seatRow.personnel_id === existing.personnel_id)
        ?.role_qualification_id ?? null;

    const evaluation = await evaluateWindow(env, {
      from: existing.start_at - 8 * DAY,
      to: existing.end_at + 8 * DAY,
    });
    const person = evaluation.personnel.find((candidate) => candidate.id === replacementId);
    if (!person) return fail(404, ErrorCodes.NOT_FOUND);
    if (person.status !== 'active') {
      return fail(422, ErrorCodes.VALIDATION_FAILED, {
        fields: { replacementPersonnelId: 'ניתן לשבץ רק אנשים פעילים' },
      });
    }

    const qualifications = await engineQualifications(env);
    const verdict = verifySeat(evaluation, qualifications, person, {
      assignmentId: existing.assignment_id,
      role,
      vacating: existing.personnel_id,
    });
    if (verdict.refusal) {
      return fail(422, ErrorCodes.VALIDATION_FAILED, {
        fields: { replacementPersonnelId: verdict.refusal },
      });
    }
    const { blocking } = verdict;
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

    statements.push(
      env.DB.prepare(
        'DELETE FROM assignment_personnel WHERE assignment_id = ? AND personnel_id = ?',
      ).bind(existing.assignment_id, existing.personnel_id),
      env.DB.prepare(
        `INSERT OR IGNORE INTO assignment_personnel
           (id, assignment_id, personnel_id, assigned_by, assigned_at, override_reason, role_qualification_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        newId('apr'),
        existing.assignment_id,
        replacementId,
        user.id,
        timestamp,
        blocking.length > 0 ? (input.overrideReason ?? null) : null,
        role,
      ),
      env.DB.prepare(
        `UPDATE assignment_instances
            SET publication_state = CASE WHEN publication_state = 'published' THEN 'modified' ELSE publication_state END,
                updated_by = ?, updated_at = ?
          WHERE id = ?`,
      ).bind(user.id, timestamp, existing.assignment_id),
    );

    const recipients = await usersForPersonnel(
      env,
      [existing.personnel_id, replacementId].filter(Boolean),
    );
    for (const [personnelId, userId] of recipients) {
      statements.push(
        notificationStatement(
          env,
          userId,
          'REPLACEMENT_APPROVED',
          personnelId === replacementId ? 'שובצת כמחליף' : 'בקשת ההחלפה אושרה',
          null,
          'assignment',
          existing.assignment_id,
        ),
      );
    }

    if (blocking.length > 0) {
      statements.push(
        auditStatement(
          env,
          user,
          AuditActions.ASSIGNMENT_OVERRIDE,
          'assignment',
          existing.assignment_id,
          { personnelId: replacementId, codes: blocking.map((conflict) => conflict.code) },
        ),
      );
    }
  }

  statements.push(
    auditStatement(env, user, AuditActions.REPLACEMENT_DECIDED, 'replacement', id, {
      status: input.status,
      assignmentId: existing.assignment_id,
    }),
  );

  await env.DB.batch(statements);
  return ok({ id, status: input.status, replacementPersonnelId: replacementId ?? null });
};
