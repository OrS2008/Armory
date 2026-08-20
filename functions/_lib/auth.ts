/** Password hashing, sessions and permission checks. */
import { ErrorCodes } from '../../shared/errors';
import { permissionsForRole, unitInScope, type Permission } from '../../shared/rbac';
import type { Role, SessionUser } from '../../shared/types';
import { fail, hex, newId, now, randomHex, sha256, timingSafeEqual, type Env } from './http';

const COOKIE_NAME = 'shabatzak_session';
const PBKDF2_ITERATIONS = 210_000;
const DEFAULT_TTL_HOURS = 12;
const MAX_FAILED_ATTEMPTS = 8;
const ATTEMPT_WINDOW_MS = 15 * 60_000;

export async function hashPassword(
  password: string,
  salt: string,
  iterations = PBKDF2_ITERATIONS,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: new TextEncoder().encode(salt),
      iterations,
      hash: 'SHA-256',
    },
    key,
    256,
  );
  return hex(bits);
}

export async function verifyPassword(
  password: string,
  salt: string,
  iterations: number,
  expectedHash: string,
): Promise<boolean> {
  return timingSafeEqual(await hashPassword(password, salt, iterations), expectedHash);
}

export function newSalt(): string {
  return randomHex(16);
}

export const passwordIterations = PBKDF2_ITERATIONS;

export function sessionCookie(value: string, maxAgeSeconds: number): string {
  return `${COOKIE_NAME}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAgeSeconds}`;
}

export function clearedSessionCookie(): string {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

export function sessionTtlMs(env: Env): number {
  const hours = Number(env.SESSION_TTL_HOURS ?? DEFAULT_TTL_HOURS);
  return (Number.isFinite(hours) && hours > 0 ? hours : DEFAULT_TTL_HOURS) * 3_600_000;
}

export function readCookie(request: Request, name = COOKIE_NAME): string | null {
  const part = request.headers
    .get('Cookie')
    ?.split(';')
    .map((chunk) => chunk.trim())
    .find((chunk) => chunk.startsWith(`${name}=`));
  return part ? decodeURIComponent(part.slice(name.length + 1)) : null;
}

interface UserRow {
  id: string;
  email: string;
  display_name: string;
  role: Role;
  personnel_id: string | null;
  mfa_enabled: number;
}

export async function createSession(
  env: Env,
  userId: string,
  clientLabel: string | null,
): Promise<{ raw: string; expiresAt: number }> {
  const raw = randomHex(32);
  const timestamp = now();
  const expiresAt = timestamp + sessionTtlMs(env);
  await env.DB.prepare(
    `INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at, last_seen_at, client_label)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(newId('ses'), userId, await sha256(raw), expiresAt, timestamp, timestamp, clientLabel)
    .run();
  return { raw, expiresAt };
}

export async function revokeSession(env: Env, rawToken: string): Promise<void> {
  await env.DB.prepare('UPDATE sessions SET revoked_at = ? WHERE token_hash = ?')
    .bind(now(), await sha256(rawToken))
    .run();
}

export async function loadSessionUser(request: Request, env: Env): Promise<SessionUser | null> {
  const raw = readCookie(request);
  if (!raw) return null;
  const row = await env.DB.prepare(
    `SELECT u.id, u.email, u.display_name, u.role, u.personnel_id, u.mfa_enabled
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires_at > ? AND s.revoked_at IS NULL AND u.active = 1`,
  )
    .bind(await sha256(raw), now())
    .first<UserRow>();
  if (!row) return null;

  const scopes = await env.DB.prepare('SELECT unit_id FROM user_scopes WHERE user_id = ?')
    .bind(row.id)
    .all<{ unit_id: string }>();

  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    personnelId: row.personnel_id,
    unitScope: (scopes.results ?? []).map((scope) => scope.unit_id),
    permissions: permissionsForRole(row.role),
    mfaEnabled: row.mfa_enabled === 1,
  };
}

/** Authenticate, then authorise. Returns a Response when either fails. */
export async function requireUser(
  request: Request,
  env: Env,
  permission?: Permission,
): Promise<SessionUser | Response> {
  const user = await loadSessionUser(request, env);
  if (!user) {
    return fail(401, readCookie(request) ? ErrorCodes.SESSION_EXPIRED : ErrorCodes.AUTH_REQUIRED);
  }
  if (permission && !user.permissions.includes(permission)) {
    return fail(403, ErrorCodes.FORBIDDEN);
  }
  void touchSession(request, env);
  return user;
}

async function touchSession(request: Request, env: Env): Promise<void> {
  const raw = readCookie(request);
  if (!raw) return;
  await env.DB.prepare('UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?')
    .bind(now(), await sha256(raw))
    .run();
}

/** Unit ancestry, used for organisational scope checks. */
export async function unitParents(env: Env): Promise<Map<string, string | null>> {
  const rows = await env.DB.prepare('SELECT id, parent_id FROM units').all<{
    id: string;
    parent_id: string | null;
  }>();
  return new Map((rows.results ?? []).map((row) => [row.id, row.parent_id]));
}

export async function requireScope(
  env: Env,
  user: SessionUser,
  unitId: string | null,
): Promise<Response | null> {
  if (user.unitScope.length === 0) return null;
  const parents = await unitParents(env);
  return unitInScope(user.unitScope, unitId, parents) ? null : fail(403, ErrorCodes.OUT_OF_SCOPE);
}

/** Simple database-backed brute-force guard on the login endpoint. */
export async function loginThrottled(env: Env, email: string): Promise<boolean> {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS failures FROM login_attempts
      WHERE email = ? AND success = 0 AND created_at > ?`,
  )
    .bind(email, now() - ATTEMPT_WINDOW_MS)
    .first<{ failures: number }>();
  return (row?.failures ?? 0) >= MAX_FAILED_ATTEMPTS;
}

export async function recordLoginAttempt(env: Env, email: string, success: boolean): Promise<void> {
  await env.DB.batch([
    env.DB.prepare(
      'INSERT INTO login_attempts (id, email, success, created_at) VALUES (?, ?, ?, ?)',
    ).bind(newId('att'), email, success ? 1 : 0, now()),
    env.DB.prepare('DELETE FROM login_attempts WHERE created_at < ?').bind(now() - 24 * 3_600_000),
  ]);
}
