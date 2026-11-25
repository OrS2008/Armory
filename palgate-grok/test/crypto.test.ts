import { describe, expect, it } from 'vitest';
import { base32, hashPassword, hotp, open, seal, b64u, unbase32, verifyPassword, verifyTotp } from '../src/crypto';

const rfcKey = new TextEncoder().encode('12345678901234567890');

describe('TOTP is compatible with authenticator apps', () => {
  it('matches RFC 4226 HOTP vectors', async () => {
    const expected = ['755224', '287082', '359152', '969429', '338314', '254676', '287922', '162583', '399871', '520489'];
    for (let i = 0; i < expected.length; i++) expect(await hotp(rfcKey, i)).toBe(expected[i]);
  });

  it('matches RFC 6238 TOTP vectors (SHA-1, last 6 digits)', async () => {
    const vectors: [number, string][] = [[59, '287082'], [1111111109, '081804'], [1234567890, '005924'], [2000000000, '279037']];
    for (const [t, c] of vectors) expect(await verifyTotp(base32(rfcKey), c, 0, t * 1000)).not.toBeNull();
  });

  it('base32 round-trips and matches the RFC 4648 example', () => {
    expect(base32(new TextEncoder().encode('foobar'))).toBe('MZXW6YTBOI');
    expect(unbase32('MZXW6YTBOI')).toEqual(new TextEncoder().encode('foobar'));
  });

  it('rejects replays and codes outside ±30s', async () => {
    const s = base32(rfcKey);
    const step = await verifyTotp(s, '287082', 0, 59_000);
    expect(step).toBe(1);
    expect(await verifyTotp(s, '287082', step!, 59_000)).toBeNull();
    expect(await verifyTotp(s, '287082', 0, 59_000 + 120_000)).toBeNull();
  });
});

describe('passwords and sealing', () => {
  it('hashes with a salt and verifies', async () => {
    const h = await hashPassword('a very long password');
    expect(h.iter).toBe(100_000);
    expect(await verifyPassword('a very long password', h)).toBe(true);
    expect(await verifyPassword('a very long passworD', h)).toBe(false);
    expect((await hashPassword('a very long password')).hash).not.toBe(h.hash);
  });

  it('AES-GCM blobs are bound to their slot and detect tampering', async () => {
    const k = b64u(crypto.getRandomValues(new Uint8Array(32)));
    const s = await seal(k, 'session', { a: 1 });
    expect(await open(k, 'session', s)).toEqual({ a: 1 });
    await expect(open(k, 'config2', s)).rejects.toThrow();
    const flipped = { ...s, ct: (s.ct[0] === 'A' ? 'B' : 'A') + s.ct.slice(1) };
    await expect(open(k, 'session', flipped)).rejects.toThrow();
  });
});
