import { ErrorCodes } from '../../../../shared/errors';
import { loadSessionUser } from '../../../_lib/auth';
import { fail, ok, type Env } from '../../../_lib/http';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const user = await loadSessionUser(request, env);
  if (!user) return fail(401, ErrorCodes.AUTH_REQUIRED);
  return ok({ user });
};
