import qrcode from 'qrcode-generator';
import { accessEnabled, verifyAccess } from './access';
import {
  checkCredentials,
  clearCookie,
  cookie,
  createSession,
  currentSession,
  destroySession,
  DEVICE_COOKIE,
  getAdmin,
  lockedOut,
  PAIR_COOKIE,
  putAdmin,
  readCookie,
  recordFailure,
  sameOrigin,
  validatePassword,
  type AdminRecord,
} from './auth';
import { base32, hashPassword, randomBytes, randomToken, safeEqual, sha256, verifyPassword, verifyTotp } from './crypto';
import { clientMeta, html, json, readJson, text, type ClientMeta } from './http';
import { adminPage, carPage, iconSvg, loginPage, manifest, pairPage, resultPage, setupPage } from './pages';
import { checkToken, listDevices, openGate, waitForLink } from './palgate/api';
import {
  addLog,
  bump,
  count,
  getConfig,
  getLog,
  getSealed,
  getSession,
  newChannel,
  putConfig,
  putSealed,
  putSession,
  type Channel,
  type ChannelKind,
  type Config,
  type Env,
  type Gate,
  type RateLimiter,
} from './store';

export type { Env, Gate, Config, Channel };

const GLOBAL_MAX_PER_HOUR = 100;
const BAD_SECRET_LIMIT = 20; // per IP per hour, then that IP is ignored entirely
const SECRET_RE = /^[A-Za-z0-9_-]{32}$/;
const ALIAS_RE = /^[a-z0-9-]{1,24}$/;
const PAIR_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
const DEVICE_TTL = 365 * 86400;

// Link-preview fetchers (WhatsApp, Telegram, iMessage…) must never open the gate
// just because someone pasted a link into a chat.
const PREVIEW_BOTS =
  /facebookexternalhit|facebot|whatsapp|telegrambot|slackbot|twitterbot|discordbot|linkedinbot|skypeuripreview|redditbot|embedly|pinterest|googlebot|bingbot|yandex|baiduspider|duckduckbot|applebot/i;

const hour = () => new Date().toISOString().slice(0, 13);
const ref = () => randomToken(4).toUpperCase();

async function allowed(rl: RateLimiter | undefined, key: string) {
  if (!rl) return true;
  try {
    return (await rl.limit({ key })).success;
  } catch {
    return true; // fail open on the limiter itself; KV-backed limits still apply
  }
}

/** Runs a non-critical write; a failure (e.g. KV quota) must not undo a done action. */
async function quietly(p: Promise<unknown>) {
  try {
    await p;
  } catch (e) {
    console.error('non-critical write failed', e);
  }
}

// ---------------------------------------------------------------- notifications & audit

function notify(ctx: ExecutionContext, cfg: Config | null, message: string) {
  const url = cfg?.notifyUrl;
  if (!url) return;
  ctx.waitUntil(
    fetch(url, { method: 'POST', body: message, headers: { Title: 'Gate', Tags: 'door' } }).then(
      () => undefined,
      () => undefined,
    ),
  );
}

async function audit(env: Env, ctx: ExecutionContext, cfg: Config | null, m: ClientMeta, detail: string, alert = false) {
  await addLog(env, { kind: 'admin', ok: true, detail, ip: m.ip, country: m.country });
  if (alert) notify(ctx, cfg, `🔐 ${detail} (${m.country}, ${m.ip})`);
}

// ---------------------------------------------------------------- opening

export type OpenResult =
  | { ok: true; gate: Gate; repeated: boolean }
  | { ok: false; status: number; message: string };

async function performOpen(
  env: Env,
  ctx: ExecutionContext,
  cfg: Config,
  alias: string | undefined,
  who: { channel?: Channel; label: string },
  m: ClientMeta,
): Promise<OpenResult> {
  const deny = async (status: number, message: string, gate?: string, detail = message) => {
    await addLog(env, { kind: 'denied', ok: false, gate, channel: who.label, ip: m.ip, country: m.country, detail });
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
    if (ch.kind === 'grok' && ch.requireArm && !(await env.GATE.get(`arm:${ch.id}`))) {
      notify(ctx, cfg, `⚠️ Grok ביקש לפתוח כשהמערכת לא דרוכה (${m.country})`);
      return deny(403, 'Not armed. Arm it from your phone first', undefined, 'not armed');
    }
  }

  const session = await getSession(env);
  if (!session) return deny(503, 'Not set up yet', undefined, 'PalGate not linked');
  const gate = alias ? cfg.gates.find((g) => g.alias === alias) : cfg.gates[0];
  if (!gate) return deny(404, 'No gate configured');

  // A voice assistant or a flaky connection may fetch the same URL twice.
  const lastKey = `last:${gate.alias}`;
  const last = Number(await env.GATE.get(lastKey));
  if (last && Date.now() - last < cfg.cooldownSec * 1000) return { ok: true, gate, repeated: true };

  if (ch && (await count(env, `cnt:${ch.id}:${hour()}`)) >= ch.maxPerHour) {
    notify(ctx, cfg, `⚠️ ${ch.name}: הגיע למגבלת הפתיחות לשעה`);
    return deny(429, 'Hourly limit reached', gate.alias);
  }
  if ((await count(env, `cnt:all:${hour()}`)) >= GLOBAL_MAX_PER_HOUR) return deny(429, 'Hourly limit reached', gate.alias, 'global cap');

  try {
    await openGate(session, gate.deviceId, gate.output);
  } catch (e) {
    // The caller (Grok, a browser) gets only a reference; details go to the audit log.
    const r = ref();
    return deny(502, `Gate service error (ref ${r})`, gate.alias, `ref ${r}: ${e instanceof Error ? e.message : String(e)}`);
  }

  await Promise.all([
    quietly(env.GATE.put(lastKey, String(Date.now()), { expirationTtl: 60 })),
    quietly(bump(env, `cnt:all:${hour()}`, 7200)),
    addLog(env, { kind: 'open', ok: true, gate: gate.alias, channel: who.label, ip: m.ip, country: m.country }),
    ...(ch
      ? [
          quietly(bump(env, `cnt:${ch.id}:${hour()}`, 7200)),
          quietly(putConfig(env, { ...cfg, channels: cfg.channels.map((c) => (c.id === ch.id ? { ...c, lastUsedAt: new Date().toISOString() } : c)) })),
        ]
      : []),
  ]);
  notify(ctx, cfg, `🚪 ${gate.label || gate.alias} נפתח — ${who.label} (${m.country})`);
  return { ok: true, gate, repeated: false };
}

/** Resolves a URL secret to its channel, with per-IP throttling of wrong guesses. */
async function resolveSecret(env: Env, ctx: ExecutionContext, secret: string, m: ClientMeta) {
  if ((await count(env, `bad:${m.ip}`)) >= BAD_SECRET_LIMIT) return { throttled: true as const };
  const cfg = await getConfig(env);
  let found: Channel | undefined;
  if (SECRET_RE.test(secret)) for (const c of cfg.channels) if (c.secret && c.kind !== 'car' && safeEqual(c.secret, secret)) found = c;
  if (!found) {
    const n = await bump(env, `bad:${m.ip}`, 3600);
    if (n === BAD_SECRET_LIMIT) notify(ctx, cfg, `⚠️ IP ${m.ip} (${m.country}) ניחש ${n} קישורים שגויים ונחסם`);
  }
  return { cfg, channel: found };
}

async function deviceChannel(req: Request, env: Env) {
  const token = readCookie(req, DEVICE_COOKIE);
  if (!token) return null;
  const h = await sha256(token);
  const cfg = await getConfig(env);
  const channel = cfg.channels.find((c) => c.kind === 'car' && c.deviceHash && safeEqual(c.deviceHash, h));
  return channel ? { cfg, channel } : null;
}

// ---------------------------------------------------------------- router

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    const parts = url.pathname.split('/').filter(Boolean);
    const m = clientMeta(req);

    if (url.protocol === 'http:' && !['localhost', '127.0.0.1'].includes(url.hostname)) {
      return Response.redirect(url.toString().replace(/^http:/, 'https:'), 301);
    }
    if (url.pathname === '/robots.txt') return text('User-agent: *\nAllow: /\n'); // some AI fetchers obey it
    if (url.pathname === '/manifest.webmanifest') return new Response(manifest(), { headers: { 'content-type': 'application/manifest+json' } });
    if (url.pathname === '/icon.svg') return new Response(iconSvg(), { headers: { 'content-type': 'image/svg+xml', 'cache-control': 'public, max-age=86400' } });
    if (!env.ENC_KEY || !env.SETUP_CODE) return text('Service unavailable', 503);
    if (url.pathname.length > 200 || url.search.length > 300) return text('Bad request', 400);

    try {
      if (parts[0] === 'admin') return await adminRoute(req, env, ctx, url, parts.slice(1), m);
      if (['o', 'arm', 'car'].includes(parts[0] ?? '')) {
        if (!(await allowed(env.RL_PUBLIC, m.ip))) return text('Too many requests', 429);
        if (parts[0] === 'o' && parts[1] && parts.length <= 4) return await openRoute(req, env, ctx, url, parts, m);
        if (parts[0] === 'arm' && parts[1] && parts.length === 2) return await armRoute(req, env, ctx, parts[1], m);
        if (parts[0] === 'car') return await carRoute(req, env, ctx, url, parts.slice(1), m);
      }
    } catch (e) {
      // Never leak internals: log server-side, hand out a reference only.
      const r = ref();
      console.error(`ref ${r}`, e);
      return json({ ok: false, message: `Internal error (ref ${r})` }, 500);
    }
    return text('OK');
  },
} satisfies ExportedHandler<Env>;

async function openRoute(req: Request, env: Env, ctx: ExecutionContext, url: URL, parts: string[], m: ClientMeta) {
  const r = await resolveSecret(env, ctx, parts[1]!, m);
  if ('throttled' in r) return text('Too many requests', 429);
  const { cfg, channel } = r;
  if (!channel) return html(resultPage({ ok: false, message: 'Not found' }), 404);
  if (req.method === 'HEAD' || req.method === 'OPTIONS') return new Response(null, { status: 204 });
  if (PREVIEW_BOTS.test(m.ua)) return html(resultPage({ ok: false, message: 'Preview fetch ignored' }), 403);
  // Only Grok needs plain GET (it can only "visit" a link). Automations use POST,
  // so prefetchers and stray clicks can't trigger them.
  if (channel.kind !== 'grok' && req.method !== 'POST') return html(resultPage({ ok: false, message: 'Use POST' }), 405);
  if (req.method !== 'GET' && req.method !== 'POST') return text('Method not allowed', 405);

  const alias = parts[2] && ALIAS_RE.test(parts[2]) && cfg.gates.some((g) => g.alias === parts[2]) ? parts[2] : undefined;
  const res = await performOpen(env, ctx, cfg, alias, { channel, label: channel.name }, m);
  const wantsJson = url.searchParams.has('json') || (req.headers.get('accept') ?? '').includes('application/json');
  if (wantsJson) return json(res.ok ? { ok: true, gate: res.gate.label, repeated: res.repeated } : res, res.ok ? 200 : res.status);
  return html(
    resultPage(res.ok ? { ok: true, label: res.gate.label, repeated: res.repeated } : { ok: false, message: res.message }),
    res.ok ? 200 : res.status,
  );
}

/** POST /arm/<phone-secret>: a phone automation (e.g. "arriving home") arms Grok. */
async function armRoute(req: Request, env: Env, ctx: ExecutionContext, secret: string, m: ClientMeta) {
  const r = await resolveSecret(env, ctx, secret, m);
  if ('throttled' in r) return text('Too many requests', 429);
  const { cfg, channel } = r;
  if (!channel || channel.kind !== 'phone') return json({ ok: false, message: 'Not found' }, 404);
  if (req.method !== 'POST') return json({ ok: false, message: 'Use POST' }, 405);
  if (!channel.enabled || !cfg.enabled) return json({ ok: false, message: 'Disabled' }, 403);
  if (channel.countries.length && !channel.countries.includes(m.country)) return json({ ok: false, message: 'Not allowed from this location' }, 403);
  const minutes = await armGrok(env, cfg);
  await addLog(env, { kind: 'admin', ok: true, detail: `Grok armed for ${minutes} min by ${channel.name}`, ip: m.ip, country: m.country });
  return json({ ok: true, armedMinutes: minutes });
}

async function armGrok(env: Env, cfg: Config) {
  let minutes = 0;
  for (const c of cfg.channels.filter((x) => x.kind === 'grok' && x.requireArm)) {
    minutes = Math.max(minutes, c.armMinutes ?? 10);
    await env.GATE.put(`arm:${c.id}`, '1', { expirationTtl: Math.max(60, (c.armMinutes ?? 10) * 60) });
  }
  return minutes;
}

// ---------------------------------------------------------------- paired devices (car / phone browser)

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
    return json({ ok: true, done: true }, 200, {
      'set-cookie': cookie(DEVICE_COOKIE, rec.token, DEVICE_TTL),
    });
  }
  if (route === 'POST /open') {
    const dev = await deviceChannel(req, env);
    if (!dev) return json({ ok: false, message: 'This device is not paired' }, 401);
    const { alias } = await readJson<{ alias: string }>(req);
    const a = typeof alias === 'string' && ALIAS_RE.test(alias) ? alias : undefined;
    const res = await performOpen(env, ctx, dev.cfg, a, { channel: dev.channel, label: dev.channel.name }, m);
    return json(res.ok ? { ok: true, gate: res.gate.label, repeated: res.repeated } : res, res.ok ? 200 : res.status);
  }
  return json({ ok: false, message: 'not found' }, 404);
}

// ---------------------------------------------------------------- admin

interface PendingSetup {
  pw: AdminRecord['pw'];
  totp: string;
}

const tooMany = (seconds: number) =>
  json({ ok: false, message: 'יותר מדי ניסיונות', retryAfter: seconds }, 429, { 'retry-after': String(seconds) });

async function adminRoute(req: Request, env: Env, ctx: ExecutionContext, url: URL, parts: string[], m: ClientMeta) {
  if (!(await allowed(env.RL_ADMIN, m.ip))) return text('Too many requests', 429);
  if (accessEnabled(env) && !(await verifyAccess(req, env))) return text('Cloudflare Access required', 403);

  const route = `${req.method} /${parts.join('/')}`;
  const admin = await getAdmin(env);

  if (route === 'GET /' || route === 'GET ') {
    if (!admin) return html(setupPage());
    if (await currentSession(req, env)) return html(adminPage());
    return html(loginPage(await lockedOut(env, m)));
  }
  if (req.method !== 'POST') return json({ ok: false, message: 'not found' }, 404);
  if (!sameOrigin(req, url)) return json({ ok: false, message: 'cross-origin request refused' }, 403);

  const isAuth = ['POST /setup/start', 'POST /setup/finish', 'POST /login'].includes(route);
  if (isAuth) {
    if (!(await allowed(env.RL_AUTH, m.ip))) return tooMany(60);
    const wait = await lockedOut(env, m);
    if (wait) return tooMany(wait);
  }
  const fail = async (status: number, message: string) => {
    const lock = await recordFailure(env, m);
    if (lock) {
      notify(ctx, await getConfig(env), `🚨 נעילה: 5 ניסיונות כושלים לפאנל מ-${m.country} (${m.ip})`);
      return tooMany(lock);
    }
    return json({ ok: false, message }, status);
  };

  // ----- first-time setup: one-time code → own password → enrol authenticator
  if (route === 'POST /setup/start' || route === 'POST /setup/finish') {
    if (admin) return json({ ok: false, message: 'already set up' }, 409);
    const body = await readJson<{ setupCode: string; password: string; token: string; code: string }>(req);
    if (route === 'POST /setup/start') {
      if (typeof body.setupCode !== 'string' || !safeEqual(body.setupCode.trim().toUpperCase(), env.SETUP_CODE!.toUpperCase())) {
        return fail(401, 'קוד התקנה שגוי');
      }
      const bad = validatePassword(body.password);
      if (bad) return json({ ok: false, message: bad }, 400);
      const totp = base32(randomBytes(20));
      const token = randomToken(24);
      await putSealed(env, `setup:${token}`, { pw: await hashPassword(body.password!), totp } satisfies PendingSetup, 900);
      const uri = `otpauth://totp/PalGate%20Grok:owner?secret=${totp}&issuer=PalGate%20Grok&algorithm=SHA1&digits=6&period=30`;
      return json({ ok: true, token, secret: totp, svg: qrSvg(uri), uri });
    }
    if (typeof body.token !== 'string' || !SECRET_RE.test(body.token)) return json({ ok: false, message: 'פג תוקף, התחל מחדש' }, 400);
    const pending = await getSealed<PendingSetup>(env, `setup:${body.token}`);
    if (!pending) return json({ ok: false, message: 'פג תוקף, התחל מחדש' }, 400);
    const step = await verifyTotp(pending.totp, String(body.code ?? ''));
    if (step === null) return fail(401, 'קוד שגוי. ודא שהשעון בטלפון מכוון אוטומטית');
    const rec: AdminRecord = { pw: pending.pw, totp: pending.totp, lastStep: step, epoch: 1, createdAt: new Date().toISOString() };
    await putAdmin(env, rec);
    await env.GATE.delete(`setup:${body.token}`);
    await audit(env, ctx, null, m, 'account created');
    return json({ ok: true }, 200, { 'set-cookie': await createSession(env, rec, m) });
  }

  if (route === 'POST /login') {
    if (!admin) return json({ ok: false, message: 'not set up' }, 409);
    const body = await readJson<{ password: string; code: string }>(req);
    const r = await checkCredentials(env, body.password, body.code);
    const cfg = await getConfig(env);
    if (!r.ok) {
      await addLog(env, { kind: 'admin', ok: false, detail: 'login failed', ip: m.ip, country: m.country });
      notify(ctx, cfg, `⚠️ ניסיון התחברות כושל לפאנל מ-${m.country} (${m.ip})`);
      return fail(401, r.message);
    }
    await audit(env, ctx, cfg, m, 'התחברות לפאנל', true);
    return json({ ok: true }, 200, { 'set-cookie': await createSession(env, r.admin, m) });
  }

  if (route === 'POST /logout') {
    await destroySession(req, env);
    return json({ ok: true }, 200, { 'set-cookie': clearCookie });
  }

  // ----- everything below requires a signed-in owner (checked on the server, every time)
  const session = await currentSession(req, env);
  if (!session) return json({ ok: false, message: 'unauthorized' }, 401);
  return adminApi(req, env, ctx, url, route.replace(' /api', ' '), session, m);
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

async function adminApi(
  req: Request,
  env: Env,
  ctx: ExecutionContext,
  url: URL,
  route: string,
  admin: AdminRecord,
  m: ClientMeta,
): Promise<Response> {
  const body = await readJson<Record<string, unknown>>(req);
  const cfg = await getConfig(env);
  const channel = () => cfg.channels.find((c) => c.id === body.id);
  const log = (detail: string, alert = false) => audit(env, ctx, cfg, m, detail, alert);

  switch (route) {
    case 'POST /state': {
      const [session, entries, armed] = await Promise.all([
        getSession(env),
        getLog(env),
        Promise.all(cfg.channels.filter((c) => c.kind === 'grok').map(async (c) => [c.id, !!(await env.GATE.get(`arm:${c.id}`))] as const)),
      ]);
      return json({
        linked: session ? { phone: maskPhone(session.phone), linkedAt: session.linkedAt } : null,
        // deviceHash is never sent to the browser
        config: { ...cfg, channels: cfg.channels.map(({ deviceHash: _d, ...c }) => c) },
        armed: Object.fromEntries(armed),
        access: accessEnabled(env),
        origin: url.origin,
        log: entries.slice(0, 150),
      });
    }

    case 'POST /link/start': {
      const id = crypto.randomUUID();
      return json({ id, svg: qrSvg(`{"id": "${id}"}`) });
    }
    case 'POST /link/wait': {
      const id = str(body.id, 36);
      if (!/^[0-9a-f-]{36}$/.test(id)) return json({ ok: false, message: 'bad id' }, 400);
      try {
        const session = await waitForLink(id, AbortSignal.timeout(90_000));
        await checkToken(session);
        await putSession(env, session);
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
    case 'POST /unlink':
      await env.GATE.delete('session');
      await log('חשבון PalGate נותק', true);
      return json({ ok: true });
    case 'POST /devices': {
      const session = await getSession(env);
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

    case 'POST /gates': {
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
      await putConfig(env, cfg);
      await log(`שערים עודכנו (${cfg.gates.length})`);
      return json({ ok: true });
    }

    case 'POST /settings': {
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
      await putConfig(env, cfg);
      if (changes.length) await log(changes.join(', '), true);
      return json({ ok: true });
    }
    case 'POST /notify-test':
      notify(ctx, cfg, '✅ בדיקת התראה מפותחן השער');
      return json({ ok: true });

    case 'POST /arm': {
      const minutes = await armGrok(env, cfg);
      await log(`Grok נדרך ל-${minutes} דק׳ מהפאנל`);
      return json({ ok: true, armedMinutes: minutes });
    }

    case 'POST /channel/add': {
      const kind = str(body.kind, 10) as ChannelKind;
      if (kind !== 'grok' && kind !== 'phone') return json({ ok: false, message: 'bad kind' }, 400);
      if (cfg.channels.length >= 20) return json({ ok: false, message: 'יותר מדי גישות' }, 400);
      const c = newChannel(kind, str(body.name, 40) || undefined);
      cfg.channels.push(c);
      await putConfig(env, cfg);
      await log(`נוספה גישה: ${c.name}`, true);
      return json({ ok: true });
    }
    case 'POST /channel/update': {
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
      await putConfig(env, cfg);
      await log(`גישה עודכנה: ${c.name}${before !== c.enabled ? (c.enabled ? ' (הופעלה)' : ' (הושבתה)') : ''}`, before !== c.enabled);
      return json({ ok: true });
    }
    case 'POST /channel/rotate': {
      const c = channel();
      if (!c || c.kind === 'car') return json({ ok: false, message: 'no such access' }, 404);
      c.secret = randomToken(24);
      await putConfig(env, cfg);
      await log(`קישור הוחלף: ${c.name}`, true);
      return json({ ok: true });
    }
    case 'POST /channel/delete': {
      const c = channel();
      if (!c) return json({ ok: false, message: 'no such access' }, 404);
      cfg.channels = cfg.channels.filter((x) => x.id !== c.id);
      await putConfig(env, cfg);
      await log(`גישה נמחקה: ${c.name}`, true);
      return json({ ok: true });
    }

    case 'POST /pair/approve': {
      const code = str(body.code, 12).toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (!/^[A-Z2-9]{6}$/.test(code)) return json({ ok: false, message: 'קוד לא תקין' }, 400);
      const rec = await getSealed<PairRecord>(env, `pair:${code}`);
      if (!rec || rec.status !== 'pending') return json({ ok: false, message: 'קוד לא נמצא או שפג תוקפו' }, 404);
      if (cfg.channels.length >= 20) return json({ ok: false, message: 'יותר מדי גישות' }, 400);
      const token = randomToken(32);
      const c = newChannel('car', str(body.name, 40) || 'מכשיר');
      c.secret = '';
      c.deviceHash = await sha256(token);
      cfg.channels.push(c);
      await putConfig(env, cfg);
      await putSealed(env, `pair:${code}`, { ...rec, status: 'approved', token } satisfies PairRecord, 120);
      await log(`מכשיר חדש צומד: ${c.name}`, true);
      return json({ ok: true });
    }

    case 'POST /test': {
      const alias = str(body.alias, 24);
      if (alias) await env.GATE.delete(`last:${alias}`);
      const r = await performOpen(env, ctx, cfg, alias || undefined, { label: 'בדיקה מהפאנל' }, m);
      return json(r, r.ok ? 200 : r.status);
    }

    case 'POST /logout-all':
      admin.epoch += 1;
      await putAdmin(env, admin);
      await log('ניתוק מכל המכשירים', true);
      return json({ ok: true }, 200, { 'set-cookie': clearCookie });

    case 'POST /password': {
      if (!(await verifyPassword(String(body.current ?? ''), admin.pw))) return json({ ok: false, message: 'הסיסמה הנוכחית שגויה' }, 401);
      const step = await verifyTotp(admin.totp, String(body.code ?? ''), admin.lastStep);
      if (step === null) return json({ ok: false, message: 'קוד אימות שגוי' }, 401);
      const bad = validatePassword(body.next);
      if (bad) return json({ ok: false, message: bad }, 400);
      admin.pw = await hashPassword(String(body.next));
      admin.lastStep = step;
      admin.epoch += 1; // every other device is signed out
      await putAdmin(env, admin);
      await log('הסיסמה הוחלפה', true);
      return json({ ok: true }, 200, { 'set-cookie': await createSession(env, admin, m) });
    }
  }
  return json({ ok: false, message: 'not found' }, 404);
}

function qrSvg(data: string) {
  const qr = qrcode(0, 'M');
  qr.addData(data);
  qr.make();
  return qr.createSvgTag({ cellSize: 6, margin: 4, scalable: true });
}

const clamp = (v: unknown, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.floor(Number(v)) || lo));
const maskPhone = (p: number) => {
  const s = String(p);
  return s.slice(0, 5) + '•••' + s.slice(-3);
};
