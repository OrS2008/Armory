/**
 * Owner authentication: passkeys only (see passkeys.ts), server-side sessions in
 * an HttpOnly/Secure/SameSite=Strict cookie, per-IP and global lockouts, and
 * "sign out everywhere". There is no password to phish, guess or leak.
 */
import { randomToken, sha256 } from './crypto';
import type { ClientMeta } from './http';
import type { Passkey } from './passkeys';
import { bump, count, getSealed, putSealed, type Env } from './store';

export interface AdminRecord {
  userId: string; // WebAuthn user handle, base64url
  passkeys: Passkey[];
  epoch: number; // bump to invalidate every session
  createdAt: string;
}

const COOKIE = '__Host-gate_s';
export const DEVICE_COOKIE = '__Host-gate_d';
export const PAIR_COOKIE = '__Host-gate_p';
export const SESSION_TTL = 12 * 3600;
const MAX_FAILS_PER_IP = 5; // per 15 min
const MAX_FAILS_GLOBAL = 30; // per hour, against distributed guessing

export async function getAdmin(env: Env): Promise<AdminRecord | null> {
  const a = await getSealed<AdminRecord>(env, 'admin');
  return a && Array.isArray(a.passkeys) ? a : null; // ignores records from the password era
}
export const putAdmin = (env: Env, a: AdminRecord) => putSealed(env, 'admin', a);

// ------------------------------------------------------------ lockout

const hour = () => new Date().toISOString().slice(0, 13);

/** Seconds until this IP may try again, or 0 if it may try now. */
export async function lockedOut(env: Env, m: ClientMeta): Promise<number> {
  const [until, global] = await Promise.all([env.GATE.get(`lock:${m.ip}`), count(env, `lfg:${hour()}`)]);
  const left = Math.ceil((Number(until) - Date.now()) / 1000);
  if (left > 0) return left;
  if (global >= MAX_FAILS_GLOBAL) return 3600 - Math.floor((Date.now() / 1000) % 3600);
  return 0;
}

/** Records a failure; returns the lockout in seconds if this one triggered it. */
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

export function readCookie(req: Request, name = COOKIE): string | null {
  const m = (req.headers.get('cookie') ?? '').match(new RegExp(`(?:^|;\\s*)${name}=([A-Za-z0-9_-]{20,64})(?:;|$)`));
  return m?.[1] ?? null;
}

export const cookie = (name: string, value: string, maxAge: number) =>
  `${name}=${value}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${maxAge}`;

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
