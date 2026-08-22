import { describe, expect, it } from 'vitest';
import { base32Decode, base32Encode, formatSecret, otpauthUri, totpAt, verifyTotp } from '../totp';

// RFC 4648 test vectors, so the base32 half is not merely self-consistent.
const encoder = new TextEncoder();

describe('base32', () => {
  it('matches the RFC 4648 vectors', () => {
    expect(base32Encode(encoder.encode('f'))).toBe('MY');
    expect(base32Encode(encoder.encode('fo'))).toBe('MZXQ');
    expect(base32Encode(encoder.encode('foo'))).toBe('MZXW6');
    expect(base32Encode(encoder.encode('foobar'))).toBe('MZXW6YTBOI');
  });

  it('round-trips', () => {
    const bytes = new Uint8Array([1, 2, 3, 250, 128, 0, 77]);
    expect(Array.from(base32Decode(base32Encode(bytes)))).toEqual(Array.from(bytes));
  });

  it('ignores the spaces and padding a person types', () => {
    expect(Array.from(base32Decode('MZXW 6YTB OI=='))).toEqual(
      Array.from(encoder.encode('foobar')),
    );
  });
});

describe('totp', () => {
  // RFC 6238 appendix B, with the SHA-1 secret "12345678901234567890" in
  // base32. The published values are 8 digits; these are the low six.
  const secret = base32Encode(encoder.encode('12345678901234567890'));

  it('matches the RFC 6238 vectors', async () => {
    expect(await totpAt(secret, Math.floor(59 / 30))).toBe('287082');
    expect(await totpAt(secret, Math.floor(1111111109 / 30))).toBe('081804');
    expect(await totpAt(secret, Math.floor(1111111111 / 30))).toBe('050471');
    expect(await totpAt(secret, Math.floor(1234567890 / 30))).toBe('005924');
  });

  it('accepts a code from the step before and after, for clock drift', async () => {
    const now = 1_700_000_000_000;
    const previous = await totpAt(secret, Math.floor(now / 1000 / 30) - 1);
    const next = await totpAt(secret, Math.floor(now / 1000 / 30) + 1);
    expect(await verifyTotp(secret, previous, now)).toBe(true);
    expect(await verifyTotp(secret, next, now)).toBe(true);
  });

  it('rejects a code two steps away, and anything that is not six digits', async () => {
    const now = 1_700_000_000_000;
    const stale = await totpAt(secret, Math.floor(now / 1000 / 30) - 2);
    expect(await verifyTotp(secret, stale, now)).toBe(false);
    expect(await verifyTotp(secret, '12345', now)).toBe(false);
    expect(await verifyTotp(secret, 'abcdef', now)).toBe(false);
    expect(await verifyTotp(secret, '', now)).toBe(false);
  });
});

describe('enrolment helpers', () => {
  it('builds a URI an authenticator understands', () => {
    const uri = otpauthUri('ABCDEFGH', 'dan@example.com', 'Test');
    expect(uri).toContain('otpauth://totp/Test%3Adan%40example.com?');
    expect(uri).toContain('secret=ABCDEFGH');
    expect(uri).toContain('digits=6');
    expect(uri).toContain('period=30');
  });

  it('groups the secret so it can be typed', () => {
    expect(formatSecret('ABCDEFGHIJ')).toBe('ABCD EFGH IJ');
  });
});
