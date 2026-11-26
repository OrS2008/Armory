/**
 * HeyNav: turn-by-turn navigation for the car's browser.
 *
 * The Worker serves the app and proxies address search (Photon) and routing
 * (OSRM): the browser never talks to those services directly, so they don't see
 * the driver's IP, requests carry an honest User-Agent, and there is a per-IP
 * limit in front of them. Map tiles come straight from OpenFreeMap.
 * Live traffic (TomTom) and speed cameras are optional extras on top.
 */
import { ASSETS } from './assets.gen';
import { buildRoute, type OsrmRoute } from './guidance';
import { pickLang, type Lang } from './i18n';
import { appPage, iconSvg, manifest } from './page';
import { FOREIGN, attachLanes, lonLat, nearFirst, preferReadable, placeFromNominatim, placeFromPhoton, rank, type NominatimHit, type PhotonFeature, type Place, type RouteOut } from './api';
import { getCameras } from './cameras';
import { incidents, timeRoute, trafficTile } from './traffic';
import { fuelOnRoute, fuelTomTom } from './fuel';
import { placeInfo, placePhoto } from './place';
import { FUELS, official, pricesAt, setPrice, validPrice, type Fuel } from './prices';
import { areasOnRoute, valhallaRoutes } from './valhalla';
import { KINDS, addReport, listReports, vote, type Kind } from './reports';

export interface Env {
  RL_API?: RateLimit;
  ROUTER_BASE?: string;  // dev/tests only
  SEARCH_BASE?: string;  // dev/tests only
  NOMINATIM_BASE?: string; // dev/tests only
  TOMTOM_KEY?: string;   // secret: enables live traffic
  TOMTOM_BASE?: string;  // dev/tests only
  CAMERAS_URL?: string;  // dev/tests only
  VALHALLA_BASE?: string; // dev/tests only
  OVERPASS_BASE?: string; // dev/tests only
  REPORTS?: KVNamespace; // driver reports
  RL_REPORT?: RateLimit;
}

const ROUTER = 'https://router.project-osrm.org/route/v1/driving/';
const SEARCH = 'https://photon.komoot.io/api/';
const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
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
  const key = new Request(`https://cache.heynav/search/v4?${u.searchParams}`);
  const hit = cache ? await cache.match(key) : undefined;
  if (hit) return json(await hit.json(), 200, 'private, max-age=300');

  // Photon's origin intermittently refuses Workers traffic (HTTP 521): retry a couple
  // of times, then fall back to Nominatim (OpenStreetMap's own geocoder).
  let places: Place[] | null = null;
  for (let attempt = 0; attempt < 3 && !places; attempt++) {
    if (attempt) await new Promise((res) => setTimeout(res, attempt * 200));
    const r = await fetch(u, { headers: { 'user-agent': UA, accept: 'application/json' } }).catch(() => null);
    if (r?.ok) {
      let feats = ((await r.json()) as { features?: PhotonFeature[] }).features ?? [];
      // Hebrew user abroad: local names in another script get their English version
      if (lang === 'he' && feats.some((f) => FOREIGN.test(JSON.stringify(f.properties)))) {
        const ue = new URL(u);
        ue.searchParams.set('lang', 'en');
        const re = await fetch(ue, { headers: { 'user-agent': UA, accept: 'application/json' } }).catch(() => null);
        if (re?.ok) feats = preferReadable(feats, ((await re.json()) as { features?: PhotonFeature[] }).features ?? []);
      }
      places = feats.map(placeFromPhoton);
    } else console.error('search: photon', r?.status ?? 'network');
  }
  if (!places) places = await nominatim(env, q, lang, lat, lon);
  if (!places) return json({ ok: false, error: 'upstream' }, 502);
  const seen = new Set<string>();
  places = places.filter((p) => {
    const k = `${p.name}|${p.detail}`;
    if (!p.name || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const body = { ok: true, places: lat != null && lon != null ? nearFirst(places, lat, lon) : places };
  if (cache) ctx.waitUntil(cache.put(key, new Response(JSON.stringify(body), { headers: { 'cache-control': 'max-age=86400' } })));
  return json(body, 200, 'private, max-age=300');
}

async function nominatim(env: Env, q: string, lang: Lang, lat: number | null, lon: number | null): Promise<Place[] | null> {
  const u = new URL(env.NOMINATIM_BASE ?? NOMINATIM);
  u.searchParams.set('q', q);
  u.searchParams.set('format', 'jsonv2');
  u.searchParams.set('limit', '7');
  u.searchParams.set('addressdetails', '1');
  u.searchParams.set('accept-language', lang === 'he' ? 'he,en' : 'en,he');
  if (lat != null && lon != null) u.searchParams.set('viewbox', `${(lon - 0.6).toFixed(2)},${(lat + 0.6).toFixed(2)},${(lon + 0.6).toFixed(2)},${(lat - 0.6).toFixed(2)}`);
  const r = await fetch(u, { headers: { 'user-agent': UA, accept: 'application/json' } }).catch(() => null);
  if (!r?.ok) { console.error('search: nominatim', r?.status ?? 'network'); return null; }
  return ((await r.json()) as NominatimHit[]).map(placeFromNominatim);
}

async function route(req: Request, env: Env, url: URL, lang: Lang) {
  const from = lonLat(url.searchParams.get('from')), to = lonLat(url.searchParams.get('to'));
  if (!from || !to) return json({ ok: false, error: 'bad_points' }, 400);
  if (await limited(env, req, 'r')) return json({ ok: false, error: 'rate_limited' }, 429);
  const b = num(url.searchParams.get('bearing'), 0, 360);
  const viaRaw = url.searchParams.get('via');
  const via = viaRaw ? lonLat(viaRaw) : null;
  if (viaRaw && !via) return json({ ok: false, error: 'bad_points' }, 400);
  const avoid = new Set((url.searchParams.get('avoid') ?? '').split(','));
  const o = { tolls: avoid.has('tolls'), areas: avoid.has('areas') };
  let routes: RouteOut[] | null = null;
  let router = 'osrm';
  if (o.tolls || o.areas) {
    routes = await valhallaRoutes(from, to, lang, o, UA, b, env.VALHALLA_BASE, via).catch((e) => { console.error('valhalla', String(e)); return null; });
    if (routes) router = 'valhalla';
  }
  if (!routes) {
    const osrm = await osrmRoutes(env, from, to, lang, b, via);
    if ('error' in osrm) return json({ ok: false, error: osrm.error }, osrm.status);
    routes = osrm.routes.map((r) => ({ ...r, areas: areasOnRoute(r.geometry, via ? [from, via, to] : [from, to]) }));
  }
  return await finish(env, routes, router, o);
}

async function osrmRoutes(env: Env, from: [number, number], to: [number, number], lang: Lang, b: number | null, via: [number, number] | null = null): Promise<{ routes: RouteOut[] } | { error: string; status: number }> {
  const pts = via ? [from, via, to] : [from, to];
  const u = new URL(`${env.ROUTER_BASE ?? ROUTER}${pts.map((x) => `${x[0]},${x[1]}`).join(';')}`);
  u.searchParams.set('overview', 'false');
  u.searchParams.set('steps', 'true');
  u.searchParams.set('geometries', 'geojson');
  // When rerouting, start in the direction the car is already driving.
  if (b != null) u.searchParams.set('bearings', `${Math.round(b) % 360},60` + ';'.repeat(pts.length - 1));
  u.searchParams.set('alternatives', '3');
  const r = await fetch(u, { headers: { 'user-agent': UA, accept: 'application/json' } });
  const d = (await r.json().catch(() => null)) as { code?: string; routes?: OsrmRoute[] } | null;
  if (!d || d.code !== 'Ok' || !d.routes?.[0]) return { error: d?.code === 'NoRoute' ? 'no_route' : 'upstream', status: d?.code === 'NoRoute' ? 404 : 502 };
  return { routes: d.routes.slice(0, 3).map((x) => buildRoute(x, lang)) };
}

/** Times every candidate with traffic (when available), then ranks fastest / shortest. */
async function finish(env: Env, routes: RouteOut[], router: string, o: { tolls: boolean; areas: boolean }) {
  const key = env.TOMTOM_KEY;
  if (key) {
    const times = await Promise.all(routes.map((x) => timeRoute(key, x.geometry, env.TOMTOM_BASE).catch(() => null)));
    // `live` is true only when the provider reports an actual delay right now; otherwise the
    // time reflects typical traffic for this hour (TomTom has no live feed for Israel).
    times.forEach((t, i) => {
      if (!t) return;
      routes[i]!.traffic = { seconds: Math.round(t.seconds), delay: Math.round(t.delay), live: t.delay > 0 };
      attachLanes(routes[i]!, t.lanes);
    });
  }
  const { best, shortest } = rank(routes);
  return json({ ok: true, routes, best, shortest, router, avoid: o, traffic: routes.some((x) => !!x.traffic), route: routes[best] });
}

/** Fuel stations near the route the driver is on (OpenStreetMap, via Overpass). */
async function fuel(req: Request, env: Env, url: URL, lang: Lang) {
  const raw = (url.searchParams.get('line') ?? '').split(';');
  if (raw.length < 2 || raw.length > 160) return json({ ok: false, error: 'bad_line' }, 400);
  const line: [number, number][] = [];
  for (const x of raw) { const p = lonLat(x); if (!p) return json({ ok: false, error: 'bad_line' }, 400); line.push(p); }
  if (await limited(env, req, 'f')) return json({ ok: false, error: 'rate_limited' }, 429);
  try {
    let stations = env.TOMTOM_KEY ? await fuelTomTom(env.TOMTOM_KEY, line, lang, env.TOMTOM_BASE).catch((e) => { console.error('fuel tomtom', String(e)); return null; }) : null;
    const source = stations ? 'TomTom' : 'OpenStreetMap';
    stations ??= await fuelOnRoute(line, lang, UA, env.OVERPASS_BASE);
    return json({ ok: true, stations, source }, 200, 'private, max-age=600');
  } catch (e) {
    console.error('fuel', e instanceof Error ? e.message : String(e));
    return json({ ok: false, error: 'upstream' }, 502);
  }
}

/** Fuel prices: read for a few stations (GET), or a driver reports what the sign says (POST). */
async function prices(req: Request, env: Env, url: URL, p: string) {
  const kv = env.REPORTS;
  if (req.method === 'GET' && p === '/api/prices') {
    const raw = (url.searchParams.get('pts') ?? '').split(';').filter(Boolean);
    if (raw.length > 30) return json({ ok: false, error: 'too_many' }, 400);
    const pts: [number, number][] = [];
    for (const x of raw) { const q = lonLat(x); if (!q) return json({ ok: false, error: 'bad_points' }, 400); pts.push(q); }
    const list = kv && pts.length ? await pricesAt(kv, pts) : pts.map(() => null);
    if (!list) return json({ ok: false, error: 'too_many' }, 400);
    return json({ ok: true, prices: list, official: official(), now: Date.now() }, 200, 'private, max-age=30');
  }
  if (req.method !== 'POST' || p !== '/api/price' || !kv) return json({ ok: false, error: 'method' }, 405);
  if (req.headers.get('origin') !== url.origin) return json({ ok: false, error: 'forbidden' }, 403);
  if (env.RL_REPORT) {
    const { success } = await env.RL_REPORT.limit({ key: req.headers.get('cf-connecting-ip') ?? 'local' });
    if (!success) return json({ ok: false, error: 'rate_limited' }, 429);
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || JSON.stringify(body).length > 300) return json({ ok: false, error: 'bad_body' }, 400);
  const lon = Number(body.lon), lat = Number(body.lat);
  if (!(Math.abs(lon) <= 180 && Math.abs(lat) <= 90)) return json({ ok: false, error: 'bad_point' }, 400);
  const got: Partial<Record<Fuel, number>> = {};
  for (const f of FUELS) {
    if (body[f] == null || body[f] === '') continue;
    if (!validPrice(f, body[f])) return json({ ok: false, error: 'bad_price', fuel: f }, 400);
    got[f] = body[f] as number;
  }
  if (!Object.keys(got).length) return json({ ok: false, error: 'no_price' }, 400);
  return json({ ok: true, station: await setPrice(kv, lon, lat, got) });
}

/** Card details for a tapped place (TomTom), cached a day at the edge. */
async function place(req: Request, env: Env, url: URL, lang: Lang, ctx: ExecutionContext) {
  const at = lonLat(url.searchParams.get('at'));
  const name = (url.searchParams.get('name') ?? '').slice(0, 80);
  if (!at) return json({ ok: false, error: 'bad_point' }, 400);
  if (!env.TOMTOM_KEY) return json({ ok: true, place: null });
  if (await limited(env, req, 'p')) return json({ ok: false, error: 'rate_limited' }, 429);
  const cache = (globalThis as { caches?: { default: Cache } }).caches?.default;
  const ck = new Request(`https://cache.heynav/place/v2/${lang}/${at[0].toFixed(5)},${at[1].toFixed(5)}/${encodeURIComponent(name)}`);
  const hit = cache ? await cache.match(ck) : undefined;
  if (hit) { const d = (await hit.json()) as unknown; return json(d, 200, 'private, max-age=600'); }
  try {
    const body = { ok: true, place: await placeInfo(env.TOMTOM_KEY, at, name, lang, env.TOMTOM_BASE) };
    // opening hours go stale: cache an hour
    if (cache) ctx.waitUntil(cache.put(ck, new Response(JSON.stringify(body), { headers: { 'cache-control': 'max-age=3600' } })));
    return json(body, 200, 'private, max-age=600');
  } catch (e) {
    console.error('place', e instanceof Error ? e.message : String(e));
    return json({ ok: true, place: null });
  }
}

async function photo(req: Request, env: Env, url: URL) {
  const id = url.searchParams.get('id') ?? '';
  if (!env.TOMTOM_KEY || !/^[\w-]{6,80}$/.test(id)) return new Response(null, { status: 404, headers: BASE_HEADERS });
  // only our own pages may embed these
  const site = req.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin') return new Response(null, { status: 403, headers: BASE_HEADERS });
  if (await limited(env, req, 'ph')) return new Response(null, { status: 429, headers: BASE_HEADERS });
  const r = await placePhoto(env.TOMTOM_KEY, id, env.TOMTOM_BASE);
  const h = new Headers(r.headers);
  for (const [k, v] of Object.entries(BASE_HEADERS)) h.set(k, v);
  h.set('cross-origin-resource-policy', 'same-origin');
  return new Response(r.body, { status: r.status, headers: h });
}

// ---------------------------------------------------------------- driver reports
async function reports(req: Request, env: Env, url: URL, p: string) {
  const kv = env.REPORTS;
  if (!kv) return json({ ok: false, error: 'no_reports' }, 404);
  if (req.method === 'GET' && p === '/api/reports') {
    const bb = (url.searchParams.get('bbox') ?? '').split(',').map(Number);
    if (bb.length !== 4 || bb.some((v) => !Number.isFinite(v))) return json({ ok: false, error: 'bad_bbox' }, 400);
    const [w, s, e, n] = bb as [number, number, number, number];
    if (e < w || n < s) return json({ ok: false, error: 'bad_bbox' }, 400);
    const list = await listReports(kv, w, s, e, n);
    if (!list) return json({ ok: false, error: 'bbox_too_large' }, 400);
    return json({ ok: true, reports: list, now: Date.now() }, 200, 'private, max-age=20');
  }
  if (req.method !== 'POST') return json({ ok: false, error: 'method' }, 405);
  // Writes: same-origin only, and a tight per-IP limit.
  if (req.headers.get('origin') !== url.origin) return json({ ok: false, error: 'forbidden' }, 403);
  if (env.RL_REPORT) {
    const { success } = await env.RL_REPORT.limit({ key: req.headers.get('cf-connecting-ip') ?? 'local' });
    if (!success) return json({ ok: false, error: 'rate_limited' }, 429);
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || JSON.stringify(body).length > 400) return json({ ok: false, error: 'bad_body' }, 400);
  const lon = Number(body.lon), lat = Number(body.lat);
  if (!(Math.abs(lon) <= 180 && Math.abs(lat) <= 90)) return json({ ok: false, error: 'bad_point' }, 400);
  if (p === '/api/report') {
    const kind = String(body.kind) as Kind;
    if (!KINDS.includes(kind)) return json({ ok: false, error: 'bad_kind' }, 400);
    const h = body.h == null ? null : Number(body.h);
    const r = await addReport(kv, kind, lon, lat, h != null && Number.isFinite(h) ? ((h % 360) + 360) % 360 : null);
    return json({ ok: true, report: r });
  }
  if (p === '/api/report/vote') {
    const id = String(body.id ?? '');
    if (!/^[0-9a-f]{12}$/.test(id)) return json({ ok: false, error: 'bad_id' }, 400);
    const r = await vote(kv, id, lon, lat, body.up === true);
    return r ? json({ ok: true, report: r }) : json({ ok: false, error: 'not_found' }, 404);
  }
  return json({ ok: false, error: 'not_found' }, 404);
}

async function cameras(ctx: ExecutionContext, env: Env) {
  try {
    const d = await getCameras(ctx, env.CAMERAS_URL);
    return json({ ok: true, ...d }, 200, 'private, max-age=1800');
  } catch (e) {
    console.error('cameras', e instanceof Error ? e.message : String(e));
    return json({ ok: false, error: 'cameras_unavailable' }, 502);
  }
}

async function traffic(req: Request, env: Env, url: URL, parts: string[]) {
  if (!env.TOMTOM_KEY) return json({ ok: false, error: 'no_traffic' }, 404);
  const [z, x, yPng] = parts;
  const y = (yPng ?? '').replace(/\.png$/, '');
  if (![z, x, y].every((v) => /^\d{1,7}$/.test(v ?? '')) || Number(z) > 22) return json({ ok: false, error: 'bad_tile' }, 400);
  const r = await trafficTile(env.TOMTOM_KEY, Number(z), Number(x), Number(y), url.searchParams.get('dark') === '1', env.TOMTOM_BASE);
  const h = new Headers(r.headers);
  for (const [k, v] of Object.entries(BASE_HEADERS)) h.set(k, v);
  void req;
  return new Response(r.body, { status: r.status, headers: h });
}

async function incidentList(req: Request, env: Env, url: URL) {
  if (!env.TOMTOM_KEY) return json({ ok: true, incidents: [] });
  const b = (url.searchParams.get('bbox') ?? '').split(',').map(Number);
  if (b.length !== 4 || b.some((v) => !Number.isFinite(v))) return json({ ok: false, error: 'bad_bbox' }, 400);
  const [w, s, e, n] = b as [number, number, number, number];
  // TomTom caps the area; also keeps one request from asking for half a country.
  if (e <= w || n <= s || (e - w) * (n - s) > 0.8) return json({ ok: false, error: 'bbox_too_large' }, 400);
  if (await limited(env, req, 'i')) return json({ ok: false, error: 'rate_limited' }, 429);
  try {
    return json({ ok: true, incidents: await incidents(env.TOMTOM_KEY, [w, s, e, n], env.TOMTOM_BASE) }, 200, 'private, max-age=60');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('incidents', msg);
    return json({ ok: false, error: 'upstream', detail: msg.replace(/key=[^&\s]+/g, 'key=…') }, 502);
  }
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
      const p = url.pathname;
      const isReportWrite = req.method === 'POST' && (p === '/api/report' || p === '/api/report/vote' || p === '/api/price');
      if (req.method !== 'GET' && req.method !== 'HEAD' && !isReportWrite) return json({ ok: false, error: 'method' }, 405);
      if (p === '/') return page(appPage(lang, url.origin));
      if (p === '/icon.svg') return new Response(iconSvg(), { headers: { ...BASE_HEADERS, 'content-type': 'image/svg+xml', 'cache-control': 'public, max-age=86400' } });
      if (p === '/manifest.webmanifest') return new Response(JSON.stringify(manifest(lang)), { headers: { ...BASE_HEADERS, 'content-type': 'application/manifest+json' } });
      if (p.startsWith('/vendor/') || p.startsWith('/fonts/')) return asset(p.slice(1)) ?? json({ ok: false, error: 'not_found' }, 404);
      if (p === '/api/place/photo') return await photo(req, env, url);
      if (p.startsWith('/api/')) {
        // A custom header makes any cross-site call need a CORS preflight, which is never granted.
        if (req.headers.get('x-hn') !== '1') return json({ ok: false, error: 'forbidden' }, 403);
        if (p === '/api/search') return await search(req, env, url, lang, ctx);
        if (p === '/api/route') return await route(req, env, url, lang);
        // trafficLayer: TomTom's flow tiles come back empty for Israel, so the layer is off.
        if (p === '/api/config') return json({ ok: true, traffic: !!env.TOMTOM_KEY, trafficLayer: false, reports: !!env.REPORTS });
        if (p === '/api/reports' || p === '/api/report' || p === '/api/report/vote') return await reports(req, env, url, p);
        if (p === '/api/cameras') return await cameras(ctx, env);
        if (p === '/api/fuel') return await fuel(req, env, url, lang);
        if (p === '/api/prices' || p === '/api/price') return await prices(req, env, url, p);
        if (p === '/api/place') return await place(req, env, url, lang, ctx);
        if (p === '/api/incidents') return await incidentList(req, env, url);
        if (p.startsWith('/api/traffic/')) return await traffic(req, env, url, p.slice(13).split('/'));
      }
      return json({ ok: false, error: 'not_found' }, 404);
    } catch (e) {
      console.error('heynav error', p0(url), e instanceof Error ? e.message : String(e));
      return json({ ok: false, error: 'server' }, 500);
    }
  },
};

const p0 = (u: URL) => u.pathname;
