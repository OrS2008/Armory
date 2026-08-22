import { ErrorCodes } from '../../../../shared/errors';
import { DAY } from '../../../../shared/time';
import { requireUser } from '../../../_lib/auth';
import { loadAssignments, loadAvailability, orgTimezone } from '../../../_lib/data';
import { fail, intParam, ok, searchParams, type Env } from '../../../_lib/http';

/** The soldier's personal view — only their own rows (plan section 22). */
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const user = await requireUser(request, env);
  if (user instanceof Response) return user;
  if (!user.personnelId) return fail(404, ErrorCodes.NOT_FOUND);

  const params = searchParams(request);
  const from = intParam(params, 'from', Date.now() - DAY);
  const to = intParam(params, 'to', Date.now() + 21 * DAY);

  const [assignments, availability, timezone] = await Promise.all([
    loadAssignments(env, { from, to, personnelId: user.personnelId }),
    loadAvailability(env, { from, to, personnelId: user.personnelId }),
    orgTimezone(env),
  ]);

  /*
   * Everything the soldier is on, whatever its publication state.
   *
   * There is no publication step any more — the sheet goes out as a PDF in the
   * group chat — so filtering drafts out left this screen permanently empty
   * while the board showed the same soldier three shifts. A shift somebody has
   * been put on is a shift they are on.
   */
  return ok({
    personnelId: user.personnelId,
    timezone,
    assignments: assignments.map((assignment) => ({
      ...assignment,
      assignees: assignment.assignees.filter(
        (assignee) => assignee.personnelId === user.personnelId,
      ),
    })),
    availability,
    window: { from, to },
  });
};
