import qrcode from 'qrcode-generator';
import {
  checkCredentials,
  clearCookie,
  createSession,
  currentSession,
  destroySession,
  getAdmin,
  lockedOut,
  putAdmin,
  recordFailure,
  sameOrigin,
  validatePassword,
  type AdminRecord,
} from './auth';
import { base32, hashPassword, randomBytes, randomToken, safeEqual, verifyPassword, verifyTotp } from './crypto';
import { clientMeta, html, json, readJson, text, type ClientMeta } from './http';
import { adminPage, carPage, loginPage, resultPage, setupPage } from './pages';
import { checkToken, listDevices, openGate, PalGateError, waitForLink } from './palgate/api';
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
} from './store';

export type { Env, Gate, Config, Channel };

const GLOBAL_MAX_PER_HOUR = 100;
const BAD_SECRET_LIMIT = 20; // per IP per hour before that IP is ignored entirely

// Link-preview fetchers (WhatsApp, Telegram, iMessage…) must never open the gate
// just because someone pasted a link into a chat.
const PREVIEW_BOTS =
  /facebookexternalhit|facebot|whatsapp|telegrambot|slackbot|twitterbot|discordbot|linkedinbot|skypeuripreview|redditbot|embedly|pinterest|googlebot|bingbot|yandex|baiduspider|duckduckbot|applebot/i;

const hour = () => new Date().toISOString().slice(0, 13);

// ---------------------------------------------------------------- notifications

function notify(env: Env, ctx: ExecutionContext, cfg: Config | null, message: string) {
  const url = cfg?.notifyUrl;
  if (!url) return;
  ctx.waitUntil(
    fetch(url, { method: 'POST', body: message, headers: { Title: 'Gate', Tags: 'door' } }).then(
      () => undefined,
      () => undefined,
    ),
  );
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
  const deny = async (status: number, message: string, gate?: string) => {
    await addLog(env, { kind: 'denied', ok: false, gate, channel: who.label, ip: m.ip, country: m.country, detail: message });
    return { ok: false as const, status, message };
  };

  if (!cfg.enabled) return deny(423, 'Opening is switched off (master switch)');
  const ch = who.channel;
  if (ch) {
    if (!ch.enabled) return deny(403, 'This link is disabled');
    if (ch.countries.length && !ch.countries.includes(m.country)) {
      notify(env, ctx, cfg, `⚠️ ניסיון פתיחה נחסם: ${ch.name} מ-${m.country} (${m.ip})`);
      return deny(403, `Not allowed from ${m.country}`);
    }
  }

  const session = await getSession(env);
  if (!session) return deny(503, 'PalGate is not linked yet');
  const gate = alias ? cfg.gates.find((g) => g.alias === alias) : cfg.gates[0];
  if (!gate) return deny(404, 'No gate configured');

  // A voice assistant or a flaky connection may fetch the same URL twice.
  const lastKey = `last:${gate.alias}`;
  const last = Number(await env.GATE.get(lastKey));
  if (last && Date.now() - last < cfg.cooldownSec * 1000) return { ok: true, gate, repeated: true };

  if (ch && (await count(env, `cnt:${ch.id}:${hour()}`)) >= ch.maxPerHour) {
    notify(env, ctx, cfg, `⚠️ ${ch.name}: הגיע למגבלת הפתיחות לשעה`);
    return deny(429, 'Hourly limit reached for this link', gate.alias);
  }
  if ((await count(env, `cnt:all:${hour()}`)) >= GLOBAL_MAX_PER_HOUR) return deny(429, 'Global hourly limit reached', gate.alias);

  try {
    await openGate(session, gate.deviceId, gate.output);
  } catch (e) {
    return deny(502, e instanceof Error ? e.message : String(e), gate.alias);
  }

  const writes: Promise<unknown>[] = [
    env.GATE.put(lastKey, String(Date.now()), { expirationTtl: 60 }),
    bump(env, `cnt:all:${hour()}`, 7200),
    addLog(env, { kind: 'open', ok: true, gate: gate.alias, channel: who.label, ip: m.ip, country: m.country }),
  ];
  if (ch) {
    writes.push(bump(env, `cnt:${ch.id}:${hour()}`, 7200));
    ch.lastUsedAt = new Date().toISOString();
    writes.push(putConfig(env, cfg));
  }
  await Promise.all(writes);
  notify(env, ctx, cfg, `🚪 ${gate.label || gate.alias} נפתח — ${who.label} (${m.country})`);
  return { ok: true, gate, repeated: false };
}

/** Resolves a secret from the URL to its channel, with per-IP throttling of wrong guesses. */
async function resolveChannel(env: Env, secret: string, m: ClientMeta) {
  if ((await count(env, `bad:${m.ip}`)) >= BAD_SECRET_LIMIT) return { throttled: true as const };
  const cfg = await getConfig(env);
  let found: Channel | undefined;
  for (const c of cfg.channels) if (safeEqual(c.secret, secret)) found = c;
  if (!found) await bump(env, `bad:${m.ip}`, 3600);
  return { cfg, channel: found };
}

// ---------------------------------------------------------------- router

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    const parts = url.pathname.split('/').filter(Boolean);
    const m = clientMeta(req);

    if (url.pathname === '/robots.txt') {
      // Allowed on purpose: some AI fetchers refuse URLs that robots.txt disallows.
      return text('User-agent: *\nAllow: /\n');
    }
    if (url.protocol === 'http:' && !['localhost', '127.0.0.1'].includes(url.hostname)) {
      return Response.redirect(url.toString().replace(/^http:/, 'https:'), 301);
    }
    if (!env.ENC_KEY || !env.SETUP_CODE) return text('Server is not configured (ENC_KEY / SETUP_CODE missing)', 503);

    try {
      if (parts[0] === 'o' && parts[1]) return await openRoute(req, env, ctx, url, parts, m);
      if (parts[0] === 'car' && parts[1]) {
        const r = await resolveChannel(env, parts[1], m);
        if ('throttled' in r) return text('Too many requests', 429);
        if (!r.channel || r.channel.kind !== 'car') return html(resultPage({ ok: false, message: 'Not found' }), 404);
        return html(carPage(r.channel.secret, r.cfg.gates, r.channel.enabled && r.cfg.enabled));
      }
      if (parts[0] === 'admin') return await adminRoute(req, env, ctx, url, parts.slice(1), m);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const detail = e instanceof PalGateError ? e.body : undefined;
      return json({ ok: false, message, body: parts[0] === 'admin' ? detail : undefined }, 502);
    }
    return text('OK');
  },
} satisfies ExportedHandler<Env>;

async function openRoute(req: Request, env: Env, ctx: ExecutionContext, url: URL, parts: string[], m: ClientMeta) {
  const r = await resolveChannel(env, parts[1]!, m);
  if ('throttled' in r) return text('Too many requests', 429);
  const { cfg, channel } = r;
  if (!channel) return html(resultPage({ ok: false, message: 'Not found' }), 404);
  if (req.method === 'HEAD' || req.method === 'OPTIONS') return new Response(null, { status: 204 });
  if (PREVIEW_BOTS.test(m.ua)) return html(resultPage({ ok: false, message: 'Preview fetch ignored' }), 403);
  // Only Grok needs plain GET (it can only "visit" a link). The car button and
  // phone automations use POST, so prefetchers and stray clicks can't trigger them.
  if (channel.kind !== 'grok' && req.method !== 'POST') {
    return html(resultPage({ ok: false, message: 'This link only works from its button / automation (POST)' }), 405);
  }
  if (req.method !== 'GET' && req.method !== 'POST') return text('Method not allowed', 405);

  const alias = parts[2] && cfg.gates.some((g) => g.alias === parts[2]) ? parts[2] : undefined;
  const res = await performOpen(env, ctx, cfg, alias, { channel, label: channel.name }, m);
  const wantsJson = url.searchParams.has('json') || (req.headers.get('accept') ?? '').includes('application/json');
  if (wantsJson) {
    return json(res.ok ? { ok: true, gate: res.gate.label, repeated: res.repeated } : res, res.ok ? 200 : res.status);
  }
  return html(
    resultPage(res.ok ? { ok: true, label: res.gate.label, repeated: res.repeated } : { ok: false, message: res.message }),
    res.ok ? 200 : res.status,
  );
}

// ---------------------------------------------------------------- admin

interface PendingSetup {
  pw: AdminRecord['pw'];
  totp: string;
}

async function adminRoute(req: Request, env: Env, ctx: ExecutionContext, url: URL, parts: string[], m: ClientMeta) {
  const route = `${req.method} /${parts.join('/')}`;
  const admin = await getAdmin(env);

  if (route === 'GET /' || route === 'GET ') {
    if (!admin) return html(setupPage());
    if (await currentSession(req, env)) return html(adminPage());
    return html(loginPage());
  }
  if (req.method !== 'POST') return json({ ok: false, message: 'not found' }, 404);
  if (!sameOrigin(req, url)) return json({ ok: false, message: 'cross-origin request refused' }, 403);

  // ----- first-time setup: one-time code → own password → enrol authenticator
  if (route === 'POST /setup/start' || route === 'POST /setup/finish') {
    if (admin) return json({ ok: false, message: 'already set up' }, 409);
    if (await lockedOut(env, m)) return json({ ok: false, message: 'יותר מדי ניסיונות. נסה שוב בעוד 15 דקות.' }, 429);
    const body = await readJson<{ setupCode: string; password: string; token: string; code: string }>(req);
    if (route === 'POST /setup/start') {
      if (!safeEqual(String(body.setupCode ?? ''), env.SETUP_CODE!)) {
        await recordFailure(env, m);
        return json({ ok: false, message: 'קוד התקנה שגוי' }, 401);
      }
      const bad = validatePassword(body.password);
      if (bad) return json({ ok: false, message: bad }, 400);
      const totp = base32(randomBytes(20));
      const token = randomToken(24);
      await putSealed(env, `setup:${token}`, { pw: await hashPassword(body.password!), totp } satisfies PendingSetup, 900);
      const uri = `otpauth://totp/PalGate%20Grok:owner?secret=${totp}&issuer=PalGate%20Grok&algorithm=SHA1&digits=6&period=30`;
      return json({ ok: true, token, secret: totp, svg: qrSvg(uri) });
    }
    const pending = await getSealed<PendingSetup>(env, `setup:${String(body.token ?? '')}`);
    if (!pending) return json({ ok: false, message: 'פג תוקף, התחל מחדש' }, 400);
    const step = await verifyTotp(pending.totp, String(body.code ?? ''));
    if (step === null) {
      await recordFailure(env, m);
      return json({ ok: false, message: 'קוד אימות שגוי — ודא שהשעון בטלפון מדויק' }, 401);
    }
    const rec: AdminRecord = { pw: pending.pw, totp: pending.totp, lastStep: step, epoch: 1, createdAt: new Date().toISOString() };
    await putAdmin(env, rec);
    await env.GATE.delete(`setup:${String(body.token)}`);
    await addLog(env, { kind: 'admin', ok: true, detail: 'account created', ip: m.ip, country: m.country });
    return json({ ok: true }, 200, { 'set-cookie': await createSession(env, rec, m) });
  }

  if (route === 'POST /login') {
    if (!admin) return json({ ok: false, message: 'not set up' }, 409);
    const cfg = await getConfig(env);
    if (await lockedOut(env, m)) return json({ ok: false, message: 'יותר מדי ניסיונות. נסה שוב בעוד 15 דקות.' }, 429);
    const body = await readJson<{ password: string; code: string }>(req);
    const r = await checkCredentials(env, body.password, body.code);
    if (!r.ok) {
      await recordFailure(env, m);
      await addLog(env, { kind: 'admin', ok: false, detail: 'login failed', ip: m.ip, country: m.country });
      notify(env, ctx, cfg, `⚠️ ניסיון התחברות כושל לפאנל מ-${m.country} (${m.ip})`);
      return json({ ok: false, message: r.message }, 401);
    }
    await addLog(env, { kind: 'admin', ok: true, detail: 'login', ip: m.ip, country: m.country });
    notify(env, ctx, cfg, `🔐 התחברות לפאנל הניהול מ-${m.country} (${m.ip})`);
    return json({ ok: true }, 200, { 'set-cookie': await createSession(env, r.admin, m) });
  }

  if (route === 'POST /logout') {
    await destroySession(req, env);
    return json({ ok: true }, 200, { 'set-cookie': clearCookie });
  }

  // ----- everything below requires a signed-in owner
  const session = await currentSession(req, env);
  if (!session) return json({ ok: false, message: 'unauthorized' }, 401);
  return adminApi(req, env, ctx, url, route.replace(' /api', ' '), session, m);
}

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

  switch (route) {
    case 'POST /state': {
      const [session, log] = await Promise.all([getSession(env), getLog(env)]);
      return json({
        linked: session ? { phone: maskPhone(session.phone), type: session.type, linkedAt: session.linkedAt } : null,
        config: cfg,
        origin: url.origin,
        log: log.slice(0, 100),
      });
    }

    case 'POST /link/start': {
      const id = crypto.randomUUID();
      return json({ id, svg: qrSvg(`{"id": "${id}"}`) });
    }
    case 'POST /link/wait': {
      const id = String(body.id ?? '');
      if (!/^[0-9a-f-]{36}$/.test(id)) return json({ ok: false, message: 'bad id' }, 400);
      const session = await waitForLink(id, AbortSignal.timeout(90_000));
      await checkToken(session);
      await putSession(env, session);
      await addLog(env, { kind: 'admin', ok: true, detail: 'PalGate linked', ip: m.ip, country: m.country });
      return json({ ok: true, phone: maskPhone(session.phone) });
    }
    case 'POST /unlink':
      await env.GATE.delete('session');
      await addLog(env, { kind: 'admin', ok: true, detail: 'PalGate unlinked', ip: m.ip, country: m.country });
      return json({ ok: true });
    case 'POST /devices': {
      const session = await getSession(env);
      if (!session) return json({ ok: false, message: 'not linked' }, 400);
      const devices = await listDevices(session);
      return json({ ok: true, devices: devices.map(({ id, name, outputs }) => ({ id, name, outputs })) });
    }

    case 'POST /gates': {
      if (!Array.isArray(body.gates)) return json({ ok: false, message: 'gates required' }, 400);
      const seen = new Set<string>();
      cfg.gates = (body.gates as Partial<Gate>[])
        .slice(0, 20)
        .map((g) => ({
          alias: String(g.alias ?? '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 24),
          label: String(g.label ?? '').slice(0, 60),
          deviceId: String(g.deviceId ?? '').slice(0, 64),
          output: Math.max(1, Math.min(4, Number(g.output) || 1)),
        }))
        .filter((g) => g.alias && g.deviceId && !seen.has(g.alias) && seen.add(g.alias));
      await putConfig(env, cfg);
      return json({ ok: true });
    }

    case 'POST /settings': {
      if (typeof body.enabled === 'boolean') cfg.enabled = body.enabled;
      if (body.cooldownSec !== undefined) cfg.cooldownSec = clamp(body.cooldownSec, 0, 120);
      if (body.notifyUrl !== undefined) {
        const n = String(body.notifyUrl).trim();
        if (n && !/^https:\/\/[^\s/]+\/\S+$/.test(n)) return json({ ok: false, message: 'כתובת התראות חייבת להתחיל ב-https://' }, 400);
        cfg.notifyUrl = n.slice(0, 300);
      }
      await putConfig(env, cfg);
      await addLog(env, { kind: 'admin', ok: true, detail: `settings: ${cfg.enabled ? 'enabled' : 'MASTER OFF'}`, ip: m.ip, country: m.country });
      return json({ ok: true });
    }
    case 'POST /notify-test':
      notify(env, ctx, cfg, '✅ בדיקת התראה מפותחן השער');
      return json({ ok: true });

    case 'POST /channel/add': {
      const kind = String(body.kind) as ChannelKind;
      if (!['grok', 'car', 'phone'].includes(kind)) return json({ ok: false, message: 'bad kind' }, 400);
      if (cfg.channels.length >= 20) return json({ ok: false, message: 'too many links' }, 400);
      cfg.channels.push(newChannel(kind, typeof body.name === 'string' && body.name.trim() ? body.name.trim() : undefined));
      await putConfig(env, cfg);
      return json({ ok: true });
    }
    case 'POST /channel/update': {
      const c = channel();
      if (!c) return json({ ok: false, message: 'no such link' }, 404);
      if (typeof body.name === 'string' && body.name.trim()) c.name = body.name.trim().slice(0, 40);
      if (typeof body.enabled === 'boolean') c.enabled = body.enabled;
      if (body.maxPerHour !== undefined) c.maxPerHour = clamp(body.maxPerHour, 1, 100);
      if (body.countries !== undefined) {
        c.countries = String(body.countries)
          .toUpperCase()
          .split(/[\s,]+/)
          .filter((x) => /^[A-Z]{2}$/.test(x))
          .slice(0, 20);
      }
      await putConfig(env, cfg);
      return json({ ok: true });
    }
    case 'POST /channel/rotate': {
      const c = channel();
      if (!c) return json({ ok: false, message: 'no such link' }, 404);
      c.secret = randomToken(24);
      await putConfig(env, cfg);
      await addLog(env, { kind: 'admin', ok: true, detail: `rotated ${c.name}`, ip: m.ip, country: m.country });
      return json({ ok: true });
    }
    case 'POST /channel/delete': {
      const before = cfg.channels.length;
      cfg.channels = cfg.channels.filter((c) => c.id !== body.id);
      if (cfg.channels.length === before) return json({ ok: false, message: 'no such link' }, 404);
      await putConfig(env, cfg);
      return json({ ok: true });
    }

    case 'POST /test': {
      const alias = typeof body.alias === 'string' ? body.alias : undefined;
      await env.GATE.delete(`last:${alias ?? ''}`);
      const r = await performOpen(env, ctx, cfg, alias, { label: 'admin-test' }, m);
      return json(r, r.ok ? 200 : r.status);
    }

    case 'POST /logout-all':
      admin.epoch += 1;
      await putAdmin(env, admin);
      await addLog(env, { kind: 'admin', ok: true, detail: 'signed out everywhere', ip: m.ip, country: m.country });
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
      await addLog(env, { kind: 'admin', ok: true, detail: 'password changed', ip: m.ip, country: m.country });
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

const clamp = (v: unknown, lo: number, hi: number) => Math.max(lo, Math.min(hi, Number(v) || 0));
const maskPhone = (p: number) => {
  const s = String(p);
  return s.slice(0, 5) + '•••' + s.slice(-3);
};
