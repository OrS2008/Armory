import qrcode from 'qrcode-generator';
import { checkToken, listDevices, openGate, PalGateError, waitForLink, type Session } from './palgate/api';
import { adminPage, carPage, resultPage } from './pages';

export interface Env {
  GATE: KVNamespace;
  ADMIN_PASSWORD?: string;
}

export interface Gate {
  alias: string; // url-safe, e.g. "home"
  label: string; // shown to the driver, e.g. "שער החניה"
  deviceId: string;
  output: number;
}

export interface Config {
  secret: string;
  gates: Gate[];
  cooldownSec: number; // ignore repeats of the same gate within this window
  maxPerHour: number; // safety cap in case the link leaks
}

export interface LogEntry {
  at: string;
  gate: string;
  ok: boolean;
  via: string;
  detail?: string;
}

// ---------------------------------------------------------------- storage

const getSession = (env: Env) => env.GATE.get<Session>('session', 'json');

async function getConfig(env: Env): Promise<Config> {
  const cfg = await env.GATE.get<Config>('config', 'json');
  if (cfg) return cfg;
  const fresh: Config = { secret: newSecret(), gates: [], cooldownSec: 8, maxPerHour: 30 };
  await env.GATE.put('config', JSON.stringify(fresh));
  return fresh;
}

async function addLog(env: Env, entry: LogEntry) {
  const log = (await env.GATE.get<LogEntry[]>('log', 'json')) ?? [];
  log.unshift(entry);
  await env.GATE.put('log', JSON.stringify(log.slice(0, 50)));
}

function newSecret() {
  const b = crypto.getRandomValues(new Uint8Array(18));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_');
}

function safeEqual(a: string, b: string) {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  if (ea.length !== eb.length) return false;
  let diff = 0;
  for (let i = 0; i < ea.length; i++) diff |= ea[i]! ^ eb[i]!;
  return diff === 0;
}

// ---------------------------------------------------------------- opening

export type OpenResult =
  | { ok: true; gate: Gate; repeated: boolean }
  | { ok: false; status: number; message: string };

const hourKey = () => `count:${new Date().toISOString().slice(0, 13)}`;

export async function openByAlias(env: Env, alias: string | undefined, via: string): Promise<OpenResult> {
  const [session, cfg] = await Promise.all([getSession(env), getConfig(env)]);
  if (!session) return { ok: false, status: 503, message: 'PalGate is not linked yet' };
  const gate = alias ? cfg.gates.find((g) => g.alias === alias) : cfg.gates[0];
  if (!gate) return { ok: false, status: 404, message: 'No such gate' };

  // A voice assistant or a flaky connection may fetch the same URL twice.
  const lastKey = `last:${gate.alias}`;
  const last = Number(await env.GATE.get(lastKey));
  if (last && Date.now() - last < cfg.cooldownSec * 1000) return { ok: true, gate, repeated: true };

  const count = Number(await env.GATE.get(hourKey())) || 0;
  if (count >= cfg.maxPerHour) {
    await addLog(env, { at: new Date().toISOString(), gate: gate.alias, ok: false, via, detail: 'hourly cap' });
    return { ok: false, status: 429, message: 'Hourly limit reached' };
  }

  try {
    await openGate(session, gate.deviceId, gate.output);
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    await addLog(env, { at: new Date().toISOString(), gate: gate.alias, ok: false, via, detail });
    return { ok: false, status: 502, message: detail };
  }
  await Promise.all([
    env.GATE.put(lastKey, String(Date.now()), { expirationTtl: 60 }),
    env.GATE.put(hourKey(), String(count + 1), { expirationTtl: 7200 }),
    addLog(env, { at: new Date().toISOString(), gate: gate.alias, ok: true, via }),
  ]);
  return { ok: true, gate, repeated: false };
}

// Link-preview fetchers (WhatsApp, Telegram, iMessage…) must never open the gate
// just because someone pasted the link into a chat.
const PREVIEW_BOTS =
  /facebookexternalhit|facebot|whatsapp|telegrambot|slackbot|twitterbot|discordbot|linkedinbot|skypeuripreview|redditbot|embedly|pinterest|googlebot|bingbot|yandex|baiduspider|duckduckbot/i;

function viaFrom(req: Request) {
  const ua = req.headers.get('user-agent') ?? '';
  if (/grok|xai/i.test(ua)) return 'grok';
  if (/tesla|QtCarBrowser/i.test(ua)) return 'tesla-browser';
  return ua.slice(0, 60) || 'unknown';
}

// ---------------------------------------------------------------- http helpers

const NO_STORE = {
  'cache-control': 'no-store, max-age=0',
  'x-robots-tag': 'noindex, nofollow, noarchive',
  'referrer-policy': 'no-referrer',
};

const html = (body: string, status = 200) =>
  new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8', ...NO_STORE } });

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...NO_STORE },
  });

function adminAuthorized(req: Request, env: Env) {
  if (!env.ADMIN_PASSWORD) return false;
  const h = req.headers.get('authorization') ?? '';
  if (!h.startsWith('Basic ')) return false;
  try {
    const [, pass = ''] = atob(h.slice(6)).split(/:(.*)/s);
    return safeEqual(pass, env.ADMIN_PASSWORD);
  } catch {
    return false;
  }
}

const unauthorized = () =>
  new Response('Authentication required', {
    status: 401,
    headers: { 'www-authenticate': 'Basic realm="gate-admin", charset="UTF-8"', ...NO_STORE },
  });

// ---------------------------------------------------------------- router

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const parts = url.pathname.split('/').filter(Boolean);

    if (url.pathname === '/robots.txt') {
      // Allowed on purpose: some AI fetchers refuse URLs that robots.txt disallows.
      return new Response('User-agent: *\nAllow: /\n', { headers: { 'content-type': 'text/plain' } });
    }

    // /o/<secret>[/<alias>][/<anything, e.g. a cache-buster>]  → open
    if (parts[0] === 'o' && parts[1]) {
      const cfg = await getConfig(env);
      if (!safeEqual(parts[1], cfg.secret)) return html(resultPage({ ok: false, message: 'Not found' }), 404);
      if (req.method === 'HEAD' || req.method === 'OPTIONS') return new Response(null, { headers: NO_STORE });
      if (PREVIEW_BOTS.test(req.headers.get('user-agent') ?? '')) {
        return html(resultPage({ ok: false, message: 'Preview fetch ignored' }), 403);
      }
      const alias = parts[2] && cfg.gates.some((g) => g.alias === parts[2]) ? parts[2] : undefined;
      const r = await openByAlias(env, alias, viaFrom(req));
      if (url.searchParams.has('json') || req.headers.get('accept')?.includes('application/json')) {
        return json(r.ok ? { ok: true, gate: r.gate.label, repeated: r.repeated } : r, r.ok ? 200 : r.status);
      }
      return html(
        resultPage(r.ok ? { ok: true, label: r.gate.label, repeated: r.repeated } : { ok: false, message: r.message }),
        r.ok ? 200 : r.status,
      );
    }

    // /car/<secret> → big-button page for the Tesla touchscreen browser
    if (parts[0] === 'car' && parts[1]) {
      const cfg = await getConfig(env);
      if (!safeEqual(parts[1], cfg.secret)) return html(resultPage({ ok: false, message: 'Not found' }), 404);
      return html(carPage(cfg.secret, cfg.gates));
    }

    if (parts[0] === 'admin') {
      if (!env.ADMIN_PASSWORD) return html(resultPage({ ok: false, message: 'Set ADMIN_PASSWORD first: npx wrangler secret put ADMIN_PASSWORD' }), 503);
      if (!adminAuthorized(req, env)) return unauthorized();
      try {
        return await admin(req, env, url, parts.slice(1));
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return json({ ok: false, message, body: e instanceof PalGateError ? e.body : undefined }, 502);
      }
    }

    return new Response('OK', { headers: { 'content-type': 'text/plain', ...NO_STORE } });
  },
} satisfies ExportedHandler<Env>;

async function admin(req: Request, env: Env, url: URL, parts: string[]): Promise<Response> {
  const route = `${req.method} /${parts.join('/')}`;
  switch (route) {
    case 'GET /':
      return html(adminPage());

    case 'GET /api/state': {
      const [session, cfg, log] = await Promise.all([
        getSession(env),
        getConfig(env),
        env.GATE.get<LogEntry[]>('log', 'json'),
      ]);
      return json({
        linked: session ? { phone: maskPhone(session.phone), type: session.type, linkedAt: session.linkedAt } : null,
        config: cfg,
        origin: url.origin,
        log: log ?? [],
      });
    }

    case 'POST /api/link/start': {
      const id = crypto.randomUUID();
      const qr = qrcode(0, 'L');
      qr.addData(`{"id": "${id}"}`);
      qr.make();
      return json({ id, svg: qr.createSvgTag({ cellSize: 6, margin: 4, scalable: true }) });
    }

    case 'POST /api/link/wait': {
      const { id } = await req.json<{ id: string }>();
      if (!/^[0-9a-f-]{36}$/.test(id)) return json({ ok: false, message: 'bad id' }, 400);
      const session = await waitForLink(id, AbortSignal.timeout(90_000));
      await checkToken(session);
      await env.GATE.put('session', JSON.stringify(session));
      return json({ ok: true, phone: maskPhone(session.phone) });
    }

    case 'POST /api/unlink':
      await env.GATE.delete('session');
      return json({ ok: true });

    case 'GET /api/devices': {
      const session = await getSession(env);
      if (!session) return json({ ok: false, message: 'not linked' }, 400);
      const devices = await listDevices(session);
      return json({ ok: true, devices: devices.map(({ id, name, outputs }) => ({ id, name, outputs })) });
    }

    case 'POST /api/config': {
      const body = await req.json<Partial<Config>>();
      const cfg = await getConfig(env);
      if (Array.isArray(body.gates)) {
        const seen = new Set<string>();
        cfg.gates = body.gates
          .map((g) => ({
            alias: String(g.alias ?? '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 24),
            label: String(g.label ?? '').slice(0, 60),
            deviceId: String(g.deviceId ?? '').slice(0, 64),
            output: Math.max(1, Math.min(4, Number(g.output) || 1)),
          }))
          .filter((g) => g.alias && g.deviceId && !seen.has(g.alias) && seen.add(g.alias));
      }
      if (body.cooldownSec !== undefined) cfg.cooldownSec = clamp(body.cooldownSec, 0, 120);
      if (body.maxPerHour !== undefined) cfg.maxPerHour = clamp(body.maxPerHour, 1, 500);
      await env.GATE.put('config', JSON.stringify(cfg));
      return json({ ok: true, config: cfg });
    }

    case 'POST /api/rotate': {
      const cfg = await getConfig(env);
      cfg.secret = newSecret();
      await env.GATE.put('config', JSON.stringify(cfg));
      return json({ ok: true, secret: cfg.secret });
    }

    case 'POST /api/test': {
      const { alias } = await req.json<{ alias?: string }>();
      await env.GATE.delete(`last:${alias ?? ''}`);
      const r = await openByAlias(env, alias, 'admin-test');
      return json(r, r.ok ? 200 : r.status);
    }
  }
  return json({ ok: false, message: 'not found' }, 404);
}

const clamp = (v: unknown, lo: number, hi: number) => Math.max(lo, Math.min(hi, Number(v) || 0));
const maskPhone = (p: number) => {
  const s = String(p);
  return s.slice(0, 5) + '•••' + s.slice(-3);
};
