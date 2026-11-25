/**
 * Small, dependency-free crypto helpers on top of WebCrypto:
 *  - AES-256-GCM sealing of everything sensitive stored in KV (key = ENC_KEY secret)
 *  - PBKDF2-SHA256 password hashing
 *  - RFC 6238 TOTP (Google Authenticator / Authy / 1Password …)
 */

const te = new TextEncoder();
const td = new TextDecoder();

export function b64u(b: Uint8Array): string {
  let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function unb64u(s: string): Uint8Array {
  const std = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(std + '='.repeat((4 - (std.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export const randomBytes = (n: number) => crypto.getRandomValues(new Uint8Array(n));
export const randomToken = (n = 24) => b64u(randomBytes(n));

export async function sha256(s: string): Promise<string> {
  return b64u(new Uint8Array(await crypto.subtle.digest('SHA-256', te.encode(s))));
}

/** Constant-time string comparison (length is not secret here). */
export function safeEqual(a: string, b: string): boolean {
  const ea = te.encode(a);
  const eb = te.encode(b);
  let diff = ea.length ^ eb.length;
  for (let i = 0; i < Math.max(ea.length, eb.length); i++) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return diff === 0;
}

// ------------------------------------------------------------ sealing (AES-GCM)

export interface Sealed {
  v: 1;
  iv: string;
  ct: string;
}

const keyCache = new Map<string, Promise<CryptoKey>>();
function aesKey(secret: string): Promise<CryptoKey> {
  let k = keyCache.get(secret);
  if (!k) {
    const raw = unb64u(secret);
    if (raw.length !== 32) throw new Error('ENC_KEY must be 32 random bytes, base64url');
    k = crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
    keyCache.set(secret, k);
  }
  return k;
}

/** Encrypts `value` bound to `slot` (as AAD), so a blob can't be moved to another key. */
export async function seal(secret: string, slot: string, value: unknown): Promise<Sealed> {
  const iv = randomBytes(12);
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: te.encode(slot) },
    await aesKey(secret),
    te.encode(JSON.stringify(value)),
  );
  return { v: 1, iv: b64u(iv), ct: b64u(new Uint8Array(ct)) };
}

export async function open<T>(secret: string, slot: string, sealed: Sealed): Promise<T> {
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: unb64u(sealed.iv), additionalData: te.encode(slot) },
    await aesKey(secret),
    unb64u(sealed.ct),
  );
  return JSON.parse(td.decode(pt)) as T;
}

export const isSealed = (x: unknown): x is Sealed =>
  !!x && typeof x === 'object' && (x as Sealed).v === 1 && typeof (x as Sealed).ct === 'string';

// ------------------------------------------------------------ passwords

export interface PasswordHash {
  alg: 'pbkdf2-sha256';
  iter: number;
  salt: string;
  hash: string;
}

const PBKDF2_ITER = 100_000; // the maximum workerd allows

async function pbkdf2(password: string, salt: Uint8Array, iter: number) {
  const base = await crypto.subtle.importKey('raw', te.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, base, 256);
  return b64u(new Uint8Array(bits));
}

export async function hashPassword(password: string): Promise<PasswordHash> {
  const salt = randomBytes(16);
  return { alg: 'pbkdf2-sha256', iter: PBKDF2_ITER, salt: b64u(salt), hash: await pbkdf2(password, salt, PBKDF2_ITER) };
}

export async function verifyPassword(password: string, h: PasswordHash): Promise<boolean> {
  return safeEqual(await pbkdf2(password, unb64u(h.salt), h.iter), h.hash);
}

// ------------------------------------------------------------ TOTP

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32(b: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const x of b) {
    value = (value << 8) | x;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function unbase32(s: string): Uint8Array {
  const clean = s.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const c of clean) {
    value = (value << 5) | B32.indexOf(c);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Uint8Array.from(out);
}

export async function hotp(secret: Uint8Array, counter: number): Promise<string> {
  const msg = new Uint8Array(8);
  let c = counter;
  for (let i = 7; i >= 0; i--) {
    msg[i] = c & 0xff;
    c = Math.floor(c / 256);
  }
  const key = await crypto.subtle.importKey('raw', secret, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, msg));
  const off = mac[19]! & 0xf;
  const bin = ((mac[off]! & 0x7f) << 24) | (mac[off + 1]! << 16) | (mac[off + 2]! << 8) | mac[off + 3]!;
  return String(bin % 1_000_000).padStart(6, '0');
}

/**
 * Returns the matched time step, or null. Accepts ±1 step of clock drift and
 * refuses any step at or before `lastStep` (no code can be used twice).
 */
export async function verifyTotp(
  secretB32: string,
  code: string,
  lastStep = 0,
  now = Date.now(),
): Promise<number | null> {
  if (!/^\d{6}$/.test(code)) return null;
  const key = unbase32(secretB32);
  const step = Math.floor(now / 30_000);
  for (const s of [step - 1, step, step + 1]) {
    if (s <= lastStep) continue;
    if (safeEqual(await hotp(key, s), code)) return s;
  }
  return null;
}
