import { buildCalendar, type CalendarEvent } from '../../../../shared/ics';
import { seatPlan } from '../../../../shared/crew';
import { DAY } from '../../../../shared/time';
import { engineQualifications, loadAssignments, orgTimezone } from '../../../_lib/data';
import { sha256, type Env } from '../../../_lib/http';

/**
 * One person's duty times, as a calendar anyone can subscribe to.
 *
 * Deliberately unauthenticated: a calendar app cannot sign in, so the token in
 * the path is the whole credential. It is therefore read-only, scoped to a
 * single person, and revoked by issuing another — see `me/calendar`.
 *
 * A wrong token is answered exactly like a retired one, and neither says which.
 */
export const onRequestGet: PagesFunction<Env> = async ({ env, params }) => {
  // Calendar clients are happier with a path that ends in .ics, and some
  // refuse one that does not.
  const raw = String(params.token ?? '').replace(/\.ics$/i, '');
  const deny = () => new Response('Not found', { status: 404 });
  if (!/^[0-9a-f]{32,128}$/.test(raw)) return deny();

  const account = await env.DB.prepare(
    `SELECT u.personnel_id, p.display_name
       FROM users u
       JOIN personnel p ON p.id = u.personnel_id
      WHERE u.calendar_token_hash = ? AND u.active = 1`,
  )
    .bind(await sha256(raw))
    .first<{ personnel_id: string; display_name: string }>();
  if (!account) return deny();

  const from = Date.now() - 7 * DAY;
  const to = Date.now() + 120 * DAY;
  const [assignments, timezone, qualifications] = await Promise.all([
    loadAssignments(env, { from, to, personnelId: account.personnel_id }),
    orgTimezone(env),
    engineQualifications(env),
  ]);

  const events: CalendarEvent[] = assignments
    // A cancelled shift is kept as the record of a day that happened, but the
    // person is no longer expected at the gate, so it leaves the calendar.
    .filter((assignment) => assignment.status !== 'cancelled')
    .map((assignment) => {
      const seat = assignment.assignees.find(
        (assignee) => assignee.personnelId === account.personnel_id,
      );
      const post = assignment.sheetLabel ?? assignment.assignmentTypeName;
      /*
       * The seat's own label, the way the sheet prints it — מפקד סיור, not
       * מפקד. Somebody reading this in their phone at 04:30 wants to know what
       * they are turning up as, and a plain seat is a לוחם whether or not the
       * roster stored the word.
       */
      const named = seatPlan(assignment).some((slot) => slot.named);
      const suffix = assignment.crewRoleSuffix ? ` ${assignment.crewRoleSuffix}` : '';
      const role = seat?.role
        ? `${qualifications.qualificationNames[seat.role] ?? seat.role}${suffix}`
        : named
          ? `לוחם${suffix}`
          : null;

      return {
        uid: `${assignment.id}.${account.personnel_id}@shabatzak`,
        startAt: assignment.startAt,
        endAt: assignment.endAt,
        summary: role ? `${post} — ${role}` : post,
        description: assignment.notes ?? assignment.instructions,
        location: assignment.section,
      };
    });

  return new Response(
    buildCalendar({
      name: `שבצ״ק — ${account.display_name}`,
      timezone,
      events,
      stamp: Date.now(),
      alarmMinutesBefore: 60,
    }),
    {
      headers: {
        'content-type': 'text/calendar; charset=utf-8',
        'content-disposition': 'inline; filename="shabatzak.ics"',
        // The feed is the credential; nothing in front of it may keep a copy.
        'cache-control': 'private, no-store',
        'x-robots-tag': 'noindex, nofollow',
      },
    },
  );
};
