import type { Session } from './palgate/api';
import { isSealed, open, randomToken, seal } from './crypto';

export interface Env {
  GATE: KVNamespace;
  /** 32 random bytes, base64url. Encrypts everything sensitive in KV. */
  ENC_KEY?: string;
  /** One-time code that lets the owner create the admin account. Useless once set up. */
  SETUP_CODE?: string;
}

export interface Gate {
  alias: string; // url-safe, e.g. "home"
  label: string; // spoken / shown to the driver
  deviceId: string;
  output: number;
}

export type ChannelKind = 'grok' | 'car' | 'phone';

/**
 * A channel is one way of opening the gate, with its own secret link. Each one
 * can be disabled, rotated, country-restricted and rate-limited on its own, so
 * a link leaked from one place never forces you to redo the others.
 */
export interface Channel {
  id: string;
  kind: ChannelKind;
  name: string;
  secret: string;
  enabled: boolean;
  countries: string[]; // ISO codes; empty = anywhere
  maxPerHour: number;
  createdAt: string;
  lastUsedAt?: string;
}

export interface Config {
  v: 2;
  enabled: boolean; // master switch
  gates: Gate[];
  channels: Channel[];
  cooldownSec: number;
  notifyUrl: string; // e.g. https://ntfy.sh/<random-topic>; empty = off
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

export function requireKey(env: Env): string {
  if (!env.ENC_KEY) throw new Error('ENC_KEY secret is not set');
  return env.ENC_KEY;
}

async function getSealed<T>(env: Env, slot: string): Promise<T | null> {
  const raw = await env.GATE.get<unknown>(slot, 'json');
  if (raw == null) return null;
  if (!isSealed(raw)) return null;
  return open<T>(requireKey(env), slot, raw);
}

export async function putSealed(env: Env, slot: string, value: unknown, ttl?: number) {
  const body = JSON.stringify(await seal(requireKey(env), slot, value));
  await env.GATE.put(slot, body, ttl ? { expirationTtl: ttl } : undefined);
}
export { getSealed };

// ------------------------------------------------------------ PalGate session

export async function getSession(env: Env): Promise<Session | null> {
  const raw = await env.GATE.get<unknown>('session', 'json');
  if (raw == null) return null;
  if (isSealed(raw)) return open<Session>(requireKey(env), 'session', raw);
  // Migrate a plaintext session written by the first version.
  if (typeof raw === 'object' && 'phone' in raw) {
    await putSealed(env, 'session', raw);
    return raw as Session;
  }
  return null;
}

export const putSession = (env: Env, s: Session) => putSealed(env, 'session', s);

// ------------------------------------------------------------ config

export function newChannel(kind: ChannelKind, name?: string): Channel {
  const names: Record<ChannelKind, string> = { grok: 'Grok', car: 'מסך הרכב', phone: 'טלפון' };
  return {
    id: randomToken(6),
    kind,
    name: (name ?? names[kind]).slice(0, 40),
    secret: randomToken(24), // 192 bits
    enabled: true,
    // Grok fetches from xAI's servers, which may be anywhere; the car and the
    // phone are physically here.
    countries: kind === 'grok' ? [] : ['IL'],
    maxPerHour: 20,
    createdAt: new Date().toISOString(),
  };
}

export async function getConfig(env: Env): Promise<Config> {
  const cfg = await getSealed<Config>(env, 'config2');
  if (cfg) return cfg;
  const fresh: Config = {
    v: 2,
    enabled: true,
    gates: [],
    channels: [newChannel('grok'), newChannel('car'), newChannel('phone')],
    cooldownSec: 8,
    notifyUrl: '',
  };
  await putConfig(env, fresh);
  await env.GATE.delete('config'); // plaintext config from the first version
  return fresh;
}

export const putConfig = (env: Env, cfg: Config) => putSealed(env, 'config2', cfg);

// ------------------------------------------------------------ audit log

export async function getLog(env: Env): Promise<LogEntry[]> {
  return (await getSealed<LogEntry[]>(env, 'log')) ?? [];
}

export async function addLog(env: Env, entry: Omit<LogEntry, 'at'>) {
  const log = await getLog(env);
  log.unshift({ at: new Date().toISOString(), ...entry });
  await putSealed(env, 'log', log.slice(0, 200));
}

// ------------------------------------------------------------ counters

/** Increments a short-lived counter and returns the new value. */
export async function bump(env: Env, key: string, ttl: number): Promise<number> {
  const n = (Number(await env.GATE.get(key)) || 0) + 1;
  await env.GATE.put(key, String(n), { expirationTtl: Math.max(60, ttl) });
  return n;
}

export const count = async (env: Env, key: string) => Number(await env.GATE.get(key)) || 0;
