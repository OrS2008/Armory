import { ErrorCodes } from '../../../../../shared/errors';
import { replacementResponseSchema } from '../../../../../shared/schemas';
import {
  AuditActions,
  auditStatement,
  notificationStatement,
  usersForPersonnel,
  usersWhoDecide,
} from '../../../../_lib/audit';
import { requireUser } from '../../../../_lib/auth';
import { checkOrigin, fail, now, ok, readBody, type Env } from '../../../../_lib/http';

/**
 * The stand-in's own answer.
 *
 * Nobody is put on a shift by an arrangement they were never told about. Only
 * the person named can answer, and neither answer decides anything on its own:
 * agreeing hands a settled arrangement to whoever approves it, and declining
 * returns the request to the pile rather than closing it — the requester still
 * needs cover.
 */
export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) => {
  const origin = checkOrigin(request);
  if (origin) return origin;
  const user = await requireUser(request, env);
  if (user instanceof Response) return user;
  const id = String(params.id);
  const input = await readBody(request, replacementResponseSchema);
  if (input instanceof Response) return input;

  const existing = await env.DB.prepare(
    `SELECT id, assignment_id, personnel_id, replacement_personnel_id, status
       FROM replacement_requests WHERE id = ?`,
  )
    .bind(id)
    .first<{
      id: string;
      assignment_id: string;
      personnel_id: string;
      replacement_personnel_id: string | null;
      status: string;
    }>();
  if (!existing) return fail(404, ErrorCodes.NOT_FOUND);

  // Answering for somebody else is the one thing this endpoint must not allow,
  // so it is checked against the account rather than against what was sent.
  if (!user.personnelId || user.personnelId !== existing.replacement_personnel_id) {
    return fail(403, ErrorCodes.FORBIDDEN);
  }
  if (existing.status !== 'proposed') return fail(409, ErrorCodes.CONFLICT);

  const timestamp = now();
  const statements = [];

  if (input.accept) {
    statements.push(
      env.DB.prepare(
        'UPDATE replacement_requests SET accepted_at = ?, accepted_by = ?, updated_at = ? WHERE id = ?',
      ).bind(timestamp, user.id, timestamp, id),
    );
    for (const decider of await usersWhoDecide(env)) {
      statements.push(
        notificationStatement(
          env,
          decider,
          'REPLACEMENT_ACCEPTED',
          'המחליף אישר — הבקשה ממתינה לאישורכם',
          null,
          'replacement',
          id,
        ),
      );
    }
  } else {
    /*
     * Back to the pile, not closed. The person who asked still needs cover,
     * and a declined proposal that ended the request would leave them looking
     * at an answered row while nobody stands their shift.
     */
    statements.push(
      env.DB.prepare(
        `UPDATE replacement_requests
            SET status = 'pending', replacement_personnel_id = NULL, accepted_at = NULL,
                accepted_by = NULL, updated_at = ?
          WHERE id = ?`,
      ).bind(timestamp, id),
    );
  }

  const requester = (await usersForPersonnel(env, [existing.personnel_id])).get(
    existing.personnel_id,
  );
  if (requester) {
    statements.push(
      notificationStatement(
        env,
        requester,
        input.accept ? 'REPLACEMENT_ACCEPTED' : 'REPLACEMENT_DECLINED',
        input.accept ? 'המחליף שהצעת הסכים' : 'המחליף שהצעת לא יכול',
        null,
        'replacement',
        existing.assignment_id,
      ),
    );
  }

  statements.push(
    auditStatement(env, user, AuditActions.REPLACEMENT_ANSWERED, 'replacement', id, {
      accepted: input.accept,
    }),
  );

  await env.DB.batch(statements);
  return ok({ id, accepted: input.accept, status: input.accept ? 'proposed' : 'pending' });
};
