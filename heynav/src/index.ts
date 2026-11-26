/**
 * HeyNav: turn-by-turn navigation for the car's browser.
 *
 * The Worker serves the app and proxies address search (Photon) and routing
 * (OSRM): the browser never talks to those services directly, so they don't see
 * the driver's IP, requests carry an honest User-Agent, and there is a per-IP
 * limit in front of them. Map tiles come straight from OpenFreeMap.
 */
import { ASSETS } from './assets.gen';
import { buildRoute, type OsrmRoute } from './guidance';
import { pickLang, type Lang } from './i18n';
import { appPage, iconSvg, manifest } from './page';
import { lonLat, placeFromPhoton, type PhotonFeature } from './api';

export interface Env {
  RL_API?: RateLimit;
  ROUTER_BASE?: string;  // dev/tests only
  SEARCH_BASE?: string;  // dev/tests only
}

const ROUTER = 'https://router.project-osrm.org/route/v1/driving/';
const SEARCH = 'https://photon.komoot.io/api/';
const TILES = 'https://tiles.openfreemap.org';
const UA = 'HeyNav/1.0 (+https://heynav.ors2008.workers.dev)';

const BASE_HEADERS: Record<string, string> = {
  'strict-transport-security': 'max-age=63072000; includeSubDomains; preload',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
  'permissions-policy': 'geolocation=(self), screen-wake-lock=(self), camera=(), microphone=(), payment=(), usb=(), interest-cohort=()',
  'cross-origin-opener-policy': 'same-origin',
  'x-robots-tag': 'noindex, nofollow',
};

function page(body: string): Response {
  const nonce = rand();
  const csp = [
    "default-src 'none'",
    `script-src 'nonce-${nonce}' 'self'`,
    "worker-src 'self' blob:",
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${TILES}`,
    "font-src 'self'",
    `connect-src 'self' ${TILES}`,
    "manifest-src 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
  ].join('; ');
  return new Response(body.replaceAll('{{NONCE}}', nonce), {
    headers: { ...BASE_HEADERS, 'content-type': 'text/html; charset=utf-8', 'content-security-policy': csp, 'cache-control': 'no-store' },
  });
}

const json = (data: unknown, status = 200, cache = 'no-store') =>
  new Response(JSON.stringify(data), { status, headers: { ...BASE_HEADERS, 'content-type': 'application/json; charset=utf-8', 'cache-control': cache } });

function rand() {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return btoa(String.fromCharCode(...b)).replace(/[+/=]/g, '');
}

const num = (s: string | null, lo: number, hi: number) => {
  if (s == null || s === '' || !/^-?\d{1,3}(\.\d{1,9})?$/.test(s)) return null;
  const n = Number(s);
  return n >= lo && n <= hi ? n : null;
};

async function limited(env: Env, req: Request, kind: string) {
  if (!env.RL_API) return false;
  const ip = req.headers.get('cf-connecting-ip') ?? 'local';
  const { success } = await env.RL_API.limit({ key: `${kind}:${ip}` });
  return !success;
}

async function search(req: Request, env: Env, url: URL, lang: Lang, ctx: ExecutionContext) {
  const q = (url.searchParams.get('q') ?? '').trim();
  if (q.length < 2 || q.length > 120) return json({ ok: false, error: 'bad_query' }, 400);
  if (await limited(env, req, 's')) return json({ ok: false, error: 'rate_limited' }, 429);
  const lat = num(url.searchParams.get('lat'), -90, 90), lon = num(url.searchParams.get('lon'), -180, 180);
  const u = new URL(env.SEARCH_BASE ?? SEARCH);
  u.searchParams.set('q', q);
  u.searchParams.set('limit', '7');
  if (lang === 'en') u.searchParams.set('lang', 'en'); // Photon has no Hebrew option; its default is the local name
  if (lat != null && lon != null) { u.searchParams.set('lat', lat.toFixed(2)); u.searchParams.set('lon', lon.toFixed(2)); }

  const cache = (globalThis as { caches?: CacheStorage & { default?: Cache } }).caches?.default;
  const key = new Request(`https://cache.heynav/search/v2?${u.searchParams}`);
  const hit = cache ? await cache.match(key) : undefined;
  if (hit) return json(await hit.json(), 200, 'private, max-age=300');

  const r = await fetch(u, { headers: { 'user-agent': UA, accept: 'application/json' } });
  if (!r.ok) return json({ ok: false, error: 'upstream' }, 502);
  const d = (await r.json()) as { features?: PhotonFeature[] };
  const seen = new Set<string>();
  const places = (d.features ?? []).map(placeFromPhoton).filter((p) => {
    const k = `${p.name}|${p.detail}`;
    if (!p.name || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const body = { ok: true, places };
  if (cache) ctx.waitUntil(cache.put(key, new Response(JSON.stringify(body), { headers: { 'cache-control': 'max-age=86400' } })));
  return json(body, 200, 'private, max-age=300');
}

async function route(req: Request, env: Env, url: URL, lang: Lang) {
  const from = lonLat(url.searchParams.get('from')), to = lonLat(url.searchParams.get('to'));
  if (!from || !to) return json({ ok: false, error: 'bad_points' }, 400);
  if (await limited(env, req, 'r')) return json({ ok: false, error: 'rate_limited' }, 429);
  const b = num(url.searchParams.get('bearing'), 0, 360);
  const u = new URL(`${env.ROUTER_BASE ?? ROUTER}${from[0]},${from[1]};${to[0]},${to[1]}`);
  u.searchParams.set('overview', 'false');
  u.searchParams.set('steps', 'true');
  u.searchParams.set('geometries', 'geojson');
  // When rerouting, start in the direction the car is already driving.
  if (b != null) u.searchParams.set('bearings', `${Math.round(b) % 360},60;`);
  const r = await fetch(u, { headers: { 'user-agent': UA, accept: 'application/json' } });
  const d = (await r.json().catch(() => null)) as { code?: string; routes?: OsrmRoute[] } | null;
  if (!d || d.code !== 'Ok' || !d.routes?.[0]) return json({ ok: false, error: d?.code === 'NoRoute' ? 'no_route' : 'upstream' }, d?.code === 'NoRoute' ? 404 : 502);
  return json({ ok: true, route: buildRoute(d.routes[0], lang) });
}

function asset(path: string): Response | null {
  const a = Object.prototype.hasOwnProperty.call(ASSETS, path) ? ASSETS[path] : undefined;
  if (!a) return null;
  const body = a.b64 != null ? Uint8Array.from(atob(a.b64), (c) => c.charCodeAt(0)) : a.text!;
  return new Response(body, {
    headers: { ...BASE_HEADERS, 'content-type': a.type, 'cache-control': 'public, max-age=604800', 'cross-origin-resource-policy': 'same-origin' },
  });
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    const lang = pickLang(req, url);
    try {
      if (req.method !== 'GET' && req.method !== 'HEAD') return json({ ok: false, error: 'method' }, 405);
      const p = url.pathname;
      if (p === '/') return page(appPage(lang, url.origin));
      if (p === '/icon.svg') return new Response(iconSvg(), { headers: { ...BASE_HEADERS, 'content-type': 'image/svg+xml', 'cache-control': 'public, max-age=86400' } });
      if (p === '/manifest.webmanifest') return new Response(JSON.stringify(manifest(lang)), { headers: { ...BASE_HEADERS, 'content-type': 'application/manifest+json' } });
      if (p.startsWith('/vendor/') || p.startsWith('/fonts/')) return asset(p.slice(1)) ?? json({ ok: false, error: 'not_found' }, 404);
      if (p.startsWith('/api/')) {
        // A custom header makes any cross-site call need a CORS preflight, which is never granted.
        if (req.headers.get('x-hn') !== '1') return json({ ok: false, error: 'forbidden' }, 403);
        if (p === '/api/search') return await search(req, env, url, lang, ctx);
        if (p === '/api/route') return await route(req, env, url, lang);
      }
      return json({ ok: false, error: 'not_found' }, 404);
    } catch (e) {
      console.error('heynav error', p0(url), e instanceof Error ? e.message : String(e));
      return json({ ok: false, error: 'server' }, 500);
    }
  },
};

const p0 = (u: URL) => u.pathname;
