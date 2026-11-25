/**
 * Optional outer layer for /admin: Cloudflare Access (Zero Trust).
 *
 * When ACCESS_TEAM_DOMAIN and ACCESS_AUD are set, every /admin request must
 * carry a valid Cf-Access-Jwt-Assertion signed by your Access team. Access does
 * the login (email one-time PIN, Google, passkeys…) before the request ever
 * reaches this Worker; this module re-verifies it, so the Worker can't be
 * reached around Access either. Our own password + TOTP still applies inside.
 */
import { unb64u } from './crypto';
import type { Env } from './store';

interface Jwk extends JsonWebKey {
  kid: string;
}

let certCache: { domain: string; at: number; keys: Jwk[] } | null = null;

async function keys(domain: string): Promise<Jwk[]> {
  if (certCache && certCache.domain === domain && Date.now() - certCache.at < 3600_000) return certCache.keys;
  const res = await fetch(`https://${domain}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error('cannot fetch Access certs');
  const body = await res.json<{ keys: Jwk[] }>();
  certCache = { domain, at: Date.now(), keys: body.keys };
  return body.keys;
}

export const accessEnabled = (env: Env) => !!(env.ACCESS_TEAM_DOMAIN && env.ACCESS_AUD);

export async function verifyAccess(req: Request, env: Env): Promise<string | null> {
  const token = req.headers.get('cf-access-jwt-assertion');
  if (!token || !env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) return null;
  const [h, p, sig] = token.split('.');
  if (!h || !p || !sig) return null;
  try {
    const header = JSON.parse(new TextDecoder().decode(unb64u(h))) as { alg: string; kid: string };
    const payload = JSON.parse(new TextDecoder().decode(unb64u(p))) as {
      aud: string | string[];
      iss: string;
      exp: number;
      nbf?: number;
      email?: string;
    };
    if (header.alg !== 'RS256') return null;
    const jwk = (await keys(env.ACCESS_TEAM_DOMAIN)).find((k) => k.kid === header.kid);
    if (!jwk) return null;
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, unb64u(sig), new TextEncoder().encode(`${h}.${p}`));
    const now = Date.now() / 1000;
    const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!ok || !aud.includes(env.ACCESS_AUD) || payload.iss !== `https://${env.ACCESS_TEAM_DOMAIN}`) return null;
    if (payload.exp < now || (payload.nbf && payload.nbf > now + 60)) return null;
    return payload.email ?? 'access-user';
  } catch {
    return null;
  }
}
