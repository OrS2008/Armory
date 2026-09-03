import { Permissions } from '../../../../shared/rbac';
import { requireUser } from '../../../_lib/auth';
import { loadCrews, toEngineCrews } from '../../../_lib/data';
import { ok, type Env } from '../../../_lib/http';

/**
 * Every post's fixed crews, in the shape the engine reads.
 *
 * Auto-fill runs in the browser, so the browser needs them: without them a
 * proposal happily mixes סבב א׳ with סבב ב׳, and the server drops half of it —
 * the reviewer approves a full crew and gets two people on the shift.
 */
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const user = await requireUser(request, env, Permissions.assignmentTypesRead);
  if (user instanceof Response) return user;
  return ok({ crewsByType: toEngineCrews(await loadCrews(env)) });
};
