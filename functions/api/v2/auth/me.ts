import { json, requireUser, type Env } from '../../../_shared/http';
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const user = await requireUser(request, env);
  return user instanceof Response ? user : json({ ok: true, user });
};
