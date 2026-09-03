import { ErrorCodes } from '../../../../shared/errors';
import { formatRange } from '../../../../shared/format';
import { Permissions, can } from '../../../../shared/rbac';
import { replacementSchema } from '../../../../shared/schemas';
import { DAY } from '../../../../shared/time';
import {
  AuditActions,
  auditStatement,
  notificationStatement,
  usersForPersonnel,
  usersWhoDecide,
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
import type { ReplacementStatus } from '../../../../shared/types';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const user = await requireUser(request, env);
  if (user instanceof Response) return user;
  const params = searchParams(request);

  const filters: string[] = [];
  const bindings: unknown[] = [];
  if (!can(user, Permissions.replacementsRead)) {
    if (!user.personnelId) return ok({ replacements: [] });
    filters.push('(r.personnel_id = ? OR r.replacement_personnel_id = ?)');
    bindings.push(user.personnelId, user.personnelId);
  }
  const status = params.get('status');
  if (status === 'open') {
    // What the screen is for: the requests still waiting on somebody. A
    // decided one is a record, and it is asked for by name.
    filters.push("r.status IN ('pending','proposed')");
  } else if (status) {
    filters.push('r.status = ?');
    bindings.push(status);
  }
  const where = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';

  const rows = await env.DB.prepare(
    `SELECT r.id, r.assignment_id, COALESCE(a.title, t.name) AS assignment_title, a.start_at,
            a.end_at, r.personnel_id, p.display_name AS personnel_name,
            r.replacement_personnel_id, rp.display_name AS replacement_name, r.status, r.reason,
            r.created_at, r.decided_at, r.accepted_at
       FROM replacement_requests r
       JOIN assignment_instances a ON a.id = r.assignment_id
       JOIN assignment_types t ON t.id = a.assignment_type_id
       JOIN personnel p ON p.id = r.personnel_id
       LEFT JOIN personnel rp ON rp.id = r.replacement_personnel_id
       ${where}
      ORDER BY r.created_at DESC LIMIT 200`,
  )
    .bind(...bindings)
    .all<{
      id: string;
      assignment_id: string;
      assignment_title: string;
      start_at: number;
      end_at: number;
      personnel_id: string;
      personnel_name: string;
      replacement_personnel_id: string | null;
      replacement_name: string | null;
      status: ReplacementStatus;
      reason: string | null;
      created_at: number;
      decided_at: number | null;
      accepted_at: number | null;
    }>();

  return ok({
    replacements: (rows.results ?? []).map((row) => ({
      id: row.id,
      assignmentId: row.assignment_id,
      assignmentTitle: row.assignment_title,
      startAt: row.start_at,
      endAt: row.end_at,
      personnelId: row.personnel_id,
      personnelName: row.personnel_name,
      replacementPersonnelId: row.replacement_personnel_id,
      replacementPersonnelName: row.replacement_name,
      status: row.status,
      reason: row.reason,
      createdAt: row.created_at,
      decidedAt: row.decided_at,
      acceptedAt: row.accepted_at,
    })),
  });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const origin = checkOrigin(request);
  if (origin) return origin;
  const user = await requireUser(request, env);
  if (user instanceof Response) return user;
  const input = await readBody(request, replacementSchema);
  if (input instanceof Response) return input;

  const isOwn = input.personnelId === user.personnelId;
  if (!isOwn && !can(user, Permissions.replacementsDecide)) {
    return fail(403, ErrorCodes.FORBIDDEN);
  }

  const shift = await env.DB.prepare(
    `SELECT ap.role_qualification_id, a.start_at, a.end_at
       FROM assignment_personnel ap
       JOIN assignment_instances a ON a.id = ap.assignment_id
      WHERE ap.assignment_id = ? AND ap.personnel_id = ?`,
  )
    .bind(input.assignmentId, input.personnelId)
    .first<{ role_qualification_id: string | null; start_at: number; end_at: number }>();
  if (!shift) return fail(404, ErrorCodes.NOT_FOUND);

  /*
   * A stand-in the requester found themselves.
   *
   * This is the arrangement that already happens, in the group chat, where
   * nothing checks it and nothing records it. Bringing it here means checking
   * it: the proposal is refused now rather than at approval, so nobody spends
   * an evening arranging cover the roster was never going to accept. They
   * still have to agree, and a commander still has to approve.
   */
  const standIn = input.replacementPersonnelId ?? null;
  const statements = [];
  let status: ReplacementStatus = 'pending';

  if (standIn) {
    if (standIn === input.personnelId) {
      return fail(422, ErrorCodes.VALIDATION_FAILED, {
        fields: { replacementPersonnelId: 'המחליף והמוחלף הם אותו אדם' },
      });
    }
    const evaluation = await evaluateWindow(env, {
      from: shift.start_at - 8 * DAY,
      to: shift.end_at + 8 * DAY,
    });
    const person = evaluation.personnel.find((candidate) => candidate.id === standIn);
    if (!person) return fail(404, ErrorCodes.NOT_FOUND);
    if (person.status !== 'active') {
      return fail(422, ErrorCodes.VALIDATION_FAILED, {
        fields: { replacementPersonnelId: 'ניתן לשבץ רק אנשים פעילים' },
      });
    }
    const verdict = verifySeat(evaluation, await engineQualifications(env), person, {
      assignmentId: input.assignmentId,
      role: shift.role_qualification_id,
      vacating: input.personnelId,
    });
    if (verdict.refusal) {
      return fail(422, ErrorCodes.VALIDATION_FAILED, {
        fields: { replacementPersonnelId: verdict.refusal },
      });
    }
    if (verdict.blocking.length > 0) {
      return fail(409, ErrorCodes.SCHEDULING_CONFLICT, { conflicts: verdict.blocking });
    }
    status = 'proposed';
  }

  const id = newId('rep');
  const timestamp = now();
  statements.push(
    env.DB.prepare(
      `INSERT INTO replacement_requests (id, assignment_id, personnel_id, replacement_personnel_id,
                                         status, reason, requested_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      id,
      input.assignmentId,
      input.personnelId,
      standIn,
      status,
      input.reason ?? null,
      user.id,
      timestamp,
      timestamp,
    ),
    auditStatement(
      env,
      user,
      standIn ? AuditActions.REPLACEMENT_PROPOSED : AuditActions.REPLACEMENT_REQUESTED,
      'replacement',
      id,
      { assignmentId: input.assignmentId },
    ),
  );

  if (standIn) {
    // Being named is the whole point: nobody is put on a shift by an
    // arrangement they were never told about.
    const recipient = (await usersForPersonnel(env, [standIn])).get(standIn);
    if (recipient) {
      statements.push(
        notificationStatement(
          env,
          recipient,
          'REPLACEMENT_PROPOSED',
          'ביקשו ממך להחליף במשמרת',
          formatRange(shift.start_at, shift.end_at, await orgTimezone(env)),
          'replacement',
          id,
        ),
      );
    }
  } else {
    for (const decider of await usersWhoDecide(env)) {
      statements.push(
        notificationStatement(
          env,
          decider,
          'REPLACEMENT_REQUESTED',
          'התקבלה בקשת החלפה',
          null,
          'replacement',
          id,
        ),
      );
    }
  }

  await env.DB.batch(statements);
  return ok({ id, status });
};
