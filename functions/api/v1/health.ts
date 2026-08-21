import { hasAnyUser, schemaReady } from '../../_lib/data';
import { ok, type Env } from '../../_lib/http';

/**
 * Readiness probe. Reports the D1 binding and the schema separately, because
 * they fail separately: a binding can be perfectly wired to a database whose
 * migrations were never applied, and `SELECT 1` would still succeed.
 *
 * `bootstrap` reports whether the first administrator can still be created.
 * It exposes no value and no identifier, only which of three states the
 * deployment is in — enough to tell "nobody has signed in yet" apart from
 * "an account exists and its password does not match", which are
 * indistinguishable from the login screen and have opposite remedies.
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

  let bootstrap: 'complete' | 'pending' | 'not_configured' | 'unknown' = 'unknown';
  if (schema === 'ready') {
    if (await hasAnyUser(env)) {
      bootstrap = 'complete';
    } else {
      bootstrap =
        env.BOOTSTRAP_ADMIN_EMAIL && env.BOOTSTRAP_ADMIN_PASSWORD ? 'pending' : 'not_configured';
    }
  }

  const status = database === 'ready' && schema === 'ready' ? 'ready' : 'degraded';
  return ok({ status, database, schema, bootstrap, time: Date.now() });
};
