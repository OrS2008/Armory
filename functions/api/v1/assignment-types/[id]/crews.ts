import { ErrorCodes } from '../../../../../shared/errors';
import { Permissions } from '../../../../../shared/rbac';
import { crewsSchema } from '../../../../../shared/schemas';
import { AuditActions, writeAudit } from '../../../../_lib/audit';
import { requireUser } from '../../../../_lib/auth';
import { loadCrews } from '../../../../_lib/data';
import { checkOrigin, fail, newId, now, ok, readBody, type Env } from '../../../../_lib/http';

/** The fixed crews of one post, if it has any. */
export const onRequestGet: PagesFunction<Env> = async ({ request, env, params }) => {
  const user = await requireUser(request, env, Permissions.assignmentTypesRead);
  if (user instanceof Response) return user;
  const id = String(params.id);
  return ok({ crews: (await loadCrews(env)).get(id) ?? [] });
};

/**
 * Replaces every crew on the post in one act.
 *
 * A crew is only meaningful beside the others — "these four, and those four" —
 * so saving one at a time invites a moment where somebody belongs to both, or
 * to neither. The screen sends what the post should have and this makes it so,
 * in a single batch: a post half-way through a change of crews would refuse
 * every assignment on it until the second half arrived.
 */
export const onRequestPut: PagesFunction<Env> = async ({ request, env, params }) => {
  const origin = checkOrigin(request);
  if (origin) return origin;
  const user = await requireUser(request, env, Permissions.assignmentTypesWrite);
  if (user instanceof Response) return user;
  const id = String(params.id);
  const input = await readBody(request, crewsSchema);
  if (input instanceof Response) return input;

  const post = await env.DB.prepare('SELECT id FROM assignment_types WHERE id = ?')
    .bind(id)
    .first<{ id: string }>();
  if (!post) return fail(404, ErrorCodes.NOT_FOUND);

  // Somebody in two crews of one post makes "which crew is this shift" a
  // question with no answer, so it is refused rather than resolved.
  const seen = new Map<string, string>();
  for (const crew of input.crews) {
    for (const member of crew.members) {
      const already = seen.get(member.personnelId);
      if (already && already !== crew.name) {
        return fail(422, ErrorCodes.VALIDATION_FAILED, {
          fields: { crews: `אדם אחד אינו יכול להיות גם ב${already} וגם ב${crew.name}` },
        });
      }
      seen.set(member.personnelId, crew.name);
    }
  }
  const names = new Set(input.crews.map((crew) => crew.name));
  if (names.size !== input.crews.length) {
    return fail(422, ErrorCodes.VALIDATION_FAILED, {
      fields: { crews: 'לשני סבבים באותה משימה יש אותו שם' },
    });
  }

  const timestamp = now();
  const statements = [
    env.DB.prepare('DELETE FROM assignment_type_crews WHERE assignment_type_id = ?').bind(id),
  ];
  for (const crew of input.crews) {
    const crewId = newId('crw');
    statements.push(
      env.DB.prepare(
        `INSERT INTO assignment_type_crews
           (id, assignment_type_id, name, position, active, created_at, updated_at)
         VALUES (?, ?, ?, ?, 1, ?, ?)`,
      ).bind(crewId, id, crew.name, crew.position, timestamp, timestamp),
    );
    for (const member of crew.members) {
      statements.push(
        env.DB.prepare(
          `INSERT INTO assignment_type_crew_members (crew_id, personnel_id, role_qualification_id)
           VALUES (?, ?, ?)`,
        ).bind(crewId, member.personnelId, member.role ?? null),
      );
    }
  }

  await env.DB.batch(statements);
  await writeAudit(env, user, AuditActions.ASSIGNMENT_TYPE_UPDATED, 'assignment_type', id, {
    crews: input.crews.length,
    members: input.crews.reduce((total, crew) => total + crew.members.length, 0),
  });
  return ok({ id, crews: input.crews.length });
};
