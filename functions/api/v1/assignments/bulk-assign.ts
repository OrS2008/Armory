import { detectConflicts } from '../../../../shared/conflicts';
import { ErrorCodes } from '../../../../shared/errors';
import { Permissions } from '../../../../shared/rbac';
import { bulkAssignSchema } from '../../../../shared/schemas';
import { DAY } from '../../../../shared/time';
import { AuditActions, auditStatement } from '../../../_lib/audit';
import { requireUser } from '../../../_lib/auth';
import {
  evaluateWindow,
  loadQualifications,
  toEngineAbsences,
  toEngineAssignment,
  toEnginePerson,
} from '../../../_lib/data';
import { checkOrigin, fail, newId, now, ok, readBody, type Env } from '../../../_lib/http';

/**
 * Apply an approved auto-fill proposal.
 *
 * The proposal is computed in the browser, so it is re-validated here against
 * the database as it stands now: the engine runs once over the whole window
 * with every proposed placement applied, and any pairing that would create a
 * blocking conflict is rejected rather than written. Everything that survives
 * is written in a single batch, so the board never shows half a schedule.
 */
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const origin = checkOrigin(request);
  if (origin) return origin;
  const user = await requireUser(request, env, Permissions.assignmentsAssign);
  if (user instanceof Response) return user;
  const input = await readBody(request, bulkAssignSchema);
  if (input instanceof Response) return input;

  const ids = [...new Set(input.assignments.map((item) => item.assignmentId))];
  const placeholders = ids.map(() => '?').join(',');
  const rows = await env.DB.prepare(
    `SELECT id, start_at, end_at, publication_state FROM assignment_instances
      WHERE id IN (${placeholders}) AND status = 'planned'`,
  )
    .bind(...ids)
    .all<{ id: string; start_at: number; end_at: number; publication_state: string }>();
  const targets = rows.results ?? [];
  if (targets.length === 0) return fail(404, ErrorCodes.NOT_FOUND);

  const from = Math.min(...targets.map((row) => row.start_at)) - 8 * DAY;
  const to = Math.max(...targets.map((row) => row.end_at)) + 8 * DAY;
  const evaluation = await evaluateWindow(env, { from, to });
  const qualifications = await loadQualifications(env);

  const activeIds = new Set(
    evaluation.personnel.filter((person) => person.status === 'active').map((person) => person.id),
  );
  const targetIds = new Set(targets.map((row) => row.id));

  // Build the world as it would be once the proposal is applied, then judge it.
  const additions = new Map<string, string[]>();
  const rejected: { assignmentId: string; personnelId: string; reason: string }[] = [];

  for (const pair of input.assignments) {
    if (!targetIds.has(pair.assignmentId)) {
      rejected.push({ ...pair, reason: 'המשימה אינה קיימת או בוטלה' });
      continue;
    }
    if (!activeIds.has(pair.personnelId)) {
      rejected.push({ ...pair, reason: 'ניתן לשבץ רק אנשים פעילים' });
      continue;
    }
    const existing = evaluation.assignments
      .find((assignment) => assignment.id === pair.assignmentId)
      ?.assignees.some((assignee) => assignee.personnelId === pair.personnelId);
    const alreadyProposed = (additions.get(pair.assignmentId) ?? []).includes(pair.personnelId);
    if (existing || alreadyProposed) {
      rejected.push({ ...pair, reason: 'האדם כבר משובץ למשימה זו' });
      continue;
    }
    additions.set(pair.assignmentId, [
      ...(additions.get(pair.assignmentId) ?? []),
      pair.personnelId,
    ]);
  }

  const engineAssignments = evaluation.assignments.map((assignment) => {
    const engine = toEngineAssignment(assignment);
    const extra = additions.get(assignment.id) ?? [];
    return extra.length > 0
      ? { ...engine, assigneeIds: [...engine.assigneeIds, ...extra], overriddenBy: [] }
      : engine;
  });

  const conflicts = detectConflicts({
    assignments: engineAssignments,
    personnel: evaluation.personnel.map(toEnginePerson),
    absences: toEngineAbsences(evaluation.availability),
    rules: evaluation.rules,
    qualificationNames: Object.fromEntries(
      qualifications.map((qualification) => [qualification.id, qualification.name]),
    ),
    timezone: evaluation.timezone,
  });

  // A blocking conflict naming a proposed person drops that placement, not the
  // whole batch: one bad pairing should not discard a day's work.
  const blocked = new Set<string>();
  for (const conflict of conflicts) {
    if (conflict.severity !== 'blocking' || !conflict.personnelId || !conflict.assignmentId) {
      continue;
    }
    const key = `${conflict.assignmentId}:${conflict.personnelId}`;
    if ((additions.get(conflict.assignmentId) ?? []).includes(conflict.personnelId)) {
      blocked.add(key);
      rejected.push({
        assignmentId: conflict.assignmentId,
        personnelId: conflict.personnelId,
        reason: conflict.message,
      });
    }
  }

  const timestamp = now();
  const statements: D1PreparedStatement[] = [];
  let applied = 0;

  for (const [assignmentId, personnelIds] of additions) {
    const accepted = personnelIds.filter(
      (personnelId) => !blocked.has(`${assignmentId}:${personnelId}`),
    );
    if (accepted.length === 0) continue;
    for (const personnelId of accepted) {
      statements.push(
        env.DB.prepare(
          `INSERT OR IGNORE INTO assignment_personnel (id, assignment_id, personnel_id, assigned_by, assigned_at)
           VALUES (?, ?, ?, ?, ?)`,
        ).bind(newId('apr'), assignmentId, personnelId, user.id, timestamp),
      );
      applied += 1;
    }
    const target = targets.find((row) => row.id === assignmentId);
    statements.push(
      env.DB.prepare(
        `UPDATE assignment_instances
            SET publication_state = ?, updated_by = ?, updated_at = ?
          WHERE id = ?`,
      ).bind(
        target?.publication_state === 'published'
          ? 'modified'
          : (target?.publication_state ?? 'draft'),
        user.id,
        timestamp,
        assignmentId,
      ),
    );
  }

  if (statements.length > 0) {
    statements.push(
      auditStatement(env, user, AuditActions.PERSONNEL_ASSIGNED, 'assignment', 'autofill', {
        applied,
        rejected: rejected.length,
        assignments: additions.size,
      }),
    );
    await env.DB.batch(statements);
  }

  return ok({ applied, rejected });
};
