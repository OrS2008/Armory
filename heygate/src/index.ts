import qrcode from 'qrcode-generator';
import { accessEnabled, verifyAccess } from './access';
import {
  clearCookie,
  normalizeUsername,
  passwordOk,
  USERNAME_RE,
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
import { burnPasswordCheck, hashPassword, randomBytes, randomToken, safeEqual, sha256, verifyPassword } from './crypto';
import { logText, msg, note, pickLang, type Lang } from './i18n';
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

const langOf = (cfg: Config | null): Lang => cfg?.lang ?? 'he';

/** `detail` is a log code ("code|arg|arg"); it is shown in the viewer's language. */
async function audit(t: Tenant, ctx: ExecutionContext, cfg: Config | null, m: ClientMeta, detail: string, alert = false) {
  await addLog(t, { kind: 'admin', ok: true, detail, ip: m.ip, country: m.country });
  if (alert) notify(ctx, cfg, note(langOf(cfg), 'security', logText(langOf(cfg), detail), m.country, m.ip));
}

function qrSvg(data: string) {
  const qr = qrcode(0, 'M');
  qr.addData(data);
  qr.make();
  return qr.createSvgTag({ cellSize: 6, margin: 4, scalable: true });
}

const tooMany = (seconds: number) =>
  json({ ok: false, message: 'too_many', retryAfter: seconds }, 429, { 'retry-after': String(seconds) });

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

  if (!cfg.enabled) return deny(423, 'switched_off');
  const ch = who.channel;
  if (ch) {
    if (!ch.enabled) return deny(403, 'access_disabled');
    if (ch.countries.length && !ch.countries.includes(m.country)) {
      notify(ctx, cfg, note(langOf(cfg), 'blocked_location', ch.name, m.country, m.ip));
      return deny(403, 'location_denied', undefined, `location_denied|${m.country}`);
    }
    if (ch.kind === 'grok' && ch.requireArm && !(await tRaw.get(t, `arm:${ch.id}`))) {
      notify(ctx, cfg, note(langOf(cfg), 'blocked_unarmed', m.country));
      return deny(403, 'not_armed');
    }
  }

  const session = await getSession(t);
  if (!session) return deny(503, 'not_setup');
  const gate = alias ? cfg.gates.find((g) => g.alias === alias) : cfg.gates[0];
  if (!gate) return deny(404, 'no_gate');

  const last = Number(await tRaw.get(t, `last:${gate.alias}`));
  if (last && Date.now() - last < cfg.cooldownSec * 1000) return { ok: true, gate, repeated: true };

  if (ch && (await tCount(t, `cnt:${ch.id}:${hour()}`)) >= ch.maxPerHour) {
    notify(ctx, cfg, note(langOf(cfg), 'hourly', ch.name));
    return deny(429, 'hourly', gate.alias);
  }
  if ((await tCount(t, `cnt:all:${hour()}`)) >= MAX_OPENS_PER_HOUR) return deny(429, 'hourly', gate.alias);

  try {
    await openGate(session, gate.deviceId, gate.output);
  } catch (e) {
    const r = ref();
    console.error(`gate error ref ${r}`, e);
    return deny(502, `gate_error|${r}`, gate.alias);
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
  notify(ctx, cfg, note(langOf(cfg), 'opened', gate.label || gate.alias, who.label, m.country));
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
    const lang = pickLang(req);
    const res = await route(req, env, ctx, url, parts, m, lang);
    return localize(res, lang);
  },
} satisfies ExportedHandler<Env>;

/** Server messages are codes; translate them for this viewer on the way out. */
async function localize(res: Response, lang: Lang): Promise<Response> {
  if (!(res.headers.get('content-type') ?? '').includes('application/json')) return res;
  const body = await res.clone().json<Record<string, unknown>>().catch(() => null);
  if (!body || typeof body.message !== 'string') return res;
  body.message = msg(lang, body.message);
  return new Response(JSON.stringify(body), { status: res.status, headers: res.headers });
}

async function route(req: Request, env: Env, ctx: ExecutionContext, url: URL, parts: string[], m: ClientMeta, lang: Lang): Promise<Response> {
  {

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
      if (top === '' && req.method === 'GET') return html(landingPage(lang, (await getPlatform(env)).signupsOpen));
      if (top === 'privacy' && req.method === 'GET') return html(privacyPage(lang));
      if (top === 'admin') return Response.redirect(new URL('/app', url).toString(), 301);
      if (top === 'app') {
        if (!(await allowed(env.RL_ADMIN, m.ip))) return text('Too many requests', 429);
        return await appRoute(req, env, ctx, url, parts.slice(1), m, lang);
      }
      if (top === 'sa') {
        if (!(await allowed(env.RL_ADMIN, m.ip))) return text('Too many requests', 429);
        if (accessEnabled(env) && !(await verifyAccess(req, env))) return text('Cloudflare Access required', 403);
        return await saRoute(req, env, url, parts.slice(1), m, lang);
      }
      if (['o', 'arm', 'car'].includes(top)) {
        if (!(await allowed(env.RL_PUBLIC, m.ip))) return text('Too many requests', 429);
        if (top === 'o' && parts[1] && parts.length <= 4) return await openRoute(req, env, ctx, url, parts, m);
        if (top === 'arm' && parts[1] && parts.length === 2) return await armRoute(req, env, parts[1], m);
        if (top === 'car') return await carRoute(req, env, ctx, url, parts.slice(1), m, lang);
      }
    } catch (e) {
      const r = ref();
      console.error(`ref ${r}`, e);
      return json({ ok: false, message: `internal|${r}` }, 500);
    }
    return text('Not found', 404);
  }
}

// ================================================================ public: links, arming, devices

async function openRoute(req: Request, env: Env, ctx: ExecutionContext, url: URL, parts: string[], m: ClientMeta) {
  const r = await resolveSecret(env, parts[1]!, m);
  if ('throttled' in r) return text('Too many requests', 429);
  if (!r.found) return html(resultPage({ ok: false, message: 'Not found' }), 404);
  const { t, cfg, channel } = r.found;
  if (req.method === 'HEAD' || req.method === 'OPTIONS') return new Response(null, { status: 204 });
  if (PREVIEW_BOTS.test(m.ua)) return html(resultPage({ ok: false, message: 'Preview fetch ignored' }), 403);
  if (channel.kind !== 'grok' && req.method !== 'POST') return html(resultPage({ ok: false, message: msg('en', 'use_post') }), 405);
  if (req.method !== 'GET' && req.method !== 'POST') return text('Method not allowed', 405);

  const alias = parts[2] && ALIAS_RE.test(parts[2]) && cfg.gates.some((g) => g.alias === parts[2]) ? parts[2] : undefined;
  const res = await performOpen(t, ctx, cfg, alias, { channel, label: channel.name }, m);
  const wantsJson = url.searchParams.has('json') || (req.headers.get('accept') ?? '').includes('application/json');
  if (wantsJson) return json(res.ok ? { ok: true, gate: res.gate.label, repeated: res.repeated } : res, res.ok ? 200 : res.status);
  return html(
    resultPage(res.ok ? { ok: true, label: res.gate.label, repeated: res.repeated } : { ok: false, message: msg('en', res.message) }),
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
  if (!r.found || r.found.channel.kind !== 'phone') return json({ ok: false, message: 'not_found' }, 404);
  const { t, cfg, channel } = r.found;
  if (req.method !== 'POST') return json({ ok: false, message: 'use_post' }, 405);
  if (!channel.enabled || !cfg.enabled) return json({ ok: false, message: 'disabled' }, 403);
  if (channel.countries.length && !channel.countries.includes(m.country)) return json({ ok: false, message: 'location_denied' }, 403);
  const minutes = await armGrok(t, cfg);
  await addLog(t, { kind: 'admin', ok: true, detail: `armed|${minutes}|${channel.name}`, ip: m.ip, country: m.country });
  return json({ ok: true, armedMinutes: minutes });
}

interface PairRecord {
  nonceHash: string;
  status: 'pending' | 'approved';
  token?: string;
}

async function carRoute(req: Request, env: Env, ctx: ExecutionContext, url: URL, parts: string[], m: ClientMeta, lang: Lang) {
  const route = `${req.method} /${parts.join('/')}`;
  if (route === 'GET /') {
    const dev = await deviceChannel(req, env);
    if (dev) return html(carPage(lang, dev.cfg.gates, dev.channel.enabled && dev.cfg.enabled, dev.channel.name));
    return html(pairPage(lang));
  }
  if (req.method !== 'POST' || !sameOrigin(req, url)) return json({ ok: false, message: 'forbidden' }, 403);

  if (route === 'POST /pair/start') {
    if (!(await allowed(env.RL_AUTH, m.ip))) return json({ ok: false, message: 'too_many' }, 429);
    const code = Array.from(randomBytes(6), (b) => PAIR_ALPHABET[b % 32]).join('');
    const nonce = randomToken(24);
    await putSealed(env, `pair:${code}`, { nonceHash: await sha256(nonce), status: 'pending' } satisfies PairRecord, 600);
    return json({ ok: true, code, expiresIn: 600 }, 200, { 'set-cookie': cookie(PAIR_COOKIE, nonce, 600) });
  }
  if (route === 'POST /pair/status') {
    const { code } = await readJson<{ code: string }>(req);
    const nonce = readCookie(req, PAIR_COOKIE);
    if (typeof code !== 'string' || !/^[A-Z2-9]{6}$/.test(code) || !nonce) return json({ ok: false, message: 'bad_code' }, 400);
    const rec = await getSealed<PairRecord>(env, `pair:${code}`);
    if (!rec || !safeEqual(rec.nonceHash, await sha256(nonce))) return json({ ok: false, message: 'code_not_found' }, 410);
    if (rec.status !== 'approved' || !rec.token) return json({ ok: true, done: false });
    await env.GATE.delete(`pair:${code}`);
    return json({ ok: true, done: true }, 200, { 'set-cookie': cookie(DEVICE_COOKIE, rec.token, DEVICE_TTL) });
  }
  if (route === 'POST /open') {
    const dev = await deviceChannel(req, env);
    if (!dev) return json({ ok: false, message: 'not_paired' }, 401);
    const { alias } = await readJson<{ alias: string }>(req);
    const a = typeof alias === 'string' && ALIAS_RE.test(alias) ? alias : undefined;
    const res = await performOpen(dev.t, ctx, dev.cfg, a, { channel: dev.channel, label: dev.channel.name }, m);
    return json(res.ok ? { ok: true, gate: res.gate.label, repeated: res.repeated } : res, res.ok ? 200 : res.status);
  }
  return json({ ok: false, message: 'not_found' }, 404);
}

// ================================================================ shared auth plumbing

async function authGuard(req: Request, env: Env, url: URL, m: ClientMeta): Promise<Response | null> {
  if (req.method !== 'POST') return json({ ok: false, message: 'not_found' }, 404);
  if (!sameOrigin(req, url)) return json({ ok: false, message: 'forbidden' }, 403);
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

async function appRoute(req: Request, env: Env, ctx: ExecutionContext, url: URL, parts: string[], m: ClientMeta, lang: Lang): Promise<Response> {
  const route = `${req.method} /${parts.join('/')}`;
  if (route === 'GET /' || route === 'GET ') {
    if (await tenantSession(req, env)) return html(appPage(lang));
    return html(appAuthPage(lang, (await getPlatform(env)).signupsOpen, await lockedOut(env, m)));
  }

  if (['POST /signup', 'POST /login/password', 'POST /login/options', 'POST /login/verify', 'POST /recover'].includes(route)) {
    const blocked = await authGuard(req, env, url, m);
    if (blocked) return blocked;
    const body = await readJson<{ token: string; response: unknown; name: string; code: string; username: string; password: string }>(req);

    if (route === 'POST /signup') {
      const p = await getPlatform(env);
      if (!p.signupsOpen) return json({ ok: false, message: 'signup_closed' }, 403);
      if ((await count(env, `signups:${day()}`)) >= p.maxSignupsPerDay) return json({ ok: false, message: 'signup_cap' }, 429);
      const username = normalizeUsername(body.username);
      if (!USERNAME_RE.test(username)) return json({ ok: false, message: 'bad_username' }, 400);
      if (!passwordOk(body.password, username)) return json({ ok: false, message: 'weak_password' }, 400);
      if (await ixGet(env, 'user', username)) return json({ ok: false, message: 'username_taken' }, 409);
      const tid = randomToken(12);
      const t = await tenant(env, tid);
      const recovery = newRecoveryCode();
      const recoveryHash = await sha256(normalizeRecovery(recovery));
      const owner: OwnerRecord = {
        userId: randomToken(16),
        passkeys: [],
        epoch: 1,
        createdAt: new Date().toISOString(),
        recoveryHash,
        username,
        pw: await hashPassword(body.password),
      };
      const cfg = freshConfig(lang);
      await ixPut(env, 'user', username, { tid });
      await putMeta(env, { id: tid, createdAt: owner.createdAt, status: 'active', lastActiveAt: owner.createdAt });
      await putOwner(t, owner);
      await putConfig(t, cfg);
      for (const c of cfg.channels) await indexChannel(t, c);
      await ixPut(env, 'rec', recoveryHash, { tid }, true);
      await bump(env, `signups:${day()}`, 172800);
      await addLog(t, { kind: 'admin', ok: true, detail: 'account_created', ip: m.ip, country: m.country });
      return json({ ok: true, recoveryCode: recovery }, 200, { 'set-cookie': await createSession(env, 'tenant', owner, m, tid) });
    }
    if (route === 'POST /login/password') {
      const username = normalizeUsername(body.username);
      const password = typeof body.password === 'string' ? body.password.slice(0, 256) : '';
      const ix = USERNAME_RE.test(username) ? await ixGet(env, 'user', username) : null;
      const meta = ix ? await getMeta(env, ix.tid) : null;
      const t = ix && meta?.status === 'active' ? await tenant(env, ix.tid) : null;
      const owner = t ? await getOwner(t) : null;
      if (!t || !owner?.pw) {
        await burnPasswordCheck(password); // same timing whether or not the user exists
        return failed(env, m, 401, 'bad_credentials');
      }
      const lockKey = `ulock:${await sha256(username)}`;
      if (Number(await env.GATE.get(lockKey)) > Date.now()) return json({ ok: false, message: 'account_locked' }, 429);
      if (!(await verifyPassword(password, owner.pw))) {
        const cfg = await getConfig(t);
        const n = await bump(env, `ufail:${await sha256(username)}`, 900);
        await addLog(t, { kind: 'admin', ok: false, detail: 'login_failed', ip: m.ip, country: m.country });
        notify(ctx, cfg, note(langOf(cfg), 'login_failed', m.country, m.ip));
        if (n >= 10) {
          // Per-account lock against slow, distributed guessing of one password.
          await env.GATE.put(lockKey, String(Date.now() + 900_000), { expirationTtl: 900 });
          await addLog(t, { kind: 'admin', ok: false, detail: 'account_locked', ip: m.ip, country: m.country });
          notify(ctx, cfg, note(langOf(cfg), 'account_locked', m.country));
        }
        return failed(env, m, 401, 'bad_credentials');
      }
      const cfg = await getConfig(t);
      await quietly(touch(env, t.id));
      await audit(t, ctx, cfg, m, 'login_password', true);
      return json({ ok: true }, 200, { 'set-cookie': await createSession(env, 'tenant', owner, m, t.id) });
    }
    if (route === 'POST /login/options') return json({ ok: true, ...(await authenticationOptions(env, url, 'login')) });
    if (route === 'POST /login/verify') {
      const r = await verifyAuthentication(env, url, 'login', body.token, body.response, (id) => findTenantOwner(env, id));
      if (!r) return failed(env, m, 401, 'login_failed');
      const { t, ...rec } = r.owner;
      rec.passkeys = rec.passkeys.map((p) => (p.id === r.passkey.id ? r.passkey : p));
      await putOwner(t, rec);
      const cfg = await getConfig(t);
      await quietly(touch(env, t.id));
      await audit(t, ctx, cfg, m, `login|${r.passkey.name}`, true);
      return json({ ok: true }, 200, { 'set-cookie': await createSession(env, 'tenant', rec, m, t.id) });
    }
    if (route === 'POST /recover') {
      const code = normalizeRecovery(body.code);
      if (code.length !== 20) return failed(env, m, 401, 'bad_recovery');
      const h = await sha256(code);
      const ix = await ixGet(env, 'rec', h, true);
      const meta = ix ? await getMeta(env, ix.tid) : null;
      if (!ix || !meta || meta.status !== 'active') return failed(env, m, 401, 'bad_recovery');
      const t = await tenant(env, ix.tid);
      const owner = await getOwner(t);
      if (!owner?.recoveryHash || !safeEqual(owner.recoveryHash, h)) return failed(env, m, 401, 'bad_recovery');
      // Single-use: replace the code and sign out every other session.
      const next = newRecoveryCode();
      const nextHash = await sha256(normalizeRecovery(next));
      await ixDel(env, 'rec', h, true);
      await ixPut(env, 'rec', nextHash, { tid: t.id }, true);
      owner.recoveryHash = nextHash;
      owner.epoch += 1;
      await putOwner(t, owner);
      const cfg = await getConfig(t);
      await audit(t, ctx, cfg, m, 'login_recovery', true);
      await env.GATE.delete(`ulock:${await sha256(owner.username ?? '')}`);
      return json({ ok: true, recoveryCode: next }, 200, { 'set-cookie': await createSession(env, 'tenant', owner, m, t.id) });
    }
  }

  if (route === 'POST /logout') {
    if (!sameOrigin(req, url)) return json({ ok: false }, 403);
    await destroySession(req, env, 'tenant');
    return json({ ok: true }, 200, { 'set-cookie': clearCookie('tenant') });
  }

  if (req.method !== 'POST' || parts[0] !== 'api') return json({ ok: false, message: 'not_found' }, 404);
  if (!sameOrigin(req, url)) return json({ ok: false, message: 'forbidden' }, 403);
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
      if (!cfg.gates.length) {
        // Before a gate exists the panel never shows a link, so duplicate
        // Grok/automation entries added meanwhile are unused: keep one of each.
        const seen = new Set<string>();
        const extra = cfg.channels.filter((c) => c.kind !== 'car' && !c.lastUsedAt && (seen.has(c.kind) || !seen.add(c.kind)));
        if (extra.length) {
          for (const c of extra) await unindexChannel(t, c);
          cfg.channels = cfg.channels.filter((c) => !extra.includes(c));
          await putConfig(t, cfg);
        }
      }
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
        account: { username: owner.username ?? null, hasPassword: !!owner.pw },
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
      if (!/^[0-9a-f-]{36}$/.test(id)) return json({ ok: false, message: 'bad_code' }, 400);
      try {
        const session = await waitForLink(id, AbortSignal.timeout(90_000));
        await checkToken(session);
        await putSession(t, session);
      } catch (e) {
        const em = e instanceof Error ? e.message : '';
        if (/timeout|abort/i.test(em) || (e instanceof Error && e.name === 'TimeoutError')) return json({ ok: false, message: 'timeout' }, 504);
        const r = ref();
        console.error(`link failed ref ${r}`, em);
        await log(`link_failed|${r}`);
        return json({ ok: false, message: `link_failed|${r}` }, 502);
      }
      await log('palgate_linked', true);
      return json({ ok: true });
    }
    case '/unlink':
      await tRaw.del(t, 'session');
      await log('palgate_unlinked', true);
      return json({ ok: true });
    case '/devices': {
      const session = await getSession(t);
      if (!session) return json({ ok: false, message: 'not_setup' }, 400);
      try {
        const devices = await listDevices(session);
        return json({ ok: true, devices: devices.slice(0, 50).map(({ id, name, outputs }) => ({ id, name, outputs })) });
      } catch (e) {
        const r = ref();
        console.error(`list gates failed ref ${r}`, e);
        await log(`gates_failed|${r}`);
        return json({ ok: false, message: `gates_failed|${r}` }, 502);
      }
    }

    case '/gates': {
      if (!Array.isArray(body.gates)) return json({ ok: false, message: 'bad_code' }, 400);
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
      await log(`gates_updated|${cfg.gates.length}`);
      return json({ ok: true });
    }

    case '/settings': {
      const changes: string[] = [];
      if (typeof body.enabled === 'boolean' && body.enabled !== cfg.enabled) {
        cfg.enabled = body.enabled;
        changes.push(cfg.enabled ? 'master_on' : 'master_off');
      }
      if (body.cooldownSec !== undefined) cfg.cooldownSec = clamp(body.cooldownSec, 0, 120);
      if (body.notifyUrl !== undefined) {
        const n = str(body.notifyUrl, 300);
        if (n && !/^https:\/\/[A-Za-z0-9.-]+\/[A-Za-z0-9_\-/.]+$/.test(n)) return json({ ok: false, message: 'bad_notify' }, 400);
        if (n !== cfg.notifyUrl) changes.push('notify_changed');
        cfg.notifyUrl = n;
      }
      if (body.lang === 'he' || body.lang === 'en') cfg.lang = body.lang;
      await putConfig(t, cfg);
      for (const c of changes) await log(c, true);
      return json({ ok: true });
    }
    case '/notify-test':
      notify(ctx, cfg, note(langOf(cfg), 'test'));
      return json({ ok: true });

    case '/arm': {
      const minutes = await armGrok(t, cfg);
      await log(`armed|${minutes}|panel`);
      return json({ ok: true, armedMinutes: minutes });
    }

    case '/channel/add': {
      const kind = str(body.kind, 10) as ChannelKind;
      if (kind !== 'grok' && kind !== 'phone') return json({ ok: false, message: 'bad_code' }, 400);
      if (!cfg.gates.length) return json({ ok: false, message: 'no_gate' }, 400);
      if (cfg.channels.length >= 20) return json({ ok: false, message: 'too_many_access' }, 400);
      const c = newChannel(kind, str(body.name, 40) || undefined, langOf(cfg));
      cfg.channels.push(c);
      await putConfig(t, cfg);
      await indexChannel(t, c);
      await log(`channel_added|${c.name}`, true);
      return json({ ok: true, id: c.id });
    }
    case '/channel/update': {
      const c = channel();
      if (!c) return json({ ok: false, message: 'not_found' }, 404);
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
      await log(`${before === c.enabled ? 'channel_updated' : c.enabled ? 'channel_enabled' : 'channel_disabled'}|${c.name}`, before !== c.enabled);
      return json({ ok: true });
    }
    case '/channel/rotate': {
      const c = channel();
      if (!c || c.kind === 'car') return json({ ok: false, message: 'not_found' }, 404);
      await unindexChannel(t, c);
      c.secret = randomToken(24);
      await putConfig(t, cfg);
      await indexChannel(t, c);
      await log(`channel_rotated|${c.name}`, true);
      return json({ ok: true });
    }
    case '/channel/delete': {
      const c = channel();
      if (!c) return json({ ok: false, message: 'not_found' }, 404);
      cfg.channels = cfg.channels.filter((x) => x.id !== c.id);
      await putConfig(t, cfg);
      await unindexChannel(t, c);
      await log(`channel_deleted|${c.name}`, true);
      return json({ ok: true });
    }

    case '/pair/approve': {
      const code = str(body.code, 12).toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (!/^[A-Z2-9]{6}$/.test(code)) return json({ ok: false, message: 'bad_code' }, 400);
      const rec = await getSealed<PairRecord>(env, `pair:${code}`);
      if (!rec || rec.status !== 'pending') return json({ ok: false, message: 'code_not_found' }, 404);
      if (cfg.channels.length >= 20) return json({ ok: false, message: 'too_many_access' }, 400);
      const token = randomToken(32);
      const c = newChannel('car', str(body.name, 40) || undefined, langOf(cfg));
      c.deviceHash = await sha256(token);
      cfg.channels.push(c);
      await putConfig(t, cfg);
      await indexChannel(t, c);
      await putSealed(env, `pair:${code}`, { ...rec, status: 'approved', token } satisfies PairRecord, 120);
      await log(`device_paired|${c.name}`, true);
      return json({ ok: true });
    }

    case '/test': {
      const alias = str(body.alias, 24);
      if (alias) await tRaw.del(t, `last:${alias}`);
      const r = await performOpen(t, ctx, cfg, alias || undefined, { label: 'panel' }, m);
      return json(r, r.ok ? 200 : r.status);
    }

    case '/logout-all':
      owner.epoch += 1;
      await putOwner(t, owner);
      await log('logout_all', true);
      return json({ ok: true }, 200, { 'set-cookie': clearCookie('tenant') });

    case '/passkey/options':
      if (owner.passkeys.length >= 10) return json({ ok: false, message: 'max_passkeys' }, 400);
      return json({ ok: true, ...(await registrationOptions(env, url, 'add', owner)) });
    case '/passkey/verify': {
      const r = await verifyRegistration(env, url, 'add', body.token, body.response, str(body.name, 40));
      if (!r || r.userId !== owner.userId) return json({ ok: false, message: 'passkey_add_failed' }, 400);
      if (await ixGet(env, 'cred', r.passkey.id)) return json({ ok: false, message: 'passkey_exists' }, 409);
      owner.passkeys.push(r.passkey);
      await putOwner(t, owner);
      await ixPut(env, 'cred', r.passkey.id, { tid: t.id });
      await log(`passkey_added|${r.passkey.name}`, true);
      return json({ ok: true });
    }
    case '/passkey/rename': {
      const pk = owner.passkeys.find((p) => p.id === body.id);
      if (!pk || !str(body.name, 40)) return json({ ok: false, message: 'not_found' }, 404);
      pk.name = str(body.name, 40);
      await putOwner(t, owner);
      return json({ ok: true });
    }
    case '/passkey/delete': {
      const pk = owner.passkeys.find((p) => p.id === body.id);
      if (!pk) return json({ ok: false, message: 'not_found' }, 404);
      if (owner.passkeys.length === 1 && !owner.pw) return json({ ok: false, message: 'last_passkey' }, 400);
      owner.passkeys = owner.passkeys.filter((p) => p.id !== pk.id);
      await putOwner(t, owner);
      await ixDel(env, 'cred', pk.id);
      await log(`passkey_deleted|${pk.name}`, true);
      return json({ ok: true });
    }
    case '/password': {
      // Set (if none yet) or change the password; changing signs out other sessions.
      if (owner.pw && !(await verifyPassword(String(body.current ?? '').slice(0, 256), owner.pw))) return json({ ok: false, message: 'wrong_password' }, 401);
      // Accounts created with a passkey only pick their username here.
      let username = owner.username ?? '';
      const claiming = !username;
      if (claiming) {
        username = normalizeUsername(body.username);
        if (!USERNAME_RE.test(username)) return json({ ok: false, message: 'bad_username' }, 400);
      }
      if (!passwordOk(body.next, username)) return json({ ok: false, message: 'weak_password' }, 400);
      if (claiming) {
        if (await ixGet(env, 'user', username)) return json({ ok: false, message: 'username_taken' }, 409);
        await ixPut(env, 'user', username, { tid: t.id });
        owner.username = username;
      }
      owner.pw = await hashPassword(body.next);
      owner.epoch += 1;
      await putOwner(t, owner);
      await log('password_changed', true);
      return json({ ok: true }, 200, { 'set-cookie': await createSession(env, 'tenant', owner, m, t.id) });
    }
    case '/recovery/new': {
      const next = newRecoveryCode();
      const nextHash = await sha256(normalizeRecovery(next));
      if (owner.recoveryHash) await ixDel(env, 'rec', owner.recoveryHash, true);
      await ixPut(env, 'rec', nextHash, { tid: t.id }, true);
      owner.recoveryHash = nextHash;
      await putOwner(t, owner);
      await log('recovery_new', true);
      return json({ ok: true, recoveryCode: next });
    }
    case '/account/delete': {
      if (body.confirm !== 'DELETE') return json({ ok: false, message: 'confirm_required' }, 400);
      notify(ctx, cfg, note(langOf(cfg), 'deleted'));
      await deleteTenant(t, owner.passkeys.map((p) => p.id), owner.recoveryHash, owner.username);
      return json({ ok: true }, 200, { 'set-cookie': clearCookie('tenant') });
    }
  }
  return json({ ok: false, message: 'not_found' }, 404);
}

// ================================================================ super admin (/sa)

async function saRoute(req: Request, env: Env, url: URL, parts: string[], m: ClientMeta, lang: Lang): Promise<Response> {
  const route = `${req.method} /${parts.join('/')}`;
  const sa = await getSuper(env);
  if (route === 'GET /' || route === 'GET ') {
    if (sa && (await superSession(req, env))) return html(saPage(lang));
    return html(saAuthPage(lang, !sa, await lockedOut(env, m)));
  }

  if (['POST /setup/options', 'POST /setup/verify', 'POST /login/options', 'POST /login/verify'].includes(route)) {
    const blocked = await authGuard(req, env, url, m);
    if (blocked) return blocked;
    const body = await readJson<{ setupCode: string; token: string; response: unknown; name: string }>(req);
    if (route === 'POST /setup/options') {
      if (sa) return json({ ok: false, message: 'forbidden' }, 409);
      if (typeof body.setupCode !== 'string' || !safeEqual(body.setupCode.trim().toUpperCase(), env.SETUP_CODE!.toUpperCase())) {
        return failed(env, m, 401, 'bad_setup_code');
      }
      return json({ ok: true, ...(await registrationOptions(env, url, 'sa-setup', null)) });
    }
    if (route === 'POST /setup/verify') {
      if (sa) return json({ ok: false, message: 'forbidden' }, 409);
      const r = await verifyRegistration(env, url, 'sa-setup', body.token, body.response, str(body.name, 40));
      if (!r) return failed(env, m, 400, 'passkey_create_failed');
      const rec: OwnerRecord = { userId: r.userId, passkeys: [r.passkey], epoch: 1, createdAt: new Date().toISOString() };
      await putSuper(env, rec);
      return json({ ok: true }, 200, { 'set-cookie': await createSession(env, 'sa', rec, m) });
    }
    if (!sa) return json({ ok: false, message: 'forbidden' }, 409);
    const purpose: AuthPurpose = 'sa-login';
    if (route === 'POST /login/options') return json({ ok: true, ...(await authenticationOptions(env, url, purpose)) });
    const r = await verifyAuthentication(env, url, purpose, body.token, body.response, async (id) => (sa.passkeys.some((p) => p.id === id) ? sa : null));
    if (!r) return failed(env, m, 401, 'login_failed');
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
  if (req.method !== 'POST' || parts[0] !== 'api') return json({ ok: false, message: 'not_found' }, 404);
  if (!sameOrigin(req, url)) return json({ ok: false, message: 'forbidden' }, 403);
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
      if (!meta || (body.status !== 'active' && body.status !== 'blocked')) return json({ ok: false, message: 'not_found' }, 404);
      await putMeta(env, { ...meta, status: body.status });
      return json({ ok: true });
    }
    case '/tenant/delete': {
      const id = str(body.id, 16);
      const meta = await getMeta(env, id);
      if (!meta || body.confirm !== id) return json({ ok: false, message: 'not_found' }, 404);
      const t = await tenant(env, id);
      const owner = await getOwner(t);
      await deleteTenant(t, owner?.passkeys.map((p) => p.id) ?? [], owner?.recoveryHash, owner?.username);
      return json({ ok: true });
    }
    case '/logout-all':
      me.epoch += 1;
      await putSuper(env, me);
      return json({ ok: true }, 200, { 'set-cookie': clearCookie(role) });
  }
  return json({ ok: false, message: 'not_found' }, 404);
}
