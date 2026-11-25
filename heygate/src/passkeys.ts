/**
 * Passkeys (WebAuthn) for the owner: Face ID / Touch ID / Windows Hello /
 * Android biometrics, synced by iCloud Keychain or Google Password Manager.
 *
 * Verification is done by @simplewebauthn/server (a maintained, widely used
 * library) rather than hand-rolled CBOR/COSE parsing. Challenges are random,
 * single-use, bound to their purpose and expire after five minutes.
 */
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { b64u, randomBytes, randomToken, unb64u } from './crypto';
import { getSealed, putSealed, type Env } from './store';

export interface Passkey {
  id: string; // credential id, base64url
  publicKey: string; // COSE public key, base64url
  counter: number;
  transports?: AuthenticatorTransportFuture[];
  name: string;
  createdAt: string;
  lastUsedAt?: string;
  backedUp?: boolean; // synced passkey (iCloud / Google)
}

export type RegPurpose = 'signup' | 'add' | 'sa-setup' | 'sa-add';
export type AuthPurpose = 'login' | 'sa-login';
type Purpose = RegPurpose | AuthPurpose;

interface Challenge {
  challenge: string;
  purpose: Purpose;
  userId: string;
}

const CHALLENGE_TTL = 300;

const rp = (url: URL) => ({ rpID: url.hostname, origin: url.origin });

async function storeChallenge(env: Env, c: Challenge) {
  const token = randomToken(24);
  await putSealed(env, `chal:${token}`, c, CHALLENGE_TTL);
  return token;
}

/** Fetches and burns a challenge: each one can be used exactly once. */
async function takeChallenge(env: Env, token: unknown, purpose: Purpose): Promise<Challenge | null> {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{32}$/.test(token)) return null;
  const c = await getSealed<Challenge>(env, `chal:${token}`);
  await env.GATE.delete(`chal:${token}`);
  return c && c.purpose === purpose ? c : null;
}

export async function registrationOptions(
  env: Env,
  url: URL,
  purpose: RegPurpose,
  existing: { userId: string; passkeys: Passkey[] } | null,
) {
  const sa = purpose.startsWith('sa-');
  const userId = existing?.userId ?? b64u(randomBytes(16));
  const options = await generateRegistrationOptions({
    rpName: 'HeyGate',
    rpID: rp(url).rpID,
    userName: sa ? 'heygate-admin' : 'heygate',
    userDisplayName: sa ? 'HeyGate — ניהול מערכת' : 'HeyGate',
    userID: unb64u(userId),
    attestationType: 'none',
    excludeCredentials: (existing?.passkeys ?? []).map((p) => ({ id: p.id, transports: p.transports })),
    authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
    supportedAlgorithmIDs: [-7, -257], // ES256, RS256
  });
  const token = await storeChallenge(env, { challenge: options.challenge, purpose, userId });
  return { token, options };
}

export async function verifyRegistration(
  env: Env,
  url: URL,
  purpose: RegPurpose,
  token: unknown,
  response: unknown,
  name: string,
): Promise<{ userId: string; passkey: Passkey } | null> {
  const c = await takeChallenge(env, token, purpose);
  if (!c || !response || typeof response !== 'object') return null;
  try {
    const v = await verifyRegistrationResponse({
      response: response as RegistrationResponseJSON,
      expectedChallenge: c.challenge,
      expectedOrigin: rp(url).origin,
      expectedRPID: rp(url).rpID,
      requireUserVerification: true,
    });
    if (!v.verified) return null;
    const { credential, credentialBackedUp } = v.registrationInfo;
    return {
      userId: c.userId,
      passkey: {
        id: credential.id,
        publicKey: b64u(credential.publicKey),
        counter: credential.counter,
        transports: credential.transports,
        name: name.slice(0, 40) || 'Passkey',
        createdAt: new Date().toISOString(),
        backedUp: credentialBackedUp,
      },
    };
  } catch {
    return null;
  }
}

export async function authenticationOptions(env: Env, url: URL, purpose: AuthPurpose) {
  // Empty allowCredentials: the device offers its discoverable passkey for this
  // site, so nobody types a username. Which account it belongs to is decided by
  // the server from the credential, never by the client.
  const options = await generateAuthenticationOptions({ rpID: rp(url).rpID, userVerification: 'required' });
  const token = await storeChallenge(env, { challenge: options.challenge, purpose, userId: '' });
  return { token, options };
}

export interface Owner {
  userId: string;
  passkeys: Passkey[];
}

/**
 * Verifies a sign-in. `findOwner` maps the presented credential id to the one
 * account it was registered to (or null). Returns that owner and the updated
 * passkey, or null.
 */
export async function verifyAuthentication<O extends Owner>(
  env: Env,
  url: URL,
  purpose: AuthPurpose,
  token: unknown,
  response: unknown,
  findOwner: (credentialId: string) => Promise<O | null>,
): Promise<{ owner: O; passkey: Passkey } | null> {
  const c = await takeChallenge(env, token, purpose);
  if (!c || !response || typeof response !== 'object') return null;
  const r = response as AuthenticationResponseJSON;
  if (typeof r.id !== 'string' || r.id.length > 1400) return null;
  const owner = await findOwner(r.id);
  const pk = owner?.passkeys.find((p) => p.id === r.id);
  if (!owner || !pk) return null;
  if (r.response?.userHandle && r.response.userHandle !== owner.userId) return null;
  try {
    const v = await verifyAuthenticationResponse({
      response: r,
      expectedChallenge: c.challenge,
      expectedOrigin: rp(url).origin,
      expectedRPID: rp(url).rpID,
      credential: { id: pk.id, publicKey: unb64u(pk.publicKey), counter: pk.counter, transports: pk.transports },
      requireUserVerification: true,
    });
    if (!v.verified) return null;
    return { owner, passkey: { ...pk, counter: v.authenticationInfo.newCounter, lastUsedAt: new Date().toISOString() } };
  } catch {
    return null;
  }
}
