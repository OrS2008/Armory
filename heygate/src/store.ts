/**
 * Storage, multi-tenant.
 *
 * Isolation model — every customer ("tenant") is a random id:
 *  - All of a tenant's data lives under `t:<id>:…` and is sealed with a key
 *    derived for that tenant alone (HKDF from ENC_KEY). Even a bug that read
 *    another tenant's slot would hold ciphertext it cannot open: the slot name
 *    is the AAD and the key differs.
 *  - The tenant id is never taken from a request. It comes only from a server
 *    session, a passkey credential, a device cookie or a link secret — each
 *    resolved through a global index that stores *hashes* only.
 *  - A `Tenant` handle is the only way to reach tenant data, so code cannot
 *    "forget" the prefix.
 */
import type { Session } from './palgate/api';
import { b64u, isSealed, open, randomToken, seal, sha256, unb64u } from './crypto';
import { defaultNames, type Lang } from './i18n';

export interface RateLimiter {
  limit(o: { key: string }): Promise<{ success: boolean }>;
}

export interface Env {
  GATE: KVNamespace;
  RL_PUBLIC?: RateLimiter;
  RL_ADMIN?: RateLimiter;
  RL_AUTH?: RateLimiter;
  /** Optional outer layer: Cloudflare Access in front of the super-admin panel. */
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  /** 32 random bytes, base64url. Master key; tenant keys are derived from it. */
  ENC_KEY?: string;
  /** One-time code that creates the super-admin account. Useless once set up. */
  SETUP_CODE?: string;
  /** Development only: a local PalGate stand-in (must be http://127.0.0.1:PORT/). */
  PALGATE_BASE?: string;
}

export interface Gate {
  alias: string;
  label: string;
  deviceId: string;
  output: number;
}

export type ChannelKind = 'grok' | 'car' | 'phone';

/**
 * One way of opening a tenant's gate, separately revocable.
 *  - grok:  a secret link (Grok can only "visit" URLs). Can require arming.
 *  - phone: a secret link for automations, POST only.
 *  - car:   a paired browser holding a device cookie; no secret in any URL.
 */
export interface Channel {
  id: string;
  kind: ChannelKind;
  name: string;
  secret: string;
  enabled: boolean;
  countries: string[];
  maxPerHour: number;
  createdAt: string;
  lastUsedAt?: string;
  requireArm?: boolean;
  armMinutes?: number;
  deviceHash?: string;
}

export interface Config {
  v: 2;
  enabled: boolean;
  gates: Gate[];
  channels: Channel[];
  cooldownSec: number;
  notifyUrl: string;
  lang?: Lang; // language of notifications
}

export interface LogEntry {
  at: string;
  kind: 'open' | 'denied' | 'admin';
  ok: boolean;
  gate?: string;
  channel?: string;
  ip?: string;
  country?: string;
  detail?: string;
}

export interface TenantMeta {
  id: string;
  createdAt: string;
  status: 'active' | 'blocked';
  lastActiveAt?: string;
}

export interface Tenant {
  env: Env;
  id: string;
  key: string;
}

export const TENANT_ID_RE = /^[A-Za-z0-9_-]{16}$/;

export function requireKey(env: Env): string {
  if (!env.ENC_KEY) throw new Error('ENC_KEY secret is not set');
  return env.ENC_KEY;
}

// ------------------------------------------------------------ keys

const derived = new Map<string, Promise<string>>();

/** HKDF-SHA256(master, info = "tenant:<id>") → this tenant's own AES-256 key. */
function tenantKey(env: Env, id: string): Promise<string> {
  const cacheKey = `${requireKey(env).slice(0, 8)}:${id}`;
  let k = derived.get(cacheKey);
  if (!k) {
    k = (async () => {
      const base = await crypto.subtle.importKey('raw', unb64u(requireKey(env)), 'HKDF', false, ['deriveBits']);
      const bits = await crypto.subtle.deriveBits(
        { name: 'HKDF', hash: 'SHA-256', salt: new TextEncoder().encode('heygate/v1'), info: new TextEncoder().encode(`tenant:${id}`) },
        base,
        256,
      );
      return b64u(new Uint8Array(bits));
    })();
    derived.set(cacheKey, k);
  }
  return k;
}

export async function tenant(env: Env, id: string): Promise<Tenant> {
  if (!TENANT_ID_RE.test(id)) throw new Error('bad tenant id');
  return { env, id, key: await tenantKey(env, id) };
}

// ------------------------------------------------------------ global (master-key) slots

export async function getSealed<T>(env: Env, slot: string): Promise<T | null> {
  const raw = await env.GATE.get<unknown>(slot, 'json');
  if (raw == null || !isSealed(raw)) return null;
  return open<T>(requireKey(env), slot, raw);
}

export async function putSealed(env: Env, slot: string, value: unknown, ttl?: number) {
  const body = JSON.stringify(await seal(requireKey(env), slot, value));
  await env.GATE.put(slot, body, ttl ? { expirationTtl: ttl } : undefined);
}

// ------------------------------------------------------------ tenant slots

const tk = (t: Tenant, slot: string) => `t:${t.id}:${slot}`;

export async function tGet<T>(t: Tenant, slot: string): Promise<T | null> {
  const k = tk(t, slot);
  const raw = await t.env.GATE.get<unknown>(k, 'json');
  if (raw == null || !isSealed(raw)) return null;
  return open<T>(t.key, k, raw);
}

export async function tPut(t: Tenant, slot: string, value: unknown, ttl?: number) {
  const k = tk(t, slot);
  await t.env.GATE.put(k, JSON.stringify(await seal(t.key, k, value)), ttl ? { expirationTtl: ttl } : undefined);
}

/** Raw (unsealed) per-tenant values: counters and timestamps only. */
export const tRaw = {
  get: (t: Tenant, slot: string) => t.env.GATE.get(tk(t, slot)),
  put: (t: Tenant, slot: string, v: string, ttl?: number) => t.env.GATE.put(tk(t, slot), v, ttl ? { expirationTtl: Math.max(60, ttl) } : undefined),
  del: (t: Tenant, slot: string) => t.env.GATE.delete(tk(t, slot)),
};

export const getSession = (t: Tenant) => tGet<Session>(t, 'session');
export const putSession = (t: Tenant, s: Session) => tPut(t, 'session', s);

export function newChannel(kind: ChannelKind, name?: string, lang: Lang = 'he'): Channel {
  const names = defaultNames[lang];
  return {
    id: randomToken(6),
    kind,
    name: (name ?? names[kind]).slice(0, 40),
    secret: kind === 'car' ? '' : randomToken(24), // 192 bits
    enabled: true,
    countries: kind === 'grok' ? [] : ['IL'],
    maxPerHour: 20,
    createdAt: new Date().toISOString(),
    ...(kind === 'grok' ? { requireArm: false, armMinutes: 10 } : {}),
  };
}

export const freshConfig = (lang: Lang = 'he'): Config => ({
  v: 2,
  enabled: true,
  gates: [],
  channels: [newChannel('grok', undefined, lang), newChannel('phone', undefined, lang)],
  cooldownSec: 8,
  notifyUrl: '',
  lang,
});

export async function getConfig(t: Tenant): Promise<Config> {
  return (await tGet<Config>(t, 'config')) ?? freshConfig();
}
export const putConfig = (t: Tenant, cfg: Config) => tPut(t, 'config', cfg);

export async function getLog(t: Tenant): Promise<LogEntry[]> {
  return (await tGet<LogEntry[]>(t, 'log')) ?? [];
}

export async function addLog(t: Tenant, entry: Omit<LogEntry, 'at'>) {
  try {
    const log = await getLog(t);
    log.unshift({ at: new Date().toISOString(), ...entry });
    await tPut(t, 'log', log.slice(0, 300));
  } catch (e) {
    console.error('audit log write failed', e);
  }
}

// ------------------------------------------------------------ hash-only indexes

export interface IndexEntry {
  tid: string;
  ch?: string;
}

export type IndexKind = 'sec' | 'dev' | 'cred' | 'rec' | 'user';

/** Index keys hold a SHA-256 of the credential, never the credential itself. */
const ixKey = async (kind: IndexKind, value: string, hashed = false) => `ix:${kind}:${hashed ? value : await sha256(value)}`;

export async function ixPut(env: Env, kind: IndexKind, value: string, entry: IndexEntry, hashed = false) {
  const k = await ixKey(kind, value, hashed);
  await putSealed(env, k, entry);
}
export async function ixGet(env: Env, kind: IndexKind, value: string, hashed = false): Promise<IndexEntry | null> {
  const k = await ixKey(kind, value, hashed);
  const e = await getSealed<IndexEntry>(env, k);
  return e && TENANT_ID_RE.test(e.tid) ? e : null;
}
export async function ixDel(env: Env, kind: IndexKind, value: string, hashed = false) {
  await env.GATE.delete(await ixKey(kind, value, hashed));
}

/** Keeps the link/device indexes in step with a channel. */
export async function indexChannel(t: Tenant, c: Channel) {
  if (c.kind === 'car' && c.deviceHash) await ixPut(t.env, 'dev', c.deviceHash, { tid: t.id, ch: c.id }, true);
  if (c.kind !== 'car' && c.secret) await ixPut(t.env, 'sec', c.secret, { tid: t.id, ch: c.id });
}
export async function unindexChannel(t: Tenant, c: Channel) {
  if (c.deviceHash) await ixDel(t.env, 'dev', c.deviceHash, true);
  if (c.secret) await ixDel(t.env, 'sec', c.secret);
}

// ------------------------------------------------------------ tenant registry

export const getMeta = (env: Env, id: string) => getSealed<TenantMeta>(env, `tn:${id}`);
export const putMeta = (env: Env, m: TenantMeta) => putSealed(env, `tn:${m.id}`, m);

export async function listTenants(env: Env): Promise<TenantMeta[]> {
  const out: TenantMeta[] = [];
  let cursor: string | undefined;
  do {
    const page = await env.GATE.list({ prefix: 'tn:', cursor });
    for (const k of page.keys) {
      const m = await getSealed<TenantMeta>(env, k.name);
      if (m) out.push(m);
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Marks activity at most once a day (KV writes are a budget). */
export async function touch(env: Env, id: string) {
  const m = await getMeta(env, id);
  const today = new Date().toISOString().slice(0, 10);
  if (m && m.lastActiveAt?.slice(0, 10) !== today) await putMeta(env, { ...m, lastActiveAt: new Date().toISOString() });
}

/** Removes every trace of a tenant: its slots, its indexes, its registry entry. */
export async function deleteTenant(t: Tenant, credIds: string[], recoveryHash?: string, username?: string) {
  const cfg = await getConfig(t);
  if (username) await ixDel(t.env, 'user', username);
  for (const c of cfg.channels) await unindexChannel(t, c);
  for (const id of credIds) await ixDel(t.env, 'cred', id);
  if (recoveryHash) await ixDel(t.env, 'rec', recoveryHash, true);
  // Collect first, then delete: deleting while paging can skip keys.
  const names: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await t.env.GATE.list({ prefix: `t:${t.id}:`, cursor });
    names.push(...page.keys.map((k) => k.name));
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  for (const n of names) await t.env.GATE.delete(n);
  await t.env.GATE.delete(`tn:${t.id}`);
}

// ------------------------------------------------------------ counters (global)

export async function bump(env: Env, key: string, ttl: number): Promise<number> {
  const n = (Number(await env.GATE.get(key)) || 0) + 1;
  await env.GATE.put(key, String(n), { expirationTtl: Math.max(60, ttl) });
  return n;
}
export const count = async (env: Env, key: string) => Number(await env.GATE.get(key)) || 0;

/** Same, scoped to a tenant. */
export async function tBump(t: Tenant, slot: string, ttl: number): Promise<number> {
  const n = (Number(await tRaw.get(t, slot)) || 0) + 1;
  await tRaw.put(t, slot, String(n), ttl);
  return n;
}
export const tCount = async (t: Tenant, slot: string) => Number(await tRaw.get(t, slot)) || 0;

// ------------------------------------------------------------ platform settings (super admin)

export interface Platform {
  signupsOpen: boolean;
  maxSignupsPerDay: number;
}
export const getPlatform = async (env: Env): Promise<Platform> =>
  (await getSealed<Platform>(env, 'sa:platform')) ?? { signupsOpen: true, maxSignupsPerDay: 25 };
export const putPlatform = (env: Env, p: Platform) => putSealed(env, 'sa:platform', p);
