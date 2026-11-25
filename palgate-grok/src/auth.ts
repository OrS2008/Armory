/**
 * Owner authentication: password (PBKDF2) + mandatory TOTP second factor,
 * server-side sessions in an HttpOnly/Secure/SameSite=Strict cookie, per-IP and
 * global lockouts, single-use codes, and "sign out everywhere".
 */
import { hashPassword, randomToken, sha256, verifyPassword, verifyTotp, type PasswordHash } from './crypto';
import type { ClientMeta } from './http';
import { bump, count, getSealed, putSealed, type Env } from './store';

export interface AdminRecord {
  pw: PasswordHash;
  totp: string; // base32
  lastStep: number; // last TOTP step used (replay protection)
  epoch: number; // bump to invalidate every session
  createdAt: string;
}

const COOKIE = '__Host-gate_s';
export const SESSION_TTL = 12 * 3600;
const MAX_FAILS_PER_IP = 5; // per 15 min
const MAX_FAILS_GLOBAL = 30; // per hour, against distributed guessing

export const getAdmin = (env: Env) => getSealed<AdminRecord>(env, 'admin');
export const putAdmin = (env: Env, a: AdminRecord) => putSealed(env, 'admin', a);

export function validatePassword(pw: unknown): string | null {
  if (typeof pw !== 'string' || pw.length < 12) return 'הסיסמה חייבת להכיל לפחות 12 תווים';
  if (pw.length > 256) return 'סיסמה ארוכה מדי';
  return null;
}

// ------------------------------------------------------------ lockout

const hour = () => new Date().toISOString().slice(0, 13);

export async function lockedOut(env: Env, m: ClientMeta): Promise<boolean> {
  const [ip, global] = await Promise.all([count(env, `lf:${m.ip}`), count(env, `lfg:${hour()}`)]);
  return ip >= MAX_FAILS_PER_IP || global >= MAX_FAILS_GLOBAL;
}

export async function recordFailure(env: Env, m: ClientMeta) {
  await Promise.all([bump(env, `lf:${m.ip}`, 900), bump(env, `lfg:${hour()}`, 3600)]);
}

// ------------------------------------------------------------ login

export type LoginResult = { ok: true; admin: AdminRecord } | { ok: false; message: string };

export async function checkCredentials(env: Env, password: unknown, code: unknown): Promise<LoginResult> {
  const admin = await getAdmin(env);
  if (!admin) return { ok: false, message: 'not set up' };
  const pwOk = typeof password === 'string' && (await verifyPassword(password, admin.pw));
  const step = await verifyTotp(admin.totp, String(code ?? ''), admin.lastStep);
  if (!pwOk || step === null) return { ok: false, message: 'סיסמה או קוד אימות שגויים' };
  admin.lastStep = step;
  await putAdmin(env, admin);
  return { ok: true, admin };
}

// ------------------------------------------------------------ sessions

interface SessionRecord {
  epoch: number;
  ip: string;
  country: string;
  ua: string;
  created: string;
}

export async function createSession(env: Env, admin: AdminRecord, m: ClientMeta): Promise<string> {
  const token = randomToken(32);
  const rec: SessionRecord = { epoch: admin.epoch, ip: m.ip, country: m.country, ua: m.ua, created: new Date().toISOString() };
  await putSealed(env, `as:${await sha256(token)}`, rec, SESSION_TTL);
  return `${COOKIE}=${token}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${SESSION_TTL}`;
}

export const clearCookie = `${COOKIE}=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0`;

function readCookie(req: Request): string | null {
  const m = (req.headers.get('cookie') ?? '').match(new RegExp(`(?:^|;\\s*)${COOKIE}=([A-Za-z0-9_-]{20,})`));
  return m?.[1] ?? null;
}

export async function currentSession(req: Request, env: Env): Promise<AdminRecord | null> {
  const token = readCookie(req);
  if (!token) return null;
  const [rec, admin] = await Promise.all([getSealed<SessionRecord>(env, `as:${await sha256(token)}`), getAdmin(env)]);
  if (!rec || !admin || rec.epoch !== admin.epoch) return null;
  return admin;
}

export async function destroySession(req: Request, env: Env) {
  const token = readCookie(req);
  if (token) await env.GATE.delete(`as:${await sha256(token)}`);
}

/**
 * CSRF defence for every state-changing admin request: the browser must say the
 * request comes from this very origin, and must carry a custom header, which a
 * cross-site page cannot add without a CORS preflight we never approve.
 * (The SameSite=Strict cookie is a third, independent layer.)
 */
export function sameOrigin(req: Request, url: URL): boolean {
  return req.headers.get('origin') === url.origin && req.headers.get('x-gate-csrf') === '1';
}
