/**
 * Small, dependency-free crypto helpers on top of WebCrypto:
 *  - AES-256-GCM sealing of everything sensitive stored in KV (key = ENC_KEY secret)
 *  - random tokens, hashing and constant-time comparison
 */

const te = new TextEncoder();
const td = new TextDecoder();

export function b64u(b: Uint8Array): string {
  let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function unb64u(s: string): Uint8Array<ArrayBuffer> {
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
