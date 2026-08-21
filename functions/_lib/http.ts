/** Request/response plumbing shared by every Pages Function. */
import type { ZodType } from 'zod';
import { ErrorCodes } from '../../shared/errors';
import { errorMessage } from '../../shared/messages.he';

export interface Env {
  DB: D1Database;
  BOOTSTRAP_ADMIN_EMAIL?: string;
  BOOTSTRAP_ADMIN_PASSWORD?: string;
  SESSION_TTL_HOURS?: string;
  PBKDF2_ITERATIONS?: string;
}

export const jsonResponse = (body: unknown, status = 200, headers: HeadersInit = {}) =>
  Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store', ...headers },
  });

export const ok = (data: unknown, headers: HeadersInit = {}) =>
  jsonResponse({ ok: true, data }, 200, headers);

/**
 * Every failure carries a machine-readable code plus a Hebrew message, so the
 * client can localise without parsing prose (plan section 28).
 */
export const fail = (
  status: number,
  code: string,
  details?: Record<string, unknown>,
  message?: string,
) =>
  jsonResponse(
    {
      ok: false,
      error: { code, message: message ?? errorMessage(code), ...(details ? { details } : {}) },
    },
    status,
  );

export const notFound = () => fail(404, ErrorCodes.NOT_FOUND);
export const methodNotAllowed = () => fail(405, ErrorCodes.NOT_FOUND);

export const newId = (prefix: string) => `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;
export const now = () => Date.now();

/** Rejects cross-site mutations; pairs with the SameSite=Strict session cookie. */
export function checkOrigin(request: Request): Response | null {
  if (request.method === 'GET' || request.method === 'HEAD') return null;
  const origin = request.headers.get('Origin');
  if (!origin) return null;
  try {
    if (new URL(origin).host !== new URL(request.url).host) {
      return fail(403, ErrorCodes.FORBIDDEN);
    }
  } catch {
    return fail(403, ErrorCodes.FORBIDDEN);
  }
  return null;
}

/** Parse and validate a JSON body. Returns a Response on any failure. */
export async function readBody<T>(request: Request, schema: ZodType<T>): Promise<T | Response> {
  if (!request.headers.get('content-type')?.includes('application/json')) {
    return fail(415, ErrorCodes.JSON_REQUIRED);
  }
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return fail(400, ErrorCodes.INVALID_JSON);
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const path = issue.path.join('.') || '_';
      fields[path] ??= issue.message;
    }
    return fail(422, ErrorCodes.VALIDATION_FAILED, { fields });
  }
  return parsed.data;
}

export function searchParams(request: Request): URLSearchParams {
  return new URL(request.url).searchParams;
}

export function intParam(params: URLSearchParams, key: string, fallback: number): number {
  const raw = params.get(key);
  if (raw === null) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

export function clampLimit(value: number, max = 500): number {
  return Math.min(Math.max(Math.trunc(value), 1), max);
}

export const hex = (buffer: ArrayBuffer): string =>
  [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');

export const randomHex = (bytes = 32): string =>
  hex(crypto.getRandomValues(new Uint8Array(bytes)).buffer);

export async function sha256(value: string): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
}

/** Length-independent comparison for secrets. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) {
    diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return diff === 0;
}
