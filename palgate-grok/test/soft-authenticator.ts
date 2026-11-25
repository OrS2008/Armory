/**
 * A software WebAuthn authenticator for tests: real P-256 keys, real CBOR,
 * real signatures — the same bytes a phone produces, so the server is tested
 * end to end against the actual protocol.
 */
import { createHash } from 'node:crypto';

const subtle = crypto.subtle;
const b64u = (b: Uint8Array | ArrayBuffer) => Buffer.from(b instanceof ArrayBuffer ? new Uint8Array(b) : b).toString('base64url');
const sha = (b: Uint8Array | string) => new Uint8Array(createHash('sha256').update(b).digest());

// Minimal CBOR encoder: unsigned/negative ints, byte strings, text, maps.
function head(major: number, n: number): number[] {
  if (n < 24) return [(major << 5) | n];
  if (n < 256) return [(major << 5) | 24, n];
  if (n < 65536) return [(major << 5) | 25, n >> 8, n & 255];
  return [(major << 5) | 26, (n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
}
type C = number | string | Uint8Array | Map<C, C>;
function cbor(v: C): number[] {
  if (typeof v === 'number') return v >= 0 ? head(0, v) : head(1, -1 - v);
  if (typeof v === 'string') {
    const b = Buffer.from(v, 'utf8');
    return [...head(3, b.length), ...b];
  }
  if (v instanceof Uint8Array) return [...head(2, v.length), ...v];
  const out = head(5, v.size);
  for (const [k, val] of v) out.push(...cbor(k), ...cbor(val));
  return out;
}

function derSignature(raw: Uint8Array): Uint8Array {
  const int = (b: Uint8Array) => {
    let i = 0;
    while (i < b.length - 1 && b[i] === 0) i++;
    let x = b.slice(i);
    if (x[0]! & 0x80) x = Uint8Array.from([0, ...x]);
    return [0x02, x.length, ...x];
  };
  const body = [...int(raw.slice(0, 32)), ...int(raw.slice(32))];
  return Uint8Array.from([0x30, body.length, ...body]);
}

const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];

export interface SoftOptions {
  origin: string;
  /** Flip to simulate broken/malicious authenticators. */
  userVerified?: boolean;
}

export class SoftAuthenticator {
  credId = crypto.getRandomValues(new Uint8Array(16));
  counter = 0;
  userHandle = '';
  private keys!: CryptoKeyPair;

  constructor(private o: SoftOptions) {}

  private flags(extra: number) {
    return 0x01 /* UP */ | (this.o.userVerified === false ? 0 : 0x04) /* UV */ | extra;
  }

  async create(options: { challenge: string; rp: { id: string }; user: { id: string } }, origin = this.o.origin) {
    this.keys = (await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
    this.userHandle = options.user.id;
    const jwk = (await subtle.exportKey('jwk', this.keys.publicKey)) as JsonWebKey;
    const cose = new Map<C, C>([
      [1, 2],
      [3, -7],
      [-1, 1],
      [-2, Uint8Array.from(Buffer.from(jwk.x!, 'base64url'))],
      [-3, Uint8Array.from(Buffer.from(jwk.y!, 'base64url'))],
    ]);
    const authData = Uint8Array.from([
      ...sha(options.rp.id),
      this.flags(0x40 /* AT */),
      ...u32(this.counter),
      ...new Uint8Array(16), // aaguid
      0,
      this.credId.length,
      ...this.credId,
      ...cbor(cose),
    ]);
    const clientDataJSON = JSON.stringify({ type: 'webauthn.create', challenge: options.challenge, origin, crossOrigin: false });
    const attestationObject = Uint8Array.from(cbor(new Map<C, C>([['fmt', 'none'], ['attStmt', new Map()], ['authData', authData]])));
    return {
      id: b64u(this.credId),
      rawId: b64u(this.credId),
      type: 'public-key',
      clientExtensionResults: {},
      response: { clientDataJSON: b64u(Buffer.from(clientDataJSON)), attestationObject: b64u(attestationObject), transports: ['internal'] },
    };
  }

  async get(options: { challenge: string; rpId: string }, origin = this.o.origin, keyOverride?: CryptoKey) {
    this.counter++;
    const authData = Uint8Array.from([...sha(options.rpId), this.flags(0), ...u32(this.counter)]);
    const clientDataJSON = Buffer.from(JSON.stringify({ type: 'webauthn.get', challenge: options.challenge, origin, crossOrigin: false }));
    const signed = Uint8Array.from([...authData, ...sha(clientDataJSON)]);
    const raw = new Uint8Array(await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, keyOverride ?? this.keys.privateKey, signed));
    return {
      id: b64u(this.credId),
      rawId: b64u(this.credId),
      type: 'public-key',
      clientExtensionResults: {},
      response: {
        clientDataJSON: b64u(clientDataJSON),
        authenticatorData: b64u(authData),
        signature: b64u(derSignature(raw)),
        userHandle: this.userHandle,
      },
    };
  }

  static async foreignKey() {
    return ((await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign'])) as CryptoKeyPair).privateKey;
  }
}
