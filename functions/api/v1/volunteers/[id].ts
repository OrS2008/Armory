import { ErrorCodes } from '../../../../shared/errors';
import { Permissions } from '../../../../shared/rbac';
import { volunteerDecisionSchema } from '../../../../shared/schemas';
import { DAY } from '../../../../shared/time';
import {
  AuditActions,
  auditStatement,
  notificationStatement,
  usersForPersonnel,
} from '../../../_lib/audit';
import { requireUser } from '../../../_lib/auth';
import { engineQualifications, evaluateWindow } from '../../../_lib/data';
import { verifySeat } from '../../../_lib/seat';
import { checkOrigin, fail, newId, now, ok, readBody, type Env } from '../../../_lib/http';

/**
 * Taking somebody up on an offer, or turning it down.
 *
 * Accepting writes the assignment, so it goes through the same gate as any
 * other — the offer was checked when it was made, but a fortnight can pass
 * between the offer and the answer, and what was true then need not be now.
 */
export const onRequestPatch: PagesFunction<Env> = async ({ request, env, params }) => {
  const origin = checkOrigin(request);
  if (origin) return origin;
  const user = await requireUser(request, env, Permissions.assignmentsAssign);
  if (user instanceof Response) return user;
  const id = String(params.id);
  const input = await readBody(request, volunteerDecisionSchema);
  if (input instanceof Response) return input;

  const existing = await env.DB.prepare(
    `SELECT v.id, v.assignment_id, v.personnel_id, v.role_qualification_id, v.status,
            a.start_at, a.end_at, a.publication_state
       FROM shift_volunteers v
       JOIN assignment_instances a ON a.id = v.assignment_id
      WHERE v.id = ?`,
  )
    .bind(id)
    .first<{
      id: string;
      assignment_id: string;
      personnel_id: string;
      role_qualification_id: string | null;
      status: string;
      start_at: number;
      end_at: number;
      publication_state: string;
    }>();
  if (!existing) return fail(404, ErrorCodes.NOT_FOUND);
  if (existing.status !== 'offered') return fail(409, ErrorCodes.CONFLICT);

  const timestamp = now();
  const statements = [
    env.DB.prepare(
      'UPDATE shift_volunteers SET status = ?, decided_by = ?, decided_at = ?, updated_at = ? WHERE id = ?',
    ).bind(input.status, user.id, timestamp, timestamp, id),
    auditStatement(env, user, AuditActions.VOLUNTEER_DECIDED, 'volunteer', id, {
      status: input.status,
      assignmentId: existing.assignment_id,
    }),
  ];

  if (input.status === 'accepted') {
    const evaluation = await evaluateWindow(env, {
      from: existing.start_at - 8 * DAY,
      to: existing.end_at + 8 * DAY,
    });
    const person = evaluation.personnel.find((candidate) => candidate.id === existing.personnel_id);
    if (!person) return fail(404, ErrorCodes.NOT_FOUND);
    if (person.status !== 'active') {
      return fail(422, ErrorCodes.VALIDATION_FAILED, {
        fields: { personnelId: 'ניתן לשבץ רק אנשים פעילים' },
      });
    }
    const assignment = evaluation.assignments.find((one) => one.id === existing.assignment_id);
    if (assignment?.assignees.some((one) => one.personnelId === existing.personnel_id)) {
      return fail(409, ErrorCodes.ALREADY_ASSIGNED);
    }

    const verdict = verifySeat(evaluation, await engineQualifications(env), person, {
      assignmentId: existing.assignment_id,
      role: existing.role_qualification_id,
    });
    if (verdict.refusal) {
      return fail(422, ErrorCodes.VALIDATION_FAILED, { fields: { role: verdict.refusal } });
    }
    if (verdict.blocking.length > 0) {
      return fail(409, ErrorCodes.SCHEDULING_CONFLICT, { conflicts: verdict.blocking });
    }

    statements.push(
      env.DB.prepare(
        `INSERT INTO assignment_personnel
           (id, assignment_id, personnel_id, assigned_by, assigned_at, role_qualification_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).bind(
        newId('apr'),
        existing.assignment_id,
        existing.personnel_id,
        user.id,
        timestamp,
        existing.role_qualification_id,
      ),
      env.DB.prepare(
        `UPDATE assignment_instances
            SET publication_state = CASE WHEN publication_state = 'published' THEN 'modified' ELSE publication_state END,
                updated_by = ?, updated_at = ?
          WHERE id = ?`,
      ).bind(user.id, timestamp, existing.assignment_id),
    );
  }

  const recipient = (await usersForPersonnel(env, [existing.personnel_id])).get(
    existing.personnel_id,
  );
  if (recipient) {
    statements.push(
      notificationStatement(
        env,
        recipient,
        input.status === 'accepted' ? 'VOLUNTEER_ACCEPTED' : 'VOLUNTEER_DECLINED',
        input.status === 'accepted' ? 'ההצעה שלך התקבלה — שובצת' : 'ההצעה שלך לא נדרשה',
        null,
        'assignment',
        existing.assignment_id,
      ),
    );
  }

  await env.DB.batch(statements);
  return ok({ id, status: input.status });
};
