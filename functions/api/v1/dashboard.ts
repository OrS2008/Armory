import { summarizeConflicts } from '../../../shared/conflicts';
import { Permissions, can, expandScope } from '../../../shared/rbac';
import { DAY, dayKey, endOfDay, startOfDay } from '../../../shared/time';
import { requireUser, unitParents } from '../../_lib/auth';
import { evaluateWindow, loadAvailability } from '../../_lib/data';
import { ok, type Env } from '../../_lib/http';

/** Everything the control board answers at a glance (plan section 6.1). */
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const user = await requireUser(request, env);
  if (user instanceof Response) return user;

  const scoped = expandScope(user.unitScope, await unitParents(env));
  const evaluation = await evaluateWindow(env, {
    from: Date.now() - DAY,
    to: Date.now() + 7 * DAY,
    unitIds: scoped,
  });
  const timezone = evaluation.timezone;
  const today = dayKey(Date.now(), timezone);
  const dayStart = startOfDay(today, timezone);
  const dayEnd = endOfDay(today, timezone);

  const todaysAssignments = evaluation.assignments.filter(
    (assignment) => assignment.endAt > dayStart && assignment.startAt < dayEnd,
  );
  const absences = (
    await loadAvailability(env, { from: dayStart, to: dayEnd, status: 'approved' })
  ).filter((entry) => entry.kind !== 'available');
  const unavailableIds = new Set(absences.map((entry) => entry.personnelId));
  const activePersonnel = evaluation.personnel.filter((person) => person.status === 'active');
  const assignedToday = new Set(
    todaysAssignments.flatMap((assignment) =>
      assignment.assignees.map((assignee) => assignee.personnelId),
    ),
  );

  const understaffed = todaysAssignments.filter(
    (assignment) => assignment.assignees.length < assignment.requiredHeadcount,
  );
  // Seats, not shifts: a post short of three people and a post short of one
  // are not the same problem, and the sheet is read by the seat.
  const openSeats = todaysAssignments.reduce(
    (total, assignment) =>
      total + Math.max(0, assignment.requiredHeadcount - assignment.assignees.length),
    0,
  );

  const recent = can(user, Permissions.auditRead)
    ? await env.DB.prepare(
        `SELECT id, actor_name, action, entity_type, entity_id, created_at
           FROM audit_events ORDER BY created_at DESC LIMIT 8`,
      ).all<{
        id: string;
        actor_name: string;
        action: string;
        entity_type: string;
        entity_id: string;
        created_at: number;
      }>()
    : { results: [] };

  return ok({
    date: today,
    timezone,
    stats: {
      availableCount: activePersonnel.filter((person) => !unavailableIds.has(person.id)).length,
      unavailableCount: unavailableIds.size,
      assignedCount: assignedToday.size,
      personnelCount: activePersonnel.length,
      understaffedCount: understaffed.length,
      openSeatCount: openSeats,
    },
    conflictSummary: summarizeConflicts(evaluation.conflicts),
    upcoming: evaluation.assignments
      .filter((assignment) => assignment.endAt > Date.now())
      .slice(0, 8),
    conflicts: evaluation.conflicts.slice(0, 8),
    recentChanges: (recent.results ?? []).map((row) => ({
      id: row.id,
      actorName: row.actor_name,
      action: row.action,
      entityType: row.entity_type,
      entityId: row.entity_id,
      createdAt: row.created_at,
    })),
  });
};
