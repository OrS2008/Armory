import { openSeatRoles } from '../../../../shared/crew';
import { ErrorCodes } from '../../../../shared/errors';
import { DAY } from '../../../../shared/time';
import { requireUser } from '../../../_lib/auth';
import { engineQualifications, evaluateWindow, toEngineAssignment } from '../../../_lib/data';
import { verifySeat } from '../../../_lib/seat';
import { fail, ok, type Env } from '../../../_lib/http';

/** How far ahead to look, and how many shifts to examine within it. */
const HORIZON_DAYS = 7;
const EXAMINE = 60;
const OFFER_AT_MOST = 12;

/**
 * Seats nobody is standing that this person actually could.
 *
 * A shift short of people is a hole the commander is trying to fill, and
 * somebody free who would take it is the answer — but a soldier had no way of
 * seeing the hole, so the offer was made in the group chat or not at all.
 *
 * The list is filtered by the same engine that would refuse the assignment, so
 * a seat offered here is one that can actually be taken: offering a soldier a
 * shift the roster would then refuse is worse than offering nothing.
 */
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const user = await requireUser(request, env);
  if (user instanceof Response) return user;
  const me = user.personnelId;
  if (!me) return fail(404, ErrorCodes.NOT_FOUND);

  const from = Date.now();
  const to = from + HORIZON_DAYS * DAY;
  const evaluation = await evaluateWindow(env, { from: from - 8 * DAY, to: to + DAY });
  const person = evaluation.personnel.find((candidate) => candidate.id === me);
  if (!person || person.status !== 'active') return ok({ seats: [], window: { from, to } });

  const qualifications = await engineQualifications(env);

  const offered = await env.DB.prepare(
    "SELECT assignment_id FROM shift_volunteers WHERE personnel_id = ? AND status IN ('offered','accepted')",
  )
    .bind(me)
    .all<{ assignment_id: string }>();
  const alreadyOffered = new Set((offered.results ?? []).map((row) => row.assignment_id));

  /*
   * Whether somebody may take a seat depends on their own shifts and on the
   * seat, and on nothing else — so each check is handed those rather than the
   * whole window. Without that, examining sixty shifts means running the
   * engine over the whole fortnight sixty times, which is not a thing a
   * request may spend.
   */
  const mine = evaluation.assignments.filter((assignment) =>
    assignment.assignees.some((assignee) => assignee.personnelId === me),
  );

  const seats = [];
  const shortlist = evaluation.assignments
    .filter(
      (assignment) =>
        assignment.status === 'planned' &&
        assignment.startAt >= from &&
        assignment.startAt <= to &&
        assignment.assignees.length < assignment.requiredHeadcount &&
        !assignment.assignees.some((assignee) => assignee.personnelId === me) &&
        !alreadyOffered.has(assignment.id),
    )
    .sort((a, b) => a.startAt - b.startAt)
    .slice(0, EXAMINE);

  for (const assignment of shortlist) {
    if (seats.length >= OFFER_AT_MOST) break;
    const engine = toEngineAssignment(assignment);
    // A named seat belongs to its mark here too, so a seat this person could
    // never hold is not offered to them at all.
    const options = [...new Set(openSeatRoles(engine))].filter(
      (role) => role === null || person.qualificationIds.includes(role),
    );

    for (const role of options) {
      const verdict = verifySeat(
        { ...evaluation, assignments: [...mine, assignment] },
        qualifications,
        person,
        { assignmentId: assignment.id, role },
      );
      if (verdict.refusal || verdict.blocking.length > 0) continue;
      seats.push({
        assignmentId: assignment.id,
        title: assignment.title ?? assignment.sheetLabel ?? assignment.assignmentTypeName,
        section: assignment.section,
        startAt: assignment.startAt,
        endAt: assignment.endAt,
        role,
        roleLabel: role ? (qualifications.qualificationNames[role] ?? role) : null,
        missing: assignment.requiredHeadcount - assignment.assignees.length,
      });
      break;
    }
  }

  return ok({ seats, window: { from, to }, timezone: evaluation.timezone });
};
