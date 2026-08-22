/**
 * TOTP (RFC 6238) over HMAC-SHA1, the algorithm every authenticator app
 * implements. Verification is server-side only; nothing here is a secret the
 * browser needs.
 *
 * SHA-1 is not a security weakness in this construction — HMAC-SHA1 is not
 * affected by the collision attacks that retired SHA-1 for signatures — and it
 * is what Google Authenticator, Authy and 1Password actually accept.
 */
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const DIGITS = 6;
const STEP_SECONDS = 30;

export function randomBase32Secret(bytes = 20): string {
  const raw = new Uint8Array(bytes);
  crypto.getRandomValues(raw);
  return base32Encode(raw);
}

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

export function base32Decode(secret: string): Uint8Array {
  const cleaned = secret.replace(/[\s=-]/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of cleaned) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index < 0) throw new Error('invalid base32');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

async function hmacSha1(key: Uint8Array, message: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key as unknown as ArrayBuffer,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, message as unknown as ArrayBuffer);
  return new Uint8Array(signature);
}

/** The code for one 30-second step. */
export async function totpAt(secret: string, counter: number): Promise<string> {
  const key = base32Decode(secret);
  const message = new Uint8Array(8);
  let remaining = counter;
  for (let index = 7; index >= 0; index -= 1) {
    message[index] = remaining & 0xff;
    remaining = Math.floor(remaining / 256);
  }

  const digest = await hmacSha1(key, message);
  const offset = (digest[digest.length - 1] as number) & 0x0f;
  const binary =
    (((digest[offset] as number) & 0x7f) << 24) |
    (((digest[offset + 1] as number) & 0xff) << 16) |
    (((digest[offset + 2] as number) & 0xff) << 8) |
    ((digest[offset + 3] as number) & 0xff);
  return String(binary % 10 ** DIGITS).padStart(DIGITS, '0');
}

/**
 * Accepts the current code and one step either side: phone clocks drift, and a
 * code typed at second 29 arrives at second 31.
 */
export async function verifyTotp(
  secret: string,
  code: string,
  atMs = Date.now(),
): Promise<boolean> {
  const cleaned = code.replace(/\s/g, '');
  if (!/^\d{6}$/.test(cleaned)) return false;
  const counter = Math.floor(atMs / 1000 / STEP_SECONDS);
  for (const drift of [0, -1, 1]) {
    // Three HMACs at most, and the common case exits on the first.
    if ((await totpAt(secret, counter + drift)) === cleaned) return true;
  }
  return false;
}

/**
 * The URI an authenticator app expects, for a QR code or manual entry.
 *
 * The issuer is Latin on purpose: it is an identifier inside someone else's
 * app, and a Hebrew one turns the whole URI into percent-escapes that nobody
 * can check by eye and that not every authenticator handles.
 */
export function otpauthUri(secret: string, account: string, issuer = 'Shabatzak'): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: String(DIGITS),
    period: String(STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/** Grouped in fours, because someone is going to type this by hand. */
export function formatSecret(secret: string): string {
  return (secret.match(/.{1,4}/g) ?? []).join(' ');
}
