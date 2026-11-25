/**
 * Authentication for two roles, kept strictly apart:
 *  - tenant owners (each customer): passkeys + a one-time recovery code
 *  - the super admin (you): passkeys, separate records, cookie and challenges
 * Sessions are server-side, in HttpOnly/Secure/SameSite=Strict __Host- cookies.
 * A session record names its tenant; nothing in a request can change that.
 */
import { randomToken, sha256, type PasswordHash } from './crypto';
import type { ClientMeta } from './http';
import type { Passkey } from './passkeys';
import { bump, count, getMeta, getSealed, putSealed, tenant, tGet, tPut, TENANT_ID_RE, type Env, type Tenant } from './store';

export interface OwnerRecord {
  userId: string; // WebAuthn user handle, base64url
  passkeys: Passkey[];
  epoch: number; // bump to invalidate every session
  createdAt: string;
  recoveryHash?: string; // SHA-256 of the current recovery code
  username?: string; // lower-case; customers only
  pw?: PasswordHash; // optional: customers may sign in with username + password
}

export const USERNAME_RE = /^[a-z0-9._-]{3,32}$/;
export const normalizeUsername = (u: unknown) => (typeof u === 'string' ? u.trim().toLowerCase() : '');
export function passwordOk(pw: unknown, username: string): pw is string {
  return typeof pw === 'string' && pw.length >= 10 && pw.length <= 256 && pw.toLowerCase() !== username && !/^(.)\1+$/.test(pw);
}

export type Role = 'tenant' | 'sa';

export const COOKIES: Record<Role, string> = { tenant: '__Host-hg_s', sa: '__Host-hg_sa' };
export const DEVICE_COOKIE = '__Host-hg_d';
export const PAIR_COOKIE = '__Host-hg_p';
export const SESSION_TTL = 12 * 3600;
const MAX_FAILS_PER_IP = 5;
const MAX_FAILS_GLOBAL = 50;

export const getOwner = (t: Tenant) => tGet<OwnerRecord>(t, 'owner');
export const putOwner = (t: Tenant, o: OwnerRecord) => tPut(t, 'owner', o);
export const getSuper = (env: Env) => getSealed<OwnerRecord>(env, 'sa:admin');
export const putSuper = (env: Env, o: OwnerRecord) => putSealed(env, 'sa:admin', o);

// ------------------------------------------------------------ lockout (per IP, global)

const hour = () => new Date().toISOString().slice(0, 13);

export async function lockedOut(env: Env, m: ClientMeta): Promise<number> {
  const [until, global] = await Promise.all([env.GATE.get(`lock:${m.ip}`), count(env, `lfg:${hour()}`)]);
  const left = Math.ceil((Number(until) - Date.now()) / 1000);
  if (left > 0) return left;
  if (global >= MAX_FAILS_GLOBAL) return 3600 - Math.floor((Date.now() / 1000) % 3600);
  return 0;
}

export async function recordFailure(env: Env, m: ClientMeta): Promise<number> {
  const [n] = await Promise.all([bump(env, `lf:${m.ip}`, 900), bump(env, `lfg:${hour()}`, 3600)]);
  if (n >= MAX_FAILS_PER_IP) {
    await env.GATE.put(`lock:${m.ip}`, String(Date.now() + 900_000), { expirationTtl: 900 });
    await env.GATE.delete(`lf:${m.ip}`);
    return 900;
  }
  return 0;
}

// ------------------------------------------------------------ sessions

interface SessionRecord {
  role: Role;
  tid?: string;
  epoch: number;
  ip: string;
  country: string;
  created: string;
}

export async function createSession(env: Env, role: Role, owner: OwnerRecord, m: ClientMeta, tid?: string): Promise<string> {
  const token = randomToken(32);
  const rec: SessionRecord = { role, tid, epoch: owner.epoch, ip: m.ip, country: m.country, created: new Date().toISOString() };
  await putSealed(env, `as:${await sha256(token)}`, rec, SESSION_TTL);
  return cookie(COOKIES[role], token, SESSION_TTL);
}

export const clearCookie = (role: Role) => cookie(COOKIES[role], '', 0);

export function readCookie(req: Request, name: string): string | null {
  const m = (req.headers.get('cookie') ?? '').match(new RegExp(`(?:^|;\\s*)${name}=([A-Za-z0-9_-]{20,64})(?:;|$)`));
  return m?.[1] ?? null;
}

export const cookie = (name: string, value: string, maxAge: number) =>
  `${name}=${value}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${maxAge}`;

async function sessionRecord(req: Request, env: Env, role: Role): Promise<SessionRecord | null> {
  const token = readCookie(req, COOKIES[role]);
  if (!token) return null;
  const rec = await getSealed<SessionRecord>(env, `as:${await sha256(token)}`);
  return rec && rec.role === role ? rec : null;
}

/** The signed-in customer, or null. Blocked tenants have no valid sessions. */
export async function tenantSession(req: Request, env: Env): Promise<{ t: Tenant; owner: OwnerRecord } | null> {
  const rec = await sessionRecord(req, env, 'tenant');
  if (!rec?.tid || !TENANT_ID_RE.test(rec.tid)) return null;
  const [t, meta] = await Promise.all([tenant(env, rec.tid), getMeta(env, rec.tid)]);
  if (!meta || meta.status !== 'active') return null;
  const owner = await getOwner(t);
  if (!owner || owner.epoch !== rec.epoch) return null;
  return { t, owner };
}

export async function superSession(req: Request, env: Env): Promise<OwnerRecord | null> {
  const rec = await sessionRecord(req, env, 'sa');
  if (!rec) return null;
  const sa = await getSuper(env);
  return sa && sa.epoch === rec.epoch ? sa : null;
}

export async function destroySession(req: Request, env: Env, role: Role) {
  const token = readCookie(req, COOKIES[role]);
  if (token) await env.GATE.delete(`as:${await sha256(token)}`);
}

/**
 * CSRF defence for every state-changing request: same Origin, plus a custom
 * header a cross-site page cannot add without a CORS preflight we never approve.
 */
export function sameOrigin(req: Request, url: URL): boolean {
  return req.headers.get('origin') === url.origin && req.headers.get('x-gate-csrf') === '1';
}

/** A recovery code: 100 random bits, shown once, stored only as a hash. */
export function newRecoveryCode(): string {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const b = crypto.getRandomValues(new Uint8Array(20));
  const s = Array.from(b, (x) => A[x % 32]).join('');
  return s.match(/.{5}/g)!.join('-');
}
export const normalizeRecovery = (s: unknown) => (typeof s === 'string' ? s.toUpperCase().replace(/[^A-Z0-9]/g, '') : '');
