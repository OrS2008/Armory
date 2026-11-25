import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { aesDecryptBlock, aesEncryptBlock, generateToken, TokenType } from '../src/palgate/token';

const nodeEnc = (b: Uint8Array, k: Uint8Array) => {
  const c = createCipheriv('aes-128-ecb', k, null).setAutoPadding(false);
  return new Uint8Array(Buffer.concat([c.update(b), c.final()]));
};
const nodeDec = (b: Uint8Array, k: Uint8Array) => {
  const c = createDecipheriv('aes-128-ecb', k, null).setAutoPadding(false);
  return new Uint8Array(Buffer.concat([c.update(b), c.final()]));
};

// ---------------------------------------------------------------------------
// A literal, line-by-line transcription of pylgate/_aes.py `_aes_enc_dec`.
// It exists only to prove which standard AES direction each `is_encrypt`
// flag corresponds to, so production code can use clean standard AES.
// ---------------------------------------------------------------------------
const SB: number[] = [];
const ISB: number[] = [];
{
  // Rebuild the S-box from its definition rather than copying the table.
  let p = 1;
  let q = 1;
  do {
    p = p ^ ((p << 1) & 0xff) ^ (p & 0x80 ? 0x1b : 0);
    q ^= q << 1;
    q ^= q << 2;
    q ^= q << 4;
    q &= 0xff;
    if (q & 0x80) q ^= 0x09;
    const r = (x: number, s: number) => ((x << s) | (x >> (8 - s))) & 0xff;
    const x = q ^ r(q, 1) ^ r(q, 2) ^ r(q, 3) ^ r(q, 4) ^ 0x63;
    SB[p] = x;
  } while (p !== 1);
  SB[0] = 0x63;
  for (let i = 0; i < 256; i++) ISB[SB[i]!] = i;
}
const RC = [0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1b, 0x36];
const gm2 = (v: number) => (v >> 7 ? (v << 1) ^ 0x1b : v << 1) & 0xff;

function pylgateAes(stateIn: Uint8Array, keyIn: Uint8Array, encrypt: boolean): Uint8Array {
  const s = Array.from(stateIn);
  const k = Array.from(keyIn);
  if (encrypt) {
    for (let rnd = 0; rnd < 10; rnd++) {
      k[0] = SB[k[13]!]! ^ k[0]! ^ RC[rnd]!;
      k[1] = SB[k[14]!]! ^ k[1]!;
      k[2] = SB[k[15]!]! ^ k[2]!;
      k[3] = SB[k[12]!]! ^ k[3]!;
      for (let i = 4; i < 16; i++) k[i] = k[i]! ^ k[i - 4]!;
    }
    for (let i = 0; i < 16; i++) s[i] = s[i]! ^ k[i]!;
  }
  for (let rnd = 0; rnd < 10; rnd++) {
    if (encrypt) {
      for (let i = 15; i > 3; i--) k[i] = k[i]! ^ k[i - 4]!;
      k[0] = SB[k[13]!]! ^ k[0]! ^ RC[9 - rnd]!;
      k[1] = SB[k[14]!]! ^ k[1]!;
      k[2] = SB[k[15]!]! ^ k[2]!;
      k[3] = SB[k[12]!]! ^ k[3]!;
    } else {
      for (let i = 0; i < 16; i++) s[i] = SB[s[i]! ^ k[i]!]!;
      let b1 = s[1]!;
      s[1] = s[5]!; s[5] = s[9]!; s[9] = s[13]!; s[13] = b1;
      b1 = s[2]!; const b2 = s[6]!;
      s[2] = s[10]!; s[6] = s[14]!; s[10] = b1; s[14] = b2;
      b1 = s[15]!;
      s[15] = s[11]!; s[11] = s[7]!; s[7] = s[3]!; s[3] = b1;
    }
    if ((rnd > 0 && encrypt) || (rnd < 9 && !encrypt)) {
      for (let i = 0; i < 4; i++) {
        const b4 = i << 2;
        if (encrypt) {
          const u = gm2(gm2(s[b4]! ^ s[b4 + 2]!));
          const v = gm2(gm2(s[b4 + 1]! ^ s[b4 + 3]!));
          s[b4] = s[b4]! ^ u; s[b4 + 1] = s[b4 + 1]! ^ v;
          s[b4 + 2] = s[b4 + 2]! ^ u; s[b4 + 3] = s[b4 + 3]! ^ v;
        }
        const t = s[b4]! ^ s[b4 + 1]! ^ s[b4 + 2]! ^ s[b4 + 3]!;
        const a0 = s[b4]!;
        s[b4] = s[b4]! ^ gm2(s[b4]! ^ s[b4 + 1]!) ^ t;
        s[b4 + 1] = s[b4 + 1]! ^ gm2(s[b4 + 1]! ^ s[b4 + 2]!) ^ t;
        s[b4 + 2] = s[b4 + 2]! ^ gm2(s[b4 + 2]! ^ s[b4 + 3]!) ^ t;
        s[b4 + 3] = s[b4 + 3]! ^ gm2(s[b4 + 3]! ^ a0) ^ t;
      }
    }
    if (encrypt) {
      let b1 = s[13]!;
      s[13] = s[9]!; s[9] = s[5]!; s[5] = s[1]!; s[1] = b1;
      b1 = s[10]!; const b2 = s[14]!;
      s[10] = s[2]!; s[14] = s[6]!; s[2] = b1; s[6] = b2;
      b1 = s[3]!;
      s[3] = s[7]!; s[7] = s[11]!; s[11] = s[15]!; s[15] = b1;
      for (let i = 0; i < 16; i++) s[i] = ISB[s[i]!]! ^ k[i]!;
    } else {
      k[0] = SB[k[13]!]! ^ k[0]! ^ RC[rnd]!;
      k[1] = SB[k[14]!]! ^ k[1]!;
      k[2] = SB[k[15]!]! ^ k[2]!;
      k[3] = SB[k[12]!]! ^ k[3]!;
      for (let i = 4; i < 16; i++) k[i] = k[i]! ^ k[i - 4]!;
    }
  }
  if (!encrypt) for (let i = 0; i < 16; i++) s[i] = s[i]! ^ k[i]!;
  return Uint8Array.from(s);
}

describe('AES', () => {
  it('matches FIPS-197 appendix C.1', () => {
    const key = Uint8Array.from(Buffer.from('000102030405060708090a0b0c0d0e0f', 'hex'));
    const pt = Uint8Array.from(Buffer.from('00112233445566778899aabbccddeeff', 'hex'));
    const ct = '69c4e0d86a7b0430d8cdb78070b4c55a';
    expect(Buffer.from(aesEncryptBlock(pt, key)).toString('hex')).toBe(ct);
    expect(aesDecryptBlock(Uint8Array.from(Buffer.from(ct, 'hex')), key)).toEqual(pt);
  });

  it('matches node:crypto and the pylgate routine on random blocks', () => {
    for (let n = 0; n < 200; n++) {
      const b = new Uint8Array(randomBytes(16));
      const k = new Uint8Array(randomBytes(16));
      expect(aesEncryptBlock(b, k)).toEqual(nodeEnc(b, k));
      expect(aesDecryptBlock(b, k)).toEqual(nodeDec(b, k));
      // pylgate's is_encrypt=True is standard AES *decryption*, and vice versa.
      expect(pylgateAes(b, k, true)).toEqual(nodeDec(b, k));
      expect(pylgateAes(b, k, false)).toEqual(nodeEnc(b, k));
    }
  });
});

describe('generateToken', () => {
  const session = Uint8Array.from(Buffer.from('00112233445566778899aabbccddeeff', 'hex'));
  const phone = 972501234567;

  it('has the documented layout', () => {
    const t = generateToken(session, phone, TokenType.SECONDARY, 1_700_000_000);
    expect(t).toMatch(/^[0-9A-F]{46}$/);
    expect(t.slice(0, 2)).toBe('21');
    expect(t.slice(2, 14)).toBe(phone.toString(16).padStart(12, '0').toUpperCase());
  });

  it('reproduces pylgate step by step', () => {
    const ts = 1_732_000_000;
    // pylgate _step_1 / _step_2, computed with node:crypto independently.
    const key1 = Buffer.from('fad325728129000000000000' + '3ab45a65', 'hex');
    Buffer.from(phone.toString(16).padStart(12, '0'), 'hex').copy(key1, 6);
    const step1 = pylgateAes(session, key1, true);
    const state = Buffer.alloc(16);
    state.writeUInt16LE(0x0a0a, 1);
    state.writeUInt32BE(ts + 2, 10);
    const step2 = pylgateAes(state, step1, false);
    const expected =
      '11' + phone.toString(16).padStart(12, '0') + Buffer.from(step2).toString('hex');
    expect(generateToken(session, phone, TokenType.PRIMARY, ts)).toBe(expected.toUpperCase());
  });

  it('changes with time and type', () => {
    const a = generateToken(session, phone, TokenType.SMS, 1_700_000_000);
    const b = generateToken(session, phone, TokenType.SMS, 1_700_000_001);
    expect(a.slice(0, 2)).toBe('01');
    expect(a).not.toBe(b);
  });

  it('rejects bad input', () => {
    expect(() => generateToken(new Uint8Array(15), phone, TokenType.SMS)).toThrow();
    expect(() => generateToken(session, -1, TokenType.SMS)).toThrow();
  });
});
