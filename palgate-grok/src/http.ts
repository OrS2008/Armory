import { randomToken } from './crypto';

/** Headers every response carries. */
export const SECURITY_HEADERS: Record<string, string> = {
  'strict-transport-security': 'max-age=63072000; includeSubDomains; preload',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-resource-policy': 'same-origin',
  'cache-control': 'no-store, max-age=0',
  'x-robots-tag': 'noindex, nofollow, noarchive, nosnippet',
};

export const NONCE = '{{CSP_NONCE}}';

/**
 * HTML with a strict CSP: only scripts carrying this response's nonce run, so
 * injected markup can't execute anything; nothing can frame the page; forms and
 * fetches stay on this origin.
 */
export function html(body: string, status = 200, extra: Record<string, string> = {}) {
  const nonce = randomToken(16);
  const csp = [
    "default-src 'none'",
    `script-src 'nonce-${nonce}'`,
    "style-src 'unsafe-inline'",
    'img-src data:',
    "connect-src 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
  ].join('; ');
  return new Response(body.replaceAll(NONCE, nonce), {
    status,
    headers: { ...SECURITY_HEADERS, 'content-type': 'text/html; charset=utf-8', 'content-security-policy': csp, ...extra },
  });
}

export const json = (data: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...SECURITY_HEADERS, 'content-type': 'application/json; charset=utf-8', ...extra },
  });

export const text = (body: string, status = 200) =>
  new Response(body, { status, headers: { ...SECURITY_HEADERS, 'content-type': 'text/plain; charset=utf-8' } });

export interface ClientMeta {
  ip: string;
  country: string;
  ua: string;
}

export function clientMeta(req: Request): ClientMeta {
  const cf = (req as Request & { cf?: { country?: string } }).cf;
  return {
    ip: req.headers.get('cf-connecting-ip') ?? 'unknown',
    country: (cf?.country ?? req.headers.get('cf-ipcountry') ?? 'XX').toUpperCase(),
    ua: (req.headers.get('user-agent') ?? '').slice(0, 120),
  };
}

export async function readJson<T>(req: Request): Promise<Partial<T>> {
  if (Number(req.headers.get('content-length') ?? 0) > 16_384) throw new Error('body too large');
  try {
    const v: unknown = await req.json();
    return v && typeof v === 'object' ? (v as Partial<T>) : {};
  } catch {
    return {};
  }
}
