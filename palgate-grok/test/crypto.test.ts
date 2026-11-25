import { describe, expect, it } from 'vitest';
import { b64u, open, safeEqual, seal, unb64u } from '../src/crypto';

describe('sealing and helpers', () => {
  it('AES-GCM blobs are bound to their slot and detect tampering', async () => {
    const k = b64u(crypto.getRandomValues(new Uint8Array(32)));
    const s = await seal(k, 'session', { a: 1 });
    expect(await open(k, 'session', s)).toEqual({ a: 1 });
    await expect(open(k, 'config2', s)).rejects.toThrow();
    const flipped = { ...s, ct: (s.ct[0] === 'A' ? 'B' : 'A') + s.ct.slice(1) };
    await expect(open(k, 'session', flipped)).rejects.toThrow();
    const otherKey = b64u(crypto.getRandomValues(new Uint8Array(32)));
    await expect(open(otherKey, 'session', s)).rejects.toThrow();
  });

  it('base64url round-trips', () => {
    const b = crypto.getRandomValues(new Uint8Array(33));
    expect(unb64u(b64u(b))).toEqual(b);
  });

  it('safeEqual', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });
});
