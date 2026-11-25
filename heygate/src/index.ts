import qrcode from 'qrcode-generator';
import { accessEnabled, verifyAccess } from './access';
import {
  clearCookie,
  cookie,
  createSession,
  destroySession,
  DEVICE_COOKIE,
  getOwner,
  getSuper,
  lockedOut,
  newRecoveryCode,
  normalizeRecovery,
  PAIR_COOKIE,
  putOwner,
  putSuper,
  readCookie,
  recordFailure,
  sameOrigin,
  superSession,
  tenantSession,
  type OwnerRecord,
  type Role,
} from './auth';
import { randomBytes, randomToken, safeEqual, sha256 } from './crypto';
import { clientMeta, html, json, readJson, text, type ClientMeta } from './http';
import { appAuthPage, appPage, carPage, iconSvg, landingPage, manifest, pairPage, privacyPage, resultPage, saAuthPage, saPage } from './pages';
import { authenticationOptions, registrationOptions, verifyAuthentication, verifyRegistration, type AuthPurpose } from './passkeys';
import { checkToken, listDevices, openGate, waitForLink } from './palgate/api';
import {
  addLog,
  bump,
  count,
  deleteTenant,
  freshConfig,
  getConfig,
  getLog,
  getMeta,
  getPlatform,
  getSealed,
  getSession,
  indexChannel,
  ixDel,
  ixGet,
  ixPut,
  listTenants,
  newChannel,
  putConfig,
  putMeta,
  putPlatform,
  putSealed,
  putSession,
  tBump,
  tCount,
  tenant,
  touch,
  tRaw,
  unindexChannel,
  type Channel,
  type ChannelKind,
  type Config,
  type Env,
  type Gate,
  type RateLimiter,
  type Tenant,
} from './store';

export type { Env, Gate, Config, Channel };

const MAX_OPENS_PER_HOUR = 100; // per tenant
const BAD_SECRET_LIMIT = 20; // per IP per hour
const SECRET_RE = /^[A-Za-z0-9_-]{32}$/;
const ALIAS_RE = /^[a-z0-9-]{1,24}$/;
const PAIR_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const DEVICE_TTL = 365 * 86400;
const PREVIEW_BOTS =
  /facebookexternalhit|facebot|whatsapp|telegrambot|slackbot|twitterbot|discordbot|linkedinbot|skypeuripreview|redditbot|embedly|pinterest|googlebot|bingbot|yandex|baiduspider|duckduckbot|applebot/i;

const hour = () => new Date().toISOString().slice(0, 13);
const day = () => new Date().toISOString().slice(0, 10);
const ref = () => randomToken(4).toUpperCase();
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const clamp = (v: unknown, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.floor(Number(v)) || lo));
const maskPhone = (p: number) => String(p).slice(0, 5) + '•••' + String(p).slice(-3);

async function allowed(rl: RateLimiter | undefined, key: string) {
  if (!rl) return true;
  try {
    return (await rl.limit({ key })).success;
  } catch {
    return true;
  }
}

async function quietly(p: Promise<unknown>) {
  try {
    await p;
  } catch (e) {
    console.error('non-critical write failed', e);
  }
}

function notify(ctx: ExecutionContext, cfg: Config | null, message: string) {
  const url = cfg?.notifyUrl;
  if (!url) return;
  ctx.waitUntil(
    fetch(url, { method: 'POST', body: message, headers: { Title: 'HeyGate', Tags: 'door' } }).then(
      () => undefined,
      () => undefined,
    ),
  );
}

async function audit(t: Tenant, ctx: ExecutionContext, cfg: Config | null, m: ClientMeta, detail: string, alert = false) {
  await addLog(t, { kind: 'admin', ok: true, detail, ip: m.ip, country: m.country });
  if (alert) notify(ctx, cfg, `🔐 ${detail} (${m.country}, ${m.ip})`);
}

function qrSvg(data: string) {
  const qr = qrcode(0, 'M');
  qr.addData(data);
  qr.make();
  return qr.createSvgTag({ cellSize: 6, margin: 4, scalable: true });
}

const tooMany = (seconds: number) =>
  json({ ok: false, message: 'יותר מדי ניסיונות', retryAfter: seconds }, 429, { 'retry-after': String(seconds) });

// ================================================================ opening

export type OpenResult = { ok: true; gate: Gate; repeated: boolean } | { ok: false; status: number; message: string };

async function performOpen(
  t: Tenant,
  ctx: ExecutionContext,
  cfg: Config,
  alias: string | undefined,
  who: { channel?: Channel; label: string },
  m: ClientMeta,
): Promise<OpenResult> {
  const deny = async (status: number, message: string, gate?: string, detail = message) => {
    await addLog(t, { kind: 'denied', ok: false, gate, channel: who.label, ip: m.ip, country: m.country, detail });
    return { ok: false as const, status, message };
  };

  if (!cfg.enabled) return deny(423, 'Opening is switched off');
  const ch = who.channel;
  if (ch) {
    if (!ch.enabled) return deny(403, 'This access is disabled');
    if (ch.countries.length && !ch.countries.includes(m.country)) {
      notify(ctx, cfg, `⚠️ ניסיון פתיחה נחסם: ${ch.name} מ-${m.country} (${m.ip})`);
      return deny(403, 'Not allowed from this location', undefined, `country ${m.country}`);
    }
    if (ch.kind === 'grok' && ch.requireArm && !(await tRaw.get(t, `arm:${ch.id}`))) {
      notify(ctx, cfg, `⚠️ Grok ביקש לפתוח כשהמערכת לא דרוכה (${m.country})`);
      return deny(403, 'Not armed. Arm it from your phone first', undefined, 'not armed');
    }
  }

  const session = await getSession(t);
  if (!session) return deny(503, 'Not set up yet', undefined, 'PalGate not linked');
  const gate = alias ? cfg.gates.find((g) => g.alias === alias) : cfg.gates[0];
  if (!gate) return deny(404, 'No gate configured');

  const last = Number(await tRaw.get(t, `last:${gate.alias}`));
  if (last && Date.now() - last < cfg.cooldownSec * 1000) return { ok: true, gate, repeated: true };

  if (ch && (await tCount(t, `cnt:${ch.id}:${hour()}`)) >= ch.maxPerHour) {
    notify(ctx, cfg, `⚠️ ${ch.name}: הגיע למגבלת הפתיחות לשעה`);
    return deny(429, 'Hourly limit reached', gate.alias);
  }
  if ((await tCount(t, `cnt:all:${hour()}`)) >= MAX_OPENS_PER_HOUR) return deny(429, 'Hourly limit reached', gate.alias, 'global cap');

  try {
    await openGate(session, gate.deviceId, gate.output);
  } catch (e) {
    const r = ref();
    return deny(502, `Gate service error (ref ${r})`, gate.alias, `ref ${r}: ${e instanceof Error ? e.message : String(e)}`);
  }

  await Promise.all([
    quietly(tRaw.put(t, `last:${gate.alias}`, String(Date.now()), 60)),
    quietly(tBump(t, `cnt:all:${hour()}`, 7200)),
    addLog(t, { kind: 'open', ok: true, gate: gate.alias, channel: who.label, ip: m.ip, country: m.country }),
    quietly(touch(t.env, t.id)),
    ...(ch
      ? [
          quietly(tBump(t, `cnt:${ch.id}:${hour()}`, 7200)),
          quietly(putConfig(t, { ...cfg, channels: cfg.channels.map((c) => (c.id === ch.id ? { ...c, lastUsedAt: new Date().toISOString() } : c)) })),
        ]
      : []),
  ]);
  notify(ctx, cfg, `🚪 ${gate.label || gate.alias} נפתח — ${who.label} (${m.country})`);
  return { ok: true, gate, repeated: false };
}

/** Link secret → (tenant, channel), via the hash index; wrong guesses are throttled per IP. */
async function resolveSecret(env: Env, secret: string, m: ClientMeta) {
  if ((await count(env, `bad:${m.ip}`)) >= BAD_SECRET_LIMIT) return { throttled: true as const };
  const miss = async () => {
    await bump(env, `bad:${m.ip}`, 3600);
    return { found: null };
  };
  if (!SECRET_RE.test(secret)) return miss();
  const ix = await ixGet(env, 'sec', secret);
  if (!ix?.ch) return miss();
  const meta = await getMeta(env, ix.tid);
  if (!meta || meta.status !== 'active') return miss();
  const t = await tenant(env, ix.tid);
  const cfg = await getConfig(t);
  const channel = cfg.channels.find((c) => c.id === ix.ch && c.kind !== 'car' && c.secret && safeEqual(c.secret, secret));
  if (!channel) return miss();
  return { found: { t, cfg, channel } };
}

async function deviceChannel(req: Request, env: Env) {
  const token = readCookie(req, DEVICE_COOKIE);
  if (!token) return null;
  const h = await sha256(token);
  const ix = await ixGet(env, 'dev', h, true);
  if (!ix?.ch) return null;
  const meta = await getMeta(env, ix.tid);
  if (!meta || meta.status !== 'active') return null;
  const t = await tenant(env, ix.tid);
  const cfg = await getConfig(t);
  const channel = cfg.channels.find((c) => c.id === ix.ch && c.kind === 'car' && c.deviceHash && safeEqual(c.deviceHash, h));
  return channel ? { t, cfg, channel } : null;
}

// ================================================================ router

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    const parts = url.pathname.split('/').filter(Boolean);
    const m = clientMeta(req);

    if (url.protocol === 'http:' && !['localhost', '127.0.0.1'].includes(url.hostname)) {
      return Response.redirect(url.toString().replace(/^http:/, 'https:'), 301);
    }
    if (url.pathname === '/robots.txt') return text('User-agent: *\nAllow: /\n');
    if (url.pathname === '/manifest.webmanifest') return new Response(manifest(), { headers: { 'content-type': 'application/manifest+json' } });
    if (url.pathname === '/icon.svg') return new Response(iconSvg(), { headers: { 'content-type': 'image/svg+xml', 'cache-control': 'public, max-age=86400' } });
    if (!env.ENC_KEY || !env.SETUP_CODE) return text('Service unavailable', 503);
    if (url.pathname.length > 200 || url.search.length > 300) return text('Bad request', 400);

    try {
      const top = parts[0] ?? '';
      if (top === '' && req.method === 'GET') return html(landingPage((await getPlatform(env)).signupsOpen));
      if (top === 'privacy' && req.method === 'GET') return html(privacyPage());
      if (top === 'admin') return Response.redirect(new URL('/app', url).toString(), 301);
      if (top === 'app') {
        if (!(await allowed(env.RL_ADMIN, m.ip))) return text('Too many requests', 429);
        return await appRoute(req, env, ctx, url, parts.slice(1), m);
      }
      if (top === 'sa') {
        if (!(await allowed(env.RL_ADMIN, m.ip))) return text('Too many requests', 429);
        if (accessEnabled(env) && !(await verifyAccess(req, env))) return text('Cloudflare Access required', 403);
        return await saRoute(req, env, url, parts.slice(1), m);
      }
      if (['o', 'arm', 'car'].includes(top)) {
        if (!(await allowed(env.RL_PUBLIC, m.ip))) return text('Too many requests', 429);
        if (top === 'o' && parts[1] && parts.length <= 4) return await openRoute(req, env, ctx, url, parts, m);
        if (top === 'arm' && parts[1] && parts.length === 2) return await armRoute(req, env, parts[1], m);
        if (top === 'car') return await carRoute(req, env, ctx, url, parts.slice(1), m);
      }
    } catch (e) {
      const r = ref();
      console.error(`ref ${r}`, e);
      return json({ ok: false, message: `Internal error (ref ${r})` }, 500);
    }
    return text('Not found', 404);
  },
} satisfies ExportedHandler<Env>;

// ================================================================ public: links, arming, devices

async function openRoute(req: Request, env: Env, ctx: ExecutionContext, url: URL, parts: string[], m: ClientMeta) {
  const r = await resolveSecret(env, parts[1]!, m);
  if ('throttled' in r) return text('Too many requests', 429);
  if (!r.found) return html(resultPage({ ok: false, message: 'Not found' }), 404);
  const { t, cfg, channel } = r.found;
  if (req.method === 'HEAD' || req.method === 'OPTIONS') return new Response(null, { status: 204 });
  if (PREVIEW_BOTS.test(m.ua)) return html(resultPage({ ok: false, message: 'Preview fetch ignored' }), 403);
  if (channel.kind !== 'grok' && req.method !== 'POST') return html(resultPage({ ok: false, message: 'Use POST' }), 405);
  if (req.method !== 'GET' && req.method !== 'POST') return text('Method not allowed', 405);

  const alias = parts[2] && ALIAS_RE.test(parts[2]) && cfg.gates.some((g) => g.alias === parts[2]) ? parts[2] : undefined;
  const res = await performOpen(t, ctx, cfg, alias, { channel, label: channel.name }, m);
  const wantsJson = url.searchParams.has('json') || (req.headers.get('accept') ?? '').includes('application/json');
  if (wantsJson) return json(res.ok ? { ok: true, gate: res.gate.label, repeated: res.repeated } : res, res.ok ? 200 : res.status);
  return html(
    resultPage(res.ok ? { ok: true, label: res.gate.label, repeated: res.repeated } : { ok: false, message: res.message }),
    res.ok ? 200 : res.status,
  );
}

async function armGrok(t: Tenant, cfg: Config) {
  let minutes = 0;
  for (const c of cfg.channels.filter((x) => x.kind === 'grok' && x.requireArm)) {
    minutes = Math.max(minutes, c.armMinutes ?? 10);
    await tRaw.put(t, `arm:${c.id}`, '1', (c.armMinutes ?? 10) * 60);
  }
  return minutes;
}

async function armRoute(req: Request, env: Env, secret: string, m: ClientMeta) {
  const r = await resolveSecret(env, secret, m);
  if ('throttled' in r) return text('Too many requests', 429);
  if (!r.found || r.found.channel.kind !== 'phone') return json({ ok: false, message: 'Not found' }, 404);
  const { t, cfg, channel } = r.found;
  if (req.method !== 'POST') return json({ ok: false, message: 'Use POST' }, 405);
  if (!channel.enabled || !cfg.enabled) return json({ ok: false, message: 'Disabled' }, 403);
  if (channel.countries.length && !channel.countries.includes(m.country)) return json({ ok: false, message: 'Not allowed from this location' }, 403);
  const minutes = await armGrok(t, cfg);
  await addLog(t, { kind: 'admin', ok: true, detail: `Grok armed for ${minutes} min by ${channel.name}`, ip: m.ip, country: m.country });
  return json({ ok: true, armedMinutes: minutes });
}

interface PairRecord {
  nonceHash: string;
  status: 'pending' | 'approved';
  token?: string;
}

async function carRoute(req: Request, env: Env, ctx: ExecutionContext, url: URL, parts: string[], m: ClientMeta) {
  const route = `${req.method} /${parts.join('/')}`;
  if (route === 'GET /') {
    const dev = await deviceChannel(req, env);
    if (dev) return html(carPage(dev.cfg.gates, dev.channel.enabled && dev.cfg.enabled, dev.channel.name));
    return html(pairPage());
  }
  if (req.method !== 'POST' || !sameOrigin(req, url)) return json({ ok: false, message: 'Forbidden' }, 403);

  if (route === 'POST /pair/start') {
    if (!(await allowed(env.RL_AUTH, m.ip))) return json({ ok: false, message: 'Too many requests' }, 429);
    const code = Array.from(randomBytes(6), (b) => PAIR_ALPHABET[b % 32]).join('');
    const nonce = randomToken(24);
    await putSealed(env, `pair:${code}`, { nonceHash: await sha256(nonce), status: 'pending' } satisfies PairRecord, 600);
    return json({ ok: true, code, expiresIn: 600 }, 200, { 'set-cookie': cookie(PAIR_COOKIE, nonce, 600) });
  }
  if (route === 'POST /pair/status') {
    const { code } = await readJson<{ code: string }>(req);
    const nonce = readCookie(req, PAIR_COOKIE);
    if (typeof code !== 'string' || !/^[A-Z2-9]{6}$/.test(code) || !nonce) return json({ ok: false, message: 'Bad request' }, 400);
    const rec = await getSealed<PairRecord>(env, `pair:${code}`);
    if (!rec || !safeEqual(rec.nonceHash, await sha256(nonce))) return json({ ok: false, message: 'expired' }, 410);
    if (rec.status !== 'approved' || !rec.token) return json({ ok: true, done: false });
    await env.GATE.delete(`pair:${code}`);
    return json({ ok: true, done: true }, 200, { 'set-cookie': cookie(DEVICE_COOKIE, rec.token, DEVICE_TTL) });
  }
  if (route === 'POST /open') {
    const dev = await deviceChannel(req, env);
    if (!dev) return json({ ok: false, message: 'This device is not paired' }, 401);
    const { alias } = await readJson<{ alias: string }>(req);
    const a = typeof alias === 'string' && ALIAS_RE.test(alias) ? alias : undefined;
    const res = await performOpen(dev.t, ctx, dev.cfg, a, { channel: dev.channel, label: dev.channel.name }, m);
    return json(res.ok ? { ok: true, gate: res.gate.label, repeated: res.repeated } : res, res.ok ? 200 : res.status);
  }
  return json({ ok: false, message: 'not found' }, 404);
}

// ================================================================ shared auth plumbing

async function authGuard(req: Request, env: Env, url: URL, m: ClientMeta): Promise<Response | null> {
  if (req.method !== 'POST') return json({ ok: false, message: 'not found' }, 404);
  if (!sameOrigin(req, url)) return json({ ok: false, message: 'cross-origin request refused' }, 403);
  if (!(await allowed(env.RL_AUTH, m.ip))) return tooMany(60);
  const wait = await lockedOut(env, m);
  return wait ? tooMany(wait) : null;
}

async function failed(env: Env, m: ClientMeta, status: number, message: string) {
  const lock = await recordFailure(env, m);
  return lock ? tooMany(lock) : json({ ok: false, message }, status);
}

// ================================================================ customers (/app)

async function findTenantOwner(env: Env, credId: string) {
  const ix = await ixGet(env, 'cred', credId);
  if (!ix) return null;
  const meta = await getMeta(env, ix.tid);
  if (!meta || meta.status !== 'active') return null;
  const t = await tenant(env, ix.tid);
  const owner = await getOwner(t);
  return owner ? { ...owner, t } : null;
}

async function appRoute(req: Request, env: Env, ctx: ExecutionContext, url: URL, parts: string[], m: ClientMeta): Promise<Response> {
  const route = `${req.method} /${parts.join('/')}`;
  if (route === 'GET /' || route === 'GET ') {
    if (await tenantSession(req, env)) return html(appPage());
    return html(appAuthPage((await getPlatform(env)).signupsOpen, await lockedOut(env, m)));
  }

  if (['POST /signup/options', 'POST /signup/verify', 'POST /login/options', 'POST /login/verify', 'POST /recover'].includes(route)) {
    const blocked = await authGuard(req, env, url, m);
    if (blocked) return blocked;
    const body = await readJson<{ token: string; response: unknown; name: string; code: string }>(req);

    if (route === 'POST /signup/options') {
      const p = await getPlatform(env);
      if (!p.signupsOpen) return json({ ok: false, message: 'ההרשמה סגורה כרגע' }, 403);
      if ((await count(env, `signups:${day()}`)) >= p.maxSignupsPerDay) return json({ ok: false, message: 'הגענו למכסת ההרשמות היומית. נסה שוב מחר' }, 429);
      return json({ ok: true, ...(await registrationOptions(env, url, 'signup', null)) });
    }
    if (route === 'POST /signup/verify') {
      const p = await getPlatform(env);
      if (!p.signupsOpen || (await count(env, `signups:${day()}`)) >= p.maxSignupsPerDay) return json({ ok: false, message: 'ההרשמה סגורה כרגע' }, 403);
      const r = await verifyRegistration(env, url, 'signup', body.token, body.response, str(body.name, 40));
      if (!r) return failed(env, m, 400, 'יצירת ה-Passkey נכשלה. נסה שוב');
      if (await ixGet(env, 'cred', r.passkey.id)) return json({ ok: false, message: 'ה-Passkey הזה כבר רשום' }, 409);
      const tid = randomToken(12);
      const t = await tenant(env, tid);
      const recovery = newRecoveryCode();
      const recoveryHash = await sha256(normalizeRecovery(recovery));
      const owner: OwnerRecord = { userId: r.userId, passkeys: [r.passkey], epoch: 1, createdAt: new Date().toISOString(), recoveryHash };
      const cfg = freshConfig();
      await putMeta(env, { id: tid, createdAt: owner.createdAt, status: 'active', lastActiveAt: owner.createdAt });
      await putOwner(t, owner);
      await putConfig(t, cfg);
      for (const c of cfg.channels) await indexChannel(t, c);
      await ixPut(env, 'cred', r.passkey.id, { tid });
      await ixPut(env, 'rec', recoveryHash, { tid }, true);
      await bump(env, `signups:${day()}`, 172800);
      await addLog(t, { kind: 'admin', ok: true, detail: `החשבון נוצר (${r.passkey.name})`, ip: m.ip, country: m.country });
      return json({ ok: true, recoveryCode: recovery }, 200, { 'set-cookie': await createSession(env, 'tenant', owner, m, tid) });
    }
    if (route === 'POST /login/options') return json({ ok: true, ...(await authenticationOptions(env, url, 'login')) });
    if (route === 'POST /login/verify') {
      const r = await verifyAuthentication(env, url, 'login', body.token, body.response, (id) => findTenantOwner(env, id));
      if (!r) return failed(env, m, 401, 'ההתחברות נכשלה');
      const { t, ...rec } = r.owner;
      rec.passkeys = rec.passkeys.map((p) => (p.id === r.passkey.id ? r.passkey : p));
      await putOwner(t, rec);
      const cfg = await getConfig(t);
      await quietly(touch(env, t.id));
      await audit(t, ctx, cfg, m, `התחברות (${r.passkey.name})`, true);
      return json({ ok: true }, 200, { 'set-cookie': await createSession(env, 'tenant', rec, m, t.id) });
    }
    if (route === 'POST /recover') {
      const code = normalizeRecovery(body.code);
      if (code.length !== 20) return failed(env, m, 401, 'קוד שחזור שגוי');
      const h = await sha256(code);
      const ix = await ixGet(env, 'rec', h, true);
      const meta = ix ? await getMeta(env, ix.tid) : null;
      if (!ix || !meta || meta.status !== 'active') return failed(env, m, 401, 'קוד שחזור שגוי');
      const t = await tenant(env, ix.tid);
      const owner = await getOwner(t);
      if (!owner?.recoveryHash || !safeEqual(owner.recoveryHash, h)) return failed(env, m, 401, 'קוד שחזור שגוי');
      // Single-use: replace the code and sign out every other session.
      const next = newRecoveryCode();
      const nextHash = await sha256(normalizeRecovery(next));
      await ixDel(env, 'rec', h, true);
      await ixPut(env, 'rec', nextHash, { tid: t.id }, true);
      owner.recoveryHash = nextHash;
      owner.epoch += 1;
      await putOwner(t, owner);
      const cfg = await getConfig(t);
      await audit(t, ctx, cfg, m, 'כניסה עם קוד שחזור', true);
      return json({ ok: true, recoveryCode: next }, 200, { 'set-cookie': await createSession(env, 'tenant', owner, m, t.id) });
    }
  }

  if (route === 'POST /logout') {
    if (!sameOrigin(req, url)) return json({ ok: false }, 403);
    await destroySession(req, env, 'tenant');
    return json({ ok: true }, 200, { 'set-cookie': clearCookie('tenant') });
  }

  if (req.method !== 'POST' || parts[0] !== 'api') return json({ ok: false, message: 'not found' }, 404);
  if (!sameOrigin(req, url)) return json({ ok: false, message: 'cross-origin request refused' }, 403);
  const s = await tenantSession(req, env);
  if (!s) return json({ ok: false, message: 'unauthorized' }, 401);
  return tenantApi(req, env, ctx, url, `/${parts.slice(1).join('/')}`, s.t, s.owner, m);
}

async function tenantApi(
  req: Request,
  env: Env,
  ctx: ExecutionContext,
  url: URL,
  route: string,
  t: Tenant,
  owner: OwnerRecord,
  m: ClientMeta,
): Promise<Response> {
  const body = await readJson<Record<string, unknown>>(req);
  const cfg = await getConfig(t);
  const channel = () => cfg.channels.find((c) => c.id === body.id);
  const log = (detail: string, alert = false) => audit(t, ctx, cfg, m, detail, alert);

  switch (route) {
    case '/state': {
      const [session, entries, armed] = await Promise.all([
        getSession(t),
        getLog(t),
        Promise.all(cfg.channels.filter((c) => c.kind === 'grok').map(async (c) => [c.id, !!(await tRaw.get(t, `arm:${c.id}`))] as const)),
      ]);
      return json({
        linked: session ? { phone: maskPhone(session.phone), linkedAt: session.linkedAt } : null,
        config: { ...cfg, channels: cfg.channels.map(({ deviceHash: _d, ...c }) => c) },
        armed: Object.fromEntries(armed),
        passkeys: owner.passkeys.map((p) => ({ id: p.id, name: p.name, createdAt: p.createdAt, lastUsedAt: p.lastUsedAt, backedUp: !!p.backedUp })),
        origin: url.origin,
        log: entries.slice(0, 150),
      });
    }

    case '/link/start': {
      const id = crypto.randomUUID();
      return json({ id, svg: qrSvg(`{"id": "${id}"}`) });
    }
    case '/link/wait': {
      const id = str(body.id, 36);
      if (!/^[0-9a-f-]{36}$/.test(id)) return json({ ok: false, message: 'bad id' }, 400);
      try {
        const session = await waitForLink(id, AbortSignal.timeout(90_000));
        await checkToken(session);
        await putSession(t, session);
      } catch (e) {
        const msg = e instanceof Error ? e.message : '';
        if (/timeout|abort/i.test(msg) || (e instanceof Error && e.name === 'TimeoutError')) return json({ ok: false, message: 'timeout' }, 504);
        const r = ref();
        await log(`PalGate link failed, ref ${r}: ${msg}`);
        return json({ ok: false, message: `החיבור ל-PalGate נכשל (ref ${r})` }, 502);
      }
      await log('חשבון PalGate חובר', true);
      return json({ ok: true });
    }
    case '/unlink':
      await tRaw.del(t, 'session');
      await log('חשבון PalGate נותק', true);
      return json({ ok: true });
    case '/devices': {
      const session = await getSession(t);
      if (!session) return json({ ok: false, message: 'not linked' }, 400);
      try {
        const devices = await listDevices(session);
        return json({ ok: true, devices: devices.slice(0, 50).map(({ id, name, outputs }) => ({ id, name, outputs })) });
      } catch (e) {
        const r = ref();
        await log(`list gates failed, ref ${r}: ${e instanceof Error ? e.message : ''}`);
        return json({ ok: false, message: `לא הצלחתי לטעון שערים מ-PalGate (ref ${r})` }, 502);
      }
    }

    case '/gates': {
      if (!Array.isArray(body.gates)) return json({ ok: false, message: 'gates required' }, 400);
      const seen = new Set<string>();
      cfg.gates = (body.gates as Record<string, unknown>[])
        .slice(0, 20)
        .map((g) => ({
          alias: str(g.alias, 24).toLowerCase().replace(/[^a-z0-9-]/g, ''),
          label: str(g.label, 60),
          deviceId: str(g.deviceId, 64).replace(/[^A-Za-z0-9_.:-]/g, ''),
          output: Math.max(1, Math.min(4, Math.floor(Number(g.output)) || 1)),
        }))
        .filter((g) => g.alias && g.deviceId && !seen.has(g.alias) && seen.add(g.alias));
      await putConfig(t, cfg);
      await log(`שערים עודכנו (${cfg.gates.length})`);
      return json({ ok: true });
    }

    case '/settings': {
      const changes: string[] = [];
      if (typeof body.enabled === 'boolean' && body.enabled !== cfg.enabled) {
        cfg.enabled = body.enabled;
        changes.push(cfg.enabled ? 'מתג ראשי הופעל' : 'מתג ראשי כובה');
      }
      if (body.cooldownSec !== undefined) cfg.cooldownSec = clamp(body.cooldownSec, 0, 120);
      if (body.notifyUrl !== undefined) {
        const n = str(body.notifyUrl, 300);
        if (n && !/^https:\/\/[A-Za-z0-9.-]+\/[A-Za-z0-9_\-/.]+$/.test(n)) return json({ ok: false, message: 'כתובת התראות לא תקינה (https://ntfy.sh/...)' }, 400);
        if (n !== cfg.notifyUrl) changes.push('כתובת התראות שונתה');
        cfg.notifyUrl = n;
      }
      await putConfig(t, cfg);
      if (changes.length) await log(changes.join(', '), true);
      return json({ ok: true });
    }
    case '/notify-test':
      notify(ctx, cfg, '✅ בדיקת התראה מ-HeyGate');
      return json({ ok: true });

    case '/arm': {
      const minutes = await armGrok(t, cfg);
      await log(`Grok נדרך ל-${minutes} דק׳ מהפאנל`);
      return json({ ok: true, armedMinutes: minutes });
    }

    case '/channel/add': {
      const kind = str(body.kind, 10) as ChannelKind;
      if (kind !== 'grok' && kind !== 'phone') return json({ ok: false, message: 'bad kind' }, 400);
      if (cfg.channels.length >= 20) return json({ ok: false, message: 'יותר מדי גישות' }, 400);
      const c = newChannel(kind, str(body.name, 40) || undefined);
      cfg.channels.push(c);
      await putConfig(t, cfg);
      await indexChannel(t, c);
      await log(`נוספה גישה: ${c.name}`, true);
      return json({ ok: true });
    }
    case '/channel/update': {
      const c = channel();
      if (!c) return json({ ok: false, message: 'no such access' }, 404);
      const before = c.enabled;
      if (str(body.name, 40)) c.name = str(body.name, 40);
      if (typeof body.enabled === 'boolean') c.enabled = body.enabled;
      if (body.maxPerHour !== undefined) c.maxPerHour = clamp(body.maxPerHour, 1, 100);
      if (body.countries !== undefined) {
        c.countries = str(body.countries, 100).toUpperCase().split(/[\s,]+/).filter((x) => /^[A-Z]{2}$/.test(x)).slice(0, 20);
      }
      if (c.kind === 'grok') {
        if (typeof body.requireArm === 'boolean') c.requireArm = body.requireArm;
        if (body.armMinutes !== undefined) c.armMinutes = clamp(body.armMinutes, 1, 60);
      }
      await putConfig(t, cfg);
      await log(`גישה עודכנה: ${c.name}${before !== c.enabled ? (c.enabled ? ' (הופעלה)' : ' (הושבתה)') : ''}`, before !== c.enabled);
      return json({ ok: true });
    }
    case '/channel/rotate': {
      const c = channel();
      if (!c || c.kind === 'car') return json({ ok: false, message: 'no such access' }, 404);
      await unindexChannel(t, c);
      c.secret = randomToken(24);
      await putConfig(t, cfg);
      await indexChannel(t, c);
      await log(`קישור הוחלף: ${c.name}`, true);
      return json({ ok: true });
    }
    case '/channel/delete': {
      const c = channel();
      if (!c) return json({ ok: false, message: 'no such access' }, 404);
      cfg.channels = cfg.channels.filter((x) => x.id !== c.id);
      await putConfig(t, cfg);
      await unindexChannel(t, c);
      await log(`גישה נמחקה: ${c.name}`, true);
      return json({ ok: true });
    }

    case '/pair/approve': {
      const code = str(body.code, 12).toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (!/^[A-Z2-9]{6}$/.test(code)) return json({ ok: false, message: 'קוד לא תקין' }, 400);
      const rec = await getSealed<PairRecord>(env, `pair:${code}`);
      if (!rec || rec.status !== 'pending') return json({ ok: false, message: 'קוד לא נמצא או שפג תוקפו' }, 404);
      if (cfg.channels.length >= 20) return json({ ok: false, message: 'יותר מדי גישות' }, 400);
      const token = randomToken(32);
      const c = newChannel('car', str(body.name, 40) || 'מכשיר');
      c.deviceHash = await sha256(token);
      cfg.channels.push(c);
      await putConfig(t, cfg);
      await indexChannel(t, c);
      await putSealed(env, `pair:${code}`, { ...rec, status: 'approved', token } satisfies PairRecord, 120);
      await log(`מכשיר חדש צומד: ${c.name}`, true);
      return json({ ok: true });
    }

    case '/test': {
      const alias = str(body.alias, 24);
      if (alias) await tRaw.del(t, `last:${alias}`);
      const r = await performOpen(t, ctx, cfg, alias || undefined, { label: 'בדיקה מהפאנל' }, m);
      return json(r, r.ok ? 200 : r.status);
    }

    case '/logout-all':
      owner.epoch += 1;
      await putOwner(t, owner);
      await log('ניתוק מכל המכשירים', true);
      return json({ ok: true }, 200, { 'set-cookie': clearCookie('tenant') });

    case '/passkey/options':
      if (owner.passkeys.length >= 10) return json({ ok: false, message: 'אפשר עד 10 Passkeys' }, 400);
      return json({ ok: true, ...(await registrationOptions(env, url, 'add', owner)) });
    case '/passkey/verify': {
      const r = await verifyRegistration(env, url, 'add', body.token, body.response, str(body.name, 40));
      if (!r || r.userId !== owner.userId) return json({ ok: false, message: 'הוספת ה-Passkey נכשלה' }, 400);
      if (await ixGet(env, 'cred', r.passkey.id)) return json({ ok: false, message: 'ה-Passkey הזה כבר רשום' }, 409);
      owner.passkeys.push(r.passkey);
      await putOwner(t, owner);
      await ixPut(env, 'cred', r.passkey.id, { tid: t.id });
      await log(`נוסף Passkey: ${r.passkey.name}`, true);
      return json({ ok: true });
    }
    case '/passkey/rename': {
      const pk = owner.passkeys.find((p) => p.id === body.id);
      if (!pk || !str(body.name, 40)) return json({ ok: false, message: 'לא נמצא' }, 404);
      pk.name = str(body.name, 40);
      await putOwner(t, owner);
      return json({ ok: true });
    }
    case '/passkey/delete': {
      const pk = owner.passkeys.find((p) => p.id === body.id);
      if (!pk) return json({ ok: false, message: 'לא נמצא' }, 404);
      if (owner.passkeys.length === 1) return json({ ok: false, message: 'אי אפשר למחוק את ה-Passkey האחרון — הוסף קודם אחר' }, 400);
      owner.passkeys = owner.passkeys.filter((p) => p.id !== pk.id);
      await putOwner(t, owner);
      await ixDel(env, 'cred', pk.id);
      await log(`נמחק Passkey: ${pk.name}`, true);
      return json({ ok: true });
    }
    case '/recovery/new': {
      const next = newRecoveryCode();
      const nextHash = await sha256(normalizeRecovery(next));
      if (owner.recoveryHash) await ixDel(env, 'rec', owner.recoveryHash, true);
      await ixPut(env, 'rec', nextHash, { tid: t.id }, true);
      owner.recoveryHash = nextHash;
      await putOwner(t, owner);
      await log('נוצר קוד שחזור חדש', true);
      return json({ ok: true, recoveryCode: next });
    }
    case '/account/delete': {
      if (body.confirm !== 'DELETE') return json({ ok: false, message: 'נדרש אישור' }, 400);
      notify(ctx, cfg, '🗑️ החשבון ב-HeyGate נמחק');
      await deleteTenant(t, owner.passkeys.map((p) => p.id), owner.recoveryHash);
      return json({ ok: true }, 200, { 'set-cookie': clearCookie('tenant') });
    }
  }
  return json({ ok: false, message: 'not found' }, 404);
}

// ================================================================ super admin (/sa)

async function saRoute(req: Request, env: Env, url: URL, parts: string[], m: ClientMeta): Promise<Response> {
  const route = `${req.method} /${parts.join('/')}`;
  const sa = await getSuper(env);
  if (route === 'GET /' || route === 'GET ') {
    if (sa && (await superSession(req, env))) return html(saPage());
    return html(saAuthPage(!sa, await lockedOut(env, m)));
  }

  if (['POST /setup/options', 'POST /setup/verify', 'POST /login/options', 'POST /login/verify'].includes(route)) {
    const blocked = await authGuard(req, env, url, m);
    if (blocked) return blocked;
    const body = await readJson<{ setupCode: string; token: string; response: unknown; name: string }>(req);
    if (route === 'POST /setup/options') {
      if (sa) return json({ ok: false, message: 'already set up' }, 409);
      if (typeof body.setupCode !== 'string' || !safeEqual(body.setupCode.trim().toUpperCase(), env.SETUP_CODE!.toUpperCase())) {
        return failed(env, m, 401, 'קוד התקנה שגוי');
      }
      return json({ ok: true, ...(await registrationOptions(env, url, 'sa-setup', null)) });
    }
    if (route === 'POST /setup/verify') {
      if (sa) return json({ ok: false, message: 'already set up' }, 409);
      const r = await verifyRegistration(env, url, 'sa-setup', body.token, body.response, str(body.name, 40));
      if (!r) return failed(env, m, 400, 'יצירת ה-Passkey נכשלה');
      const rec: OwnerRecord = { userId: r.userId, passkeys: [r.passkey], epoch: 1, createdAt: new Date().toISOString() };
      await putSuper(env, rec);
      return json({ ok: true }, 200, { 'set-cookie': await createSession(env, 'sa', rec, m) });
    }
    if (!sa) return json({ ok: false, message: 'not set up' }, 409);
    const purpose: AuthPurpose = 'sa-login';
    if (route === 'POST /login/options') return json({ ok: true, ...(await authenticationOptions(env, url, purpose)) });
    const r = await verifyAuthentication(env, url, purpose, body.token, body.response, async (id) => (sa.passkeys.some((p) => p.id === id) ? sa : null));
    if (!r) return failed(env, m, 401, 'ההתחברות נכשלה');
    sa.passkeys = sa.passkeys.map((p) => (p.id === r.passkey.id ? r.passkey : p));
    await putSuper(env, sa);
    return json({ ok: true }, 200, { 'set-cookie': await createSession(env, 'sa', sa, m) });
  }

  const role: Role = 'sa';
  if (route === 'POST /logout') {
    if (!sameOrigin(req, url)) return json({ ok: false }, 403);
    await destroySession(req, env, role);
    return json({ ok: true }, 200, { 'set-cookie': clearCookie(role) });
  }
  if (req.method !== 'POST' || parts[0] !== 'api') return json({ ok: false, message: 'not found' }, 404);
  if (!sameOrigin(req, url)) return json({ ok: false, message: 'cross-origin request refused' }, 403);
  const me = await superSession(req, env);
  if (!me) return json({ ok: false, message: 'unauthorized' }, 401);
  const body = await readJson<Record<string, unknown>>(req);

  switch (`/${parts.slice(1).join('/')}`) {
    case '/state': {
      // Registry metadata only. The super admin never sees a tenant's PalGate
      // account, gates, links, devices or log: those are sealed with keys
      // derived per tenant and are not read here.
      const tenants = await listTenants(env);
      return json({
        platform: await getPlatform(env),
        signupsToday: await count(env, `signups:${day()}`),
        tenants: tenants.map((x) => ({ id: x.id, createdAt: x.createdAt, status: x.status, lastActiveAt: x.lastActiveAt })),
      });
    }
    case '/platform': {
      const p = await getPlatform(env);
      if (typeof body.signupsOpen === 'boolean') p.signupsOpen = body.signupsOpen;
      if (body.maxSignupsPerDay !== undefined) p.maxSignupsPerDay = clamp(body.maxSignupsPerDay, 1, 1000);
      await putPlatform(env, p);
      return json({ ok: true });
    }
    case '/tenant/status': {
      const id = str(body.id, 16);
      const meta = await getMeta(env, id);
      if (!meta || (body.status !== 'active' && body.status !== 'blocked')) return json({ ok: false, message: 'not found' }, 404);
      await putMeta(env, { ...meta, status: body.status });
      return json({ ok: true });
    }
    case '/tenant/delete': {
      const id = str(body.id, 16);
      const meta = await getMeta(env, id);
      if (!meta || body.confirm !== id) return json({ ok: false, message: 'not found' }, 404);
      const t = await tenant(env, id);
      const owner = await getOwner(t);
      await deleteTenant(t, owner?.passkeys.map((p) => p.id) ?? [], owner?.recoveryHash);
      return json({ ok: true });
    }
    case '/logout-all':
      me.epoch += 1;
      await putSuper(env, me);
      return json({ ok: true }, 200, { 'set-cookie': clearCookie(role) });
  }
  return json({ ok: false, message: 'not found' }, 404);
}
