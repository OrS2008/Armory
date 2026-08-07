export interface Env {
  DB: D1Database;
  ADMIN_USERNAME?: string;
  ADMIN_PASSWORD?: string;
}
export type SessionUser = {
  id: string;
  username: string;
  displayName: string;
  role: 'admin' | 'editor' | 'viewer';
  permissions: string[];
};

export const json = (body: unknown, status = 200, headers: HeadersInit = {}) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
export const fail = (status: number, code: string, message: string) =>
  json({ ok: false, error: { code, message } }, status);
export const now = () => Date.now();
export const id = () => crypto.randomUUID();
export const sha256 = async (value: string) => {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
};
export const token = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
};
export const cookie = (request: Request, name: string) => {
  const part = request.headers
    .get('Cookie')
    ?.split(';')
    .map((x) => x.trim())
    .find((x) => x.startsWith(`${name}=`));
  return part ? decodeURIComponent(part.slice(name.length + 1)) : null;
};
export const sessionCookie = (value: string, maxAge = 43_200) =>
  `armory_session=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
export async function requireUser(
  request: Request,
  env: Env,
  permission?: string,
): Promise<SessionUser | Response> {
  const raw = cookie(request, 'armory_session');
  if (!raw) return fail(401, 'AUTH_REQUIRED', 'נדרשת התחברות');
  const hash = await sha256(raw);
  const row = await env.DB.prepare(
    `SELECT u.id,u.username,u.display_name,u.role,u.permissions FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.active=1`,
  )
    .bind(hash, now())
    .first<{
      id: string;
      username: string;
      display_name: string;
      role: SessionUser['role'];
      permissions: string;
    }>();
  if (!row) return fail(401, 'SESSION_EXPIRED', 'החיבור פג, התחברו מחדש');
  const permissions = JSON.parse(row.permissions) as string[];
  if (
    permission &&
    row.role !== 'admin' &&
    !permissions.includes('*') &&
    !permissions.includes(permission)
  )
    return fail(403, 'FORBIDDEN', 'אין הרשאה למסך זה');
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    permissions,
  };
}
export async function body(request: Request): Promise<Record<string, unknown> | Response> {
  if (!request.headers.get('content-type')?.includes('application/json'))
    return fail(415, 'JSON_REQUIRED', 'נדרש תוכן JSON');
  try {
    const value = await request.json();
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : fail(400, 'INVALID_BODY', 'תוכן הבקשה אינו תקין');
  } catch {
    return fail(400, 'INVALID_JSON', 'JSON אינו תקין');
  }
}
