import { schemaReady } from '../../_lib/data';
import { ok, type Env } from '../../_lib/http';

/**
 * Readiness probe. Reports the D1 binding and the schema separately, because
 * they fail separately: a binding can be perfectly wired to a database whose
 * migrations were never applied, and `SELECT 1` would still succeed.
 */
export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  let database: 'ready' | 'unreachable' = 'ready';
  try {
    const probe = await env.DB.prepare('SELECT 1 AS ready').first<{ ready: number }>();
    if (probe?.ready !== 1) database = 'unreachable';
  } catch {
    database = 'unreachable';
  }

  const schema = database === 'ready' && (await schemaReady(env)) ? 'ready' : 'missing';
  const status = database === 'ready' && schema === 'ready' ? 'ready' : 'degraded';

  return ok({ status, database, schema, time: Date.now() });
};
