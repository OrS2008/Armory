import { ErrorCodes } from '../shared/errors';
import { fail, type Env } from './_lib/http';

/**
 * The one place an unhandled exception becomes an answer.
 *
 * Without this, anything that throws inside a Pages Function — a constraint
 * the code did not expect, a column a migration has not added yet — leaves
 * Cloudflare to return a bare 500 with an HTML body. The client cannot parse
 * that, so every distinct failure arrives on screen as the same sentence:
 * "the server returned an unexpected response". Adding a user failed that way
 * for days, and neither the person doing it nor the log could say why.
 *
 * The reason is included in the response rather than kept back. It is a
 * judgement: a database error names a table or a column, which is a fact about
 * the schema and not about anybody's data, and the alternative — as we have
 * just spent an afternoon proving — is an operator who cannot act and a
 * maintainer who cannot diagnose. It is truncated, and the full error goes to
 * the log where a stack trace belongs.
 */
export const onRequest: PagesFunction<Env> = async (context) => {
  try {
    return await context.next();
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error(
      'Unhandled error',
      context.request.method,
      new URL(context.request.url).pathname,
      error,
    );
    return fail(500, ErrorCodes.INTERNAL, { reason: reason.slice(0, 200) });
  }
};
