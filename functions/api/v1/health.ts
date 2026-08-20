import { ok, type Env } from '../../_lib/http';

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const probe = await env.DB.prepare('SELECT 1 AS ready').first<{ ready: number }>();
  return ok({ status: probe?.ready === 1 ? 'ready' : 'degraded', time: Date.now() });
};
