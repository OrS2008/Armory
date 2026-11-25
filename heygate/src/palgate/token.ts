/**
 * PalGate "derived token" (the X-Bt-Token header) generator.
 *
 * Ported from pylgate (https://github.com/DonutByte/pylgate, GPLv3), which
 * reverse-engineered the PalGate app. The derived token is valid for roughly
 * five seconds, so a fresh one is made for every request.
 *
 * The token is built from two AES-128 single-block operations:
 *   1. key  = AES-decrypt(sessionToken, T_C_KEY with the phone number spliced in)
 *   2. body = AES-encrypt(block holding 0x0A0A and the unix timestamp, key)
 * pylgate's own AES routine names these the other way round; the maths is
 * standard AES (verified against node:crypto in test/token.test.ts).
 */

export enum TokenType {
  SMS = 0,
  PRIMARY = 1, // first linked device
  SECONDARY = 2, // second linked device
}

const S_BOX = new Uint8Array([
  0x63, 0x7c, 0x77, 0x7b, 0xf2, 0x6b, 0x6f, 0xc5, 0x30, 0x01, 0x67, 0x2b, 0xfe, 0xd7, 0xab, 0x76,
  0xca, 0x82, 0xc9, 0x7d, 0xfa, 0x59, 0x47, 0xf0, 0xad, 0xd4, 0xa2, 0xaf, 0x9c, 0xa4, 0x72, 0xc0,
  0xb7, 0xfd, 0x93, 0x26, 0x36, 0x3f, 0xf7, 0xcc, 0x34, 0xa5, 0xe5, 0xf1, 0x71, 0xd8, 0x31, 0x15,
  0x04, 0xc7, 0x23, 0xc3, 0x18, 0x96, 0x05, 0x9a, 0x07, 0x12, 0x80, 0xe2, 0xeb, 0x27, 0xb2, 0x75,
  0x09, 0x83, 0x2c, 0x1a, 0x1b, 0x6e, 0x5a, 0xa0, 0x52, 0x3b, 0xd6, 0xb3, 0x29, 0xe3, 0x2f, 0x84,
  0x53, 0xd1, 0x00, 0xed, 0x20, 0xfc, 0xb1, 0x5b, 0x6a, 0xcb, 0xbe, 0x39, 0x4a, 0x4c, 0x58, 0xcf,
  0xd0, 0xef, 0xaa, 0xfb, 0x43, 0x4d, 0x33, 0x85, 0x45, 0xf9, 0x02, 0x7f, 0x50, 0x3c, 0x9f, 0xa8,
  0x51, 0xa3, 0x40, 0x8f, 0x92, 0x9d, 0x38, 0xf5, 0xbc, 0xb6, 0xda, 0x21, 0x10, 0xff, 0xf3, 0xd2,
  0xcd, 0x0c, 0x13, 0xec, 0x5f, 0x97, 0x44, 0x17, 0xc4, 0xa7, 0x7e, 0x3d, 0x64, 0x5d, 0x19, 0x73,
  0x60, 0x81, 0x4f, 0xdc, 0x22, 0x2a, 0x90, 0x88, 0x46, 0xee, 0xb8, 0x14, 0xde, 0x5e, 0x0b, 0xdb,
  0xe0, 0x32, 0x3a, 0x0a, 0x49, 0x06, 0x24, 0x5c, 0xc2, 0xd3, 0xac, 0x62, 0x91, 0x95, 0xe4, 0x79,
  0xe7, 0xc8, 0x37, 0x6d, 0x8d, 0xd5, 0x4e, 0xa9, 0x6c, 0x56, 0xf4, 0xea, 0x65, 0x7a, 0xae, 0x08,
  0xba, 0x78, 0x25, 0x2e, 0x1c, 0xa6, 0xb4, 0xc6, 0xe8, 0xdd, 0x74, 0x1f, 0x4b, 0xbd, 0x8b, 0x8a,
  0x70, 0x3e, 0xb5, 0x66, 0x48, 0x03, 0xf6, 0x0e, 0x61, 0x35, 0x57, 0xb9, 0x86, 0xc1, 0x1d, 0x9e,
  0xe1, 0xf8, 0x98, 0x11, 0x69, 0xd9, 0x8e, 0x94, 0x9b, 0x1e, 0x87, 0xe9, 0xce, 0x55, 0x28, 0xdf,
  0x8c, 0xa1, 0x89, 0x0d, 0xbf, 0xe6, 0x42, 0x68, 0x41, 0x99, 0x2d, 0x0f, 0xb0, 0x54, 0xbb, 0x16,
]);

const INV_S_BOX = new Uint8Array(256);
for (let i = 0; i < 256; i++) INV_S_BOX[S_BOX[i]!] = i;

const RCON = [0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1b, 0x36];

const T_C_KEY = [0xfa, 0xd3, 0x25, 0x72, 0x81, 0x29, 0, 0, 0, 0, 0, 0, 0x3a, 0xb4, 0x5a, 0x65];

const mul2 = (v: number) => ((v << 1) ^ (v & 0x80 ? 0x1b : 0)) & 0xff;

function expandKey(key: Uint8Array): Uint8Array[] {
  const rounds: Uint8Array[] = [key.slice()];
  for (let r = 0; r < 10; r++) {
    const p = rounds[r]!;
    const k = new Uint8Array(16);
    k[0] = S_BOX[p[13]!]! ^ p[0]! ^ RCON[r]!;
    k[1] = S_BOX[p[14]!]! ^ p[1]!;
    k[2] = S_BOX[p[15]!]! ^ p[2]!;
    k[3] = S_BOX[p[12]!]! ^ p[3]!;
    for (let i = 4; i < 16; i++) k[i] = k[i - 4]! ^ p[i]!;
    rounds.push(k);
  }
  return rounds;
}

const addRoundKey = (s: Uint8Array, k: Uint8Array) => {
  for (let i = 0; i < 16; i++) s[i]! ^= k[i]!;
};

// Column-major AES state: byte index = 4*column + row.
const SHIFT = [0, 5, 10, 15, 4, 9, 14, 3, 8, 13, 2, 7, 12, 1, 6, 11];
const INV_SHIFT = [0, 13, 10, 7, 4, 1, 14, 11, 8, 5, 2, 15, 12, 9, 6, 3];

function mixColumns(s: Uint8Array) {
  for (let c = 0; c < 4; c++) {
    const i = c * 4;
    const [a0, a1, a2, a3] = [s[i]!, s[i + 1]!, s[i + 2]!, s[i + 3]!];
    const t = a0 ^ a1 ^ a2 ^ a3;
    s[i] = a0 ^ t ^ mul2(a0 ^ a1);
    s[i + 1] = a1 ^ t ^ mul2(a1 ^ a2);
    s[i + 2] = a2 ^ t ^ mul2(a2 ^ a3);
    s[i + 3] = a3 ^ t ^ mul2(a3 ^ a0);
  }
}

function invMixColumns(s: Uint8Array) {
  for (let c = 0; c < 4; c++) {
    const i = c * 4;
    const u = mul2(mul2(s[i]! ^ s[i + 2]!));
    const v = mul2(mul2(s[i + 1]! ^ s[i + 3]!));
    s[i]! ^= u;
    s[i + 1]! ^= v;
    s[i + 2]! ^= u;
    s[i + 3]! ^= v;
  }
  mixColumns(s);
}

/** Standard AES-128 encryption of one 16-byte block. */
export function aesEncryptBlock(block: Uint8Array, key: Uint8Array): Uint8Array {
  const ks = expandKey(key);
  const s = block.slice();
  addRoundKey(s, ks[0]!);
  for (let r = 1; r <= 10; r++) {
    const t = s.slice();
    for (let i = 0; i < 16; i++) s[i] = S_BOX[t[SHIFT[i]!]!]!;
    if (r < 10) mixColumns(s);
    addRoundKey(s, ks[r]!);
  }
  return s;
}

/** Standard AES-128 decryption of one 16-byte block. */
export function aesDecryptBlock(block: Uint8Array, key: Uint8Array): Uint8Array {
  const ks = expandKey(key);
  const s = block.slice();
  addRoundKey(s, ks[10]!);
  for (let r = 9; r >= 0; r--) {
    const t = s.slice();
    for (let i = 0; i < 16; i++) s[i] = INV_S_BOX[t[INV_SHIFT[i]!]!]!;
    addRoundKey(s, ks[r]!);
    if (r > 0) invMixColumns(s);
  }
  return s;
}

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim();
  if (!/^([0-9a-fA-F]{2})*$/.test(clean)) throw new Error('invalid hex');
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

const toHex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

/** The phone number as 6 big-endian bytes (972501234567 fits in 40 bits). */
function phoneBytes(phone: number): number[] {
  const out: number[] = [];
  for (let i = 5; i >= 0; i--) out.push(Math.floor(phone / 2 ** (8 * i)) & 0xff);
  return out;
}

const TYPE_PREFIX: Record<TokenType, number> = {
  [TokenType.SMS]: 0x01,
  [TokenType.PRIMARY]: 0x11,
  [TokenType.SECONDARY]: 0x21,
};

/**
 * @param sessionToken 16 bytes from SMS login or device linking
 * @param phone        phone number in international form without "+", e.g. 972501234567
 * @param tokenType    the session token's type
 * @param unixSeconds  defaults to now
 * @param offset       added to the timestamp; 2 is what the official app uses
 */
export function generateToken(
  sessionToken: Uint8Array,
  phone: number,
  tokenType: TokenType,
  unixSeconds = Math.floor(Date.now() / 1000),
  offset = 2,
): string {
  if (sessionToken.length !== 16) throw new Error('session token must be 16 bytes');
  if (!Number.isSafeInteger(phone) || phone <= 0) throw new Error('invalid phone number');
  const prefix = TYPE_PREFIX[tokenType];
  if (prefix === undefined) throw new Error(`unknown token type ${String(tokenType)}`);

  const pb = phoneBytes(phone);
  const key1 = Uint8Array.from(T_C_KEY);
  key1.set(pb, 6);
  const step1 = aesDecryptBlock(sessionToken, key1);

  const state = new Uint8Array(16);
  state[1] = 0x0a;
  state[2] = 0x0a;
  const ts = (unixSeconds + offset) >>> 0;
  state[10] = (ts >>> 24) & 0xff;
  state[11] = (ts >>> 16) & 0xff;
  state[12] = (ts >>> 8) & 0xff;
  state[13] = ts & 0xff;
  const step2 = aesEncryptBlock(state, step1);

  const result = new Uint8Array(23);
  result[0] = prefix;
  result.set(pb, 1);
  result.set(step2, 7);
  return toHex(result).toUpperCase();
}
