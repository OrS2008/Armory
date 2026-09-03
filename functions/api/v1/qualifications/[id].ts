import { ErrorCodes } from '../../../../shared/errors';
import { Permissions } from '../../../../shared/rbac';
import { qualificationSchema } from '../../../../shared/schemas';
import { AuditActions, writeAudit } from '../../../_lib/audit';
import { requireUser } from '../../../_lib/auth';
import { boolToInt } from '../../../_lib/data';
import { checkOrigin, fail, now, ok, readBody, type Env } from '../../../_lib/http';

export const onRequestPatch: PagesFunction<Env> = async ({ request, env, params }) => {
  const origin = checkOrigin(request);
  if (origin) return origin;
  const user = await requireUser(request, env, Permissions.qualificationsWrite);
  if (user instanceof Response) return user;
  const id = String(params.id);
  const input = await readBody(request, qualificationSchema.partial());
  if (input instanceof Response) return input;

  const existing = await env.DB.prepare(
    'SELECT active, exclusive, blocks_scheduling FROM qualifications WHERE id = ?',
  )
    .bind(id)
    .first<{ active: number; exclusive: number; blocks_scheduling: number }>();
  if (!existing) return fail(404, ErrorCodes.NOT_FOUND);

  await env.DB.prepare(
    `UPDATE qualifications
        SET code = COALESCE(?, code), name = COALESCE(?, name), description = COALESCE(?, description),
            active = ?, exclusive = ?, blocks_scheduling = ?, updated_at = ?
      WHERE id = ?`,
  )
    .bind(
      input.code ?? null,
      input.name ?? null,
      input.description ?? null,
      boolToInt(input.active, existing.active),
      boolToInt(input.exclusive, existing.exclusive),
      boolToInt(input.blocksScheduling, existing.blocks_scheduling),
      now(),
      id,
    )
    .run();
  await writeAudit(env, user, AuditActions.QUALIFICATION_UPDATED, 'qualification', id, {
    fields: Object.keys(input),
  });
  return ok({ id });
};

/** What stands in the way of removing a mark, and what a merge would carry. */
async function usageOf(env: Env, id: string) {
  const row = await env.DB.prepare(
    `SELECT (SELECT COUNT(*) FROM personnel_qualifications WHERE qualification_id = ?1)      AS held_by,
            (SELECT COUNT(*) FROM assignment_type_qualifications WHERE qualification_id = ?1) AS required_by,
            (SELECT COUNT(*) FROM assignment_type_exclusions WHERE qualification_id = ?1)     AS excluded_by,
            (SELECT COUNT(*) FROM assignment_personnel WHERE role_qualification_id = ?1)      AS seats`,
  )
    .bind(id)
    .first<{ held_by: number; required_by: number; excluded_by: number; seats: number }>();
  return {
    heldBy: row?.held_by ?? 0,
    requiredBy: row?.required_by ?? 0,
    excludedBy: row?.excluded_by ?? 0,
    seats: row?.seats ?? 0,
  };
}

/**
 * Removes a mark, or merges it into another.
 *
 * A mark could be created here and edited here and never removed, so a typo —
 * or a second copy of something that already existed — stayed on the list for
 * good. That is how the company came to have two marks called קצין מוצב, each
 * held by different people, each meaning the same thing.
 *
 * A plain delete is refused while anything is attached, and says what: every
 * table that points at a mark cascades, so deleting one quietly strips it from
 * everyone who holds it and from every post that requires it. That is never
 * what the person pressing the button meant.
 *
 * `?merge=<id>` is the answer for a duplicate: everything moves onto the mark
 * that stays, and only then is this one removed. Nobody loses a qualification
 * and no post loses its requirement.
 */
export const onRequestDelete: PagesFunction<Env> = async ({ request, env, params }) => {
  const origin = checkOrigin(request);
  if (origin) return origin;
  const user = await requireUser(request, env, Permissions.qualificationsWrite);
  if (user instanceof Response) return user;
  const id = String(params.id);

  const existing = await env.DB.prepare('SELECT name FROM qualifications WHERE id = ?')
    .bind(id)
    .first<{ name: string }>();
  if (!existing) return fail(404, ErrorCodes.NOT_FOUND);

  const into = new URL(request.url).searchParams.get('merge');
  const usage = await usageOf(env, id);

  if (!into) {
    const attached = usage.heldBy + usage.requiredBy + usage.excludedBy + usage.seats;
    if (attached > 0) return fail(409, ErrorCodes.IN_USE, { usage });
    await env.DB.prepare('DELETE FROM qualifications WHERE id = ?').bind(id).run();
    await writeAudit(env, user, AuditActions.QUALIFICATION_DELETED, 'qualification', id, {
      name: existing.name,
    });
    return ok({ id, deleted: true, merged: null, usage });
  }

  if (into === id) {
    return fail(422, ErrorCodes.VALIDATION_FAILED, {
      fields: { merge: 'לא ניתן למזג הכשיר לתוך עצמו' },
    });
  }
  const target = await env.DB.prepare('SELECT id FROM qualifications WHERE id = ?')
    .bind(into)
    .first<{ id: string }>();
  if (!target) return fail(404, ErrorCodes.NOT_FOUND);

  /*
   * Each move adds before it removes, and ignores what is already there:
   * somebody holding both marks must end up holding the survivor once rather
   * than failing the merge on a primary key.
   *
   * The seat is the exception. `assignment_personnel` allows a named seat to be
   * taken once per shift, so a shift where the survivor's seat is already
   * filled cannot take a second — `UPDATE OR IGNORE` leaves that row pointing
   * at the mark being retired, and the sweep after it clears the seat rather
   * than removing anybody. The person stays on the shift, standing it as the
   * לוחם they were qualified for, which is the answer `crew-roles.yml` gives to
   * the same question.
   */
  await env.DB.batch([
    env.DB.prepare(
      `INSERT OR IGNORE INTO personnel_qualifications (personnel_id, qualification_id, granted_at, expires_at)
         SELECT personnel_id, ?2, granted_at, expires_at
           FROM personnel_qualifications WHERE qualification_id = ?1`,
    ).bind(id, into),
    env.DB.prepare(
      `INSERT OR IGNORE INTO assignment_type_qualifications (assignment_type_id, qualification_id, min_count)
         SELECT assignment_type_id, ?2, min_count
           FROM assignment_type_qualifications WHERE qualification_id = ?1`,
    ).bind(id, into),
    env.DB.prepare(
      `INSERT OR IGNORE INTO assignment_type_exclusions (assignment_type_id, qualification_id)
         SELECT assignment_type_id, ?2
           FROM assignment_type_exclusions WHERE qualification_id = ?1`,
    ).bind(id, into),
    env.DB.prepare(
      'UPDATE OR IGNORE assignment_personnel SET role_qualification_id = ?2 WHERE role_qualification_id = ?1',
    ).bind(id, into),
    env.DB.prepare(
      'UPDATE assignment_personnel SET role_qualification_id = NULL WHERE role_qualification_id = ?',
    ).bind(id),
    // The three tables above cascade from the row, so removing it takes the
    // originals with them.
    env.DB.prepare('DELETE FROM qualifications WHERE id = ?').bind(id),
  ]);

  await writeAudit(env, user, AuditActions.QUALIFICATION_DELETED, 'qualification', id, {
    name: existing.name,
    mergedInto: into,
    moved: usage,
  });
  return ok({ id, deleted: true, merged: into, usage });
};
