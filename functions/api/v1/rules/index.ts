import { Permissions } from '../../../../shared/rbac';
import { requireUser } from '../../../_lib/auth';
import { loadRules } from '../../../_lib/data';
import { ok, type Env } from '../../../_lib/http';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const user = await requireUser(request, env, Permissions.rulesRead);
  if (user instanceof Response) return user;
  return ok({ rules: await loadRules(env) });
};
