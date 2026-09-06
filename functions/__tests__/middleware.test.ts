import { describe, expect, it, vi } from 'vitest';
import { onRequest } from '../_middleware';

/** Thrown by something that is not an Error, which a catch still has to answer. */
class NotAnError {
  toString() {
    return 'נפילה';
  }
}

interface Failure {
  ok?: boolean;
  error: { code: string; details: { reason: string } };
}

const json = async (response: Response): Promise<Failure> => response.json();

/** The shape `context.next()` is called through, with nothing else in it. */
const contextFor = (next: () => Promise<Response>) =>
  ({
    request: new Request('https://shabatzak.pages.dev/api/v1/users', { method: 'POST' }),
    next,
  }) as unknown as Parameters<typeof onRequest>[0];

describe('the API error boundary', () => {
  it('passes a normal answer through untouched', async () => {
    const answer = Response.json({ ok: true, data: { id: 'usr_1' } });
    const result = await onRequest(contextFor(() => Promise.resolve(answer)));
    expect(result).toBe(answer);
  });

  it('turns a thrown database error into an answer that names it', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await onRequest(
      contextFor(() =>
        Promise.reject(new Error('D1_ERROR: NOT NULL constraint failed: users.role')),
      ),
    );

    expect(result.status).toBe(500);
    const body = await json(result);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe('INTERNAL');
    // The whole point: the reason reaches the person who has to act on it.
    expect(body.error.details.reason).toContain('users.role');
  });

  it('survives something thrown that is not an Error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- the point of the case
    const result = await onRequest(contextFor(() => Promise.reject(new NotAnError())));
    const body = await json(result);
    expect(body.error.details.reason).toBe('נפילה');
  });

  it('does not let a runaway message become the response', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await onRequest(contextFor(() => Promise.reject(new Error('x'.repeat(5000)))));
    const body = await json(result);
    expect(body.error.details.reason.length).toBe(200);
  });
});
