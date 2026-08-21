/** Typed client for the Pages Functions API. */
import { transportErrorMessage } from '@shared/messages.he';

const BASE: string = import.meta.env.VITE_API_BASE ?? '/api/v1';

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: Record<string, unknown>;

  constructor(status: number, code: string, message: string, details: Record<string, unknown>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  /** Field-level validation messages keyed by form field name. */
  get fieldErrors(): Record<string, string> {
    const fields = this.details.fields;
    return fields && typeof fields === 'object' ? (fields as Record<string, string>) : {};
  }
}

interface Envelope<T> {
  ok: boolean;
  data?: T;
  error?: { code: string; message: string; details?: Record<string, unknown> };
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, {
      credentials: 'same-origin',
      ...init,
      headers: {
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
    });
  } catch {
    throw new ApiError(0, 'NETWORK', transportErrorMessage(0), {});
  }

  let payload: Envelope<T> | null;
  try {
    payload = (await response.json()) as Envelope<T>;
  } catch {
    payload = null;
  }

  if (!response.ok || !payload?.ok) {
    const error = payload?.error;
    // No envelope means the response never came from the application: a
    // platform error page, a killed worker, a proxy. Say which, with the code.
    if (!error) {
      throw new ApiError(response.status, 'TRANSPORT', transportErrorMessage(response.status), {});
    }
    throw new ApiError(response.status, error.code, error.message, error.details ?? {});
  }

  return payload.data as T;
}

const withQuery = (path: string, query?: Record<string, string | number | undefined>) => {
  if (!query) return path;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  const serialized = params.toString();
  return serialized ? `${path}?${serialized}` : path;
};

export const api = {
  get: <T>(path: string, query?: Record<string, string | number | undefined>) =>
    request<T>(withQuery(path, query)),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'POST',
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
