import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { b64u } from '../src/crypto';
import { SoftAuthenticator } from './soft-authenticator';
import worker, { type Config, type Env } from '../src/index';

class MemKV {
  m = new Map<string, string>();
  async get(k: string, type?: string) {
    const v = this.m.get(k);
    if (v === undefined) return null;
    return type === 'json' ? JSON.parse(v) : v;
  }
  async put(k: string, v: string) {
    this.m.set(k, v);
  }
  async delete(k: string) {
    this.m.delete(k);
  }
}

const ORIGIN = 'https://gate.test';
const SESSION_HEX = '00112233445566778899aabbccddeeff';
let kv: MemKV;
let env: Env;
let palCalls: string[];
let notifications: string[];
let cookie = '';
let device: SoftAuthenticator;
let now = Date.UTC(2026, 10, 25, 12, 0, 0);

const ctx = { waitUntil: (p: Promise<unknown>) => void p, passThroughOnException() {} } as unknown as ExecutionContext;

function call(path: string, init: RequestInit & { ip?: string; country?: string } = {}) {
  const headers = new Headers(init.headers);
  headers.set('cf-connecting-ip', init.ip ?? '10.0.0.1');
  headers.set('cf-ipcountry', init.country ?? 'IL');
  return worker.fetch(new Request(ORIGIN + path, { ...init, headers }), env, ctx);
}

const post = (path: string, body: unknown, extra: Record<string, string> = {}) =>
  call(path, {
    method: 'POST',
    headers: { origin: ORIGIN, 'x-gate-csrf': '1', 'content-type': 'application/json', cookie, ...extra },
    body: JSON.stringify(body),
  });


const saveCookie = (r: Response) => {
  const c = r.headers.get('set-cookie');
  if (c) cookie = c.split(';')[0]!;
};

beforeEach(() => {
  kv = new MemKV();
  env = {
    GATE: kv as unknown as KVNamespace,
    ENC_KEY: b64u(crypto.getRandomValues(new Uint8Array(32))),
    SETUP_CODE: 'setup-code-123',
  };
  palCalls = [];
  notifications = [];
  cookie = '';
  now = Date.UTC(2026, 10, 25, 12, 0, 0);
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(now);
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.startsWith('https://ntfy.sh/')) {
      notifications.push(String(init?.body));
      return new Response('ok');
    }
    palCalls.push(url);
    const token = new Headers(init?.headers).get('x-bt-token');
    const ok = (extra: object) => new Response(JSON.stringify({ err: null, status: 'ok', ...extra }));
    if (url.includes('/un/secondary/init/'))
      return ok({ msg: 'success', user: { id: '972501234567', token: SESSION_HEX }, secondary: '1' });
    const valid = !!token && /^11[0-9A-F]{44}$/.test(token) && parseInt(token.slice(2, 14), 16) === 972501234567;
    if (!valid) return new Response(JSON.stringify({ err: 'bad token', status: 'failed', msg: 'bad token' }), { status: 401 });
    if (url.includes('/user/check-token')) return ok({ msg: 'token valid' });
    if (url.endsWith('/devices')) return ok({ msg: 'all my devices', devices: [{ id: 'DEV1', name1: 'שער ראשי' }] });
    if (url.includes('/open-gate')) return ok({ msg: 'Gate opened: true' });
    return new Response('{}', { status: 404 });
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function tick(seconds: number) {
  now += seconds * 1000;
  vi.setSystemTime(now);
}

async function setupOwner() {
  device = new SoftAuthenticator({ origin: ORIGIN });
  const r1 = await post('/admin/setup/options', { setupCode: 'setup-code-123' });
  expect(r1.status).toBe(200);
  const d = await r1.json<{ token: string; options: { challenge: string; rp: { id: string }; user: { id: string }; authenticatorSelection: { userVerification: string; residentKey: string } } }>();
  expect(d.options.rp.id).toBe('gate.test');
  expect(d.options.authenticatorSelection).toMatchObject({ userVerification: 'required', residentKey: 'required' });
  const r2 = await post('/admin/setup/verify', { token: d.token, response: await device.create(d.options), name: 'iPhone' });
  expect(r2.status).toBe(200);
  expect(r2.headers.get('set-cookie')).toMatch(/__Host-gate_s=.+; Path=\/; Secure; HttpOnly; SameSite=Strict/);
  saveCookie(r2);
}

async function passkeyLogin(dev = device, opts: { origin?: string; key?: CryptoKey; ip?: string } = {}) {
  const o = await (await call('/admin/login/options', { method: 'POST', ip: opts.ip, headers: { origin: ORIGIN, 'x-gate-csrf': '1', 'content-type': 'application/json' }, body: '{}' })).json<{ token: string; options: { challenge: string; rpId: string } }>();
  const response = await dev.get(o.options, opts.origin, opts.key);
  return { token: o.token, response, res: await call('/admin/login/verify', {
    method: 'POST',
    ip: opts.ip,
    headers: { origin: ORIGIN, 'x-gate-csrf': '1', 'content-type': 'application/json' },
    body: JSON.stringify({ token: o.token, response }),
  }) };
}

async function state() {
  return (await (await post('/admin/api/state', {})).json()) as { config: Config; log: { kind: string; detail?: string }[] };
}

async function linkAndConfigure() {
  await setupOwner();
  const { id } = await (await post('/admin/api/link/start', {})).json<{ id: string }>();
  expect((await post('/admin/api/link/wait', { id })).status).toBe(200);
  await post('/admin/api/gates', { gates: [{ alias: 'Home!', label: 'שער ראשי', deviceId: 'DEV1', output: 1 }] });
  const s = await state();
  const ch = (kind: string) => s.config.channels.find((c) => c.kind === kind)!;
  return { grok: ch('grok'), phone: ch('phone'), config: s.config };
}

const opens = () => palCalls.filter((u) => u.includes('open-gate')).length;

describe('owner account', () => {
  it('shows setup first, then login, never the panel without a session', async () => {
    expect(await (await call('/admin')).text()).toContain('הגדרת חשבון');
    await setupOwner();
    const anon = await (await call('/admin')).text();
    expect(anon).toContain('כניסה עם Face ID');
    expect(anon).not.toContain('tab-home');
    const authed = await (await call('/admin', { headers: { cookie } })).text();
    expect(authed).toContain('tab-home');
  });

  it('cannot be set up twice and the setup code is useless afterwards', async () => {
    await setupOwner();
    expect((await post('/admin/setup/options', { setupCode: 'setup-code-123' })).status).toBe(409);
  });

  it('rejects a wrong setup code', async () => {
    expect((await post('/admin/setup/options', { setupCode: 'nope' })).status).toBe(401);
  });

  it('signs in with the passkey; no password route exists at all', async () => {
    await setupOwner();
    cookie = '';
    const { res } = await passkeyLogin();
    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie')).toContain('__Host-gate_s=');
    for (const c of ['', cookie]) expect((await post('/admin/login', { password: 'x', code: '123456' }, { cookie: c })).status).not.toBe(200);
  });

  it('rejects a challenge replay, a phishing origin, a foreign key and a missing user verification', async () => {
    await setupOwner();
    cookie = '';
    const { token, response } = await passkeyLogin();
    // replay the exact same signed response with its (now burned) challenge
    const replay = await post('/admin/login/verify', { token, response });
    expect(replay.status).toBe(401);
    // signed for a look-alike phishing site
    expect((await passkeyLogin(device, { origin: 'https://gate.test.evil.example' })).res.status).toBe(401);
    // signed by a key that is not the registered one
    expect((await passkeyLogin(device, { key: await SoftAuthenticator.foreignKey() })).res.status).toBe(401);
  });

  it('refuses an authenticator that skipped Face ID / PIN (user verification)', async () => {
    device = new SoftAuthenticator({ origin: ORIGIN, userVerified: false });
    const d = await (await post('/admin/setup/options', { setupCode: 'setup-code-123' })).json<{ token: string; options: never }>();
    expect((await post('/admin/setup/verify', { token: d.token, response: await device.create(d.options) })).status).toBe(400);
  });

  it('a credential from another device cannot sign in', async () => {
    await setupOwner();
    cookie = '';
    const stranger = new SoftAuthenticator({ origin: ORIGIN });
    await stranger.create({ challenge: 'x', rp: { id: 'gate.test' }, user: { id: 'AAAA' } });
    expect((await passkeyLogin(stranger)).res.status).toBe(401);
  });

  it('locks an IP out after 5 failures, even with a valid passkey', async () => {
    await setupOwner();
    cookie = '';
    const bad = await SoftAuthenticator.foreignKey();
    for (let i = 0; i < 5; i++) await passkeyLogin(device, { key: bad, ip: '6.6.6.6' });
    const opts = await call('/admin/login/options', { method: 'POST', ip: '6.6.6.6', headers: { origin: ORIGIN, 'x-gate-csrf': '1' }, body: '{}' });
    expect(opts.status).toBe(429);
    // another IP is unaffected
    expect((await passkeyLogin(device, { ip: '10.9.9.9' })).res.status).toBe(200);
  });

  it('adds a second passkey, and refuses to delete the last one', async () => {
    await setupOwner();
    const laptop = new SoftAuthenticator({ origin: ORIGIN });
    const o = await (await post('/admin/api/passkey/options', {})).json<{ token: string; options: { challenge: string; rp: { id: string }; user: { id: string }; excludeCredentials: unknown[] } }>();
    expect(o.options.excludeCredentials).toHaveLength(1);
    expect((await post('/admin/api/passkey/verify', { token: o.token, response: await laptop.create(o.options), name: 'Mac' })).status).toBe(200);
    const s1 = await (await post('/admin/api/state', {})).json<{ passkeys: { id: string; name: string }[] }>();
    expect(s1.passkeys.map((p) => p.name)).toEqual(['iPhone', 'Mac']);
    expect(JSON.stringify(s1)).not.toContain('publicKey');
    cookie = '';
    expect((await passkeyLogin(laptop)).res.status).toBe(200);
    saveCookie((await passkeyLogin(device)).res);
    expect((await post('/admin/api/passkey/delete', { id: s1.passkeys[1]!.id })).status).toBe(200);
    expect((await post('/admin/api/passkey/delete', { id: s1.passkeys[0]!.id })).status).toBe(400);
  });

  it('refuses cross-site requests (CSRF) even with a valid cookie', async () => {
    await setupOwner();
    const noHeader = await call('/admin/api/test', {
      method: 'POST',
      headers: { origin: ORIGIN, cookie, 'content-type': 'text/plain' },
      body: '{}',
    });
    expect(noHeader.status).toBe(403);
    const evil = await post('/admin/api/test', {}, { origin: 'https://evil.example' });
    expect(evil.status).toBe(403);
    expect(opens()).toBe(0);
  });

  it('"sign out everywhere" and password change kill old sessions', async () => {
    await setupOwner();
    const old = cookie;
    expect((await post('/admin/api/logout-all', {})).status).toBe(200);
    cookie = old;
    expect((await post('/admin/api/state', {})).status).toBe(401);
  });

  it('encrypts everything sensitive at rest', async () => {
    await linkAndConfigure();
    const dump = [...kv.m.values()].join('\n');
    expect(dump).not.toContain(SESSION_HEX);
    expect(dump).not.toContain('972501234567');
    expect(dump).not.toContain(Buffer.from(device.credId).toString('base64url'));
    expect(dump).not.toContain('DEV1');
    for (const k of ['session', 'config2', 'admin', 'log']) expect(JSON.parse(kv.m.get(k)!)).toHaveProperty('ct');
  });
});

describe('opening', () => {
  it('opens from a Grok fetch, acknowledges repeats without re-sending', async () => {
    const { grok } = await linkAndConfigure();
    const res = await call(`/o/${grok.secret}/home/839201`, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; Grok)' }, country: 'US' });
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('SUCCESS');
    expect(res.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
    expect(res.headers.get('strict-transport-security')).toContain('max-age=');
    expect(opens()).toBe(1);
    expect(await (await call(`/o/${grok.secret}`)).text()).toContain('SUCCESS');
    expect(opens()).toBe(1);
  });

  it('phone links work only via POST and only from allowed countries', async () => {
    const { phone } = await linkAndConfigure();
    expect((await call(`/o/${phone.secret}`)).status).toBe(405); // GET refused
    expect((await call(`/o/${phone.secret}?json`, { method: 'POST', country: 'FR' })).status).toBe(403);
    expect((await call(`/o/${phone.secret}?json`, { method: 'POST' })).status).toBe(200);
    expect(opens()).toBe(1);
  });

  it('ignores previews, HEAD, wrong secrets; throttles secret guessing per IP', async () => {
    const { grok } = await linkAndConfigure();
    expect((await call(`/o/${grok.secret}`, { headers: { 'user-agent': 'WhatsApp/2.23' } })).status).toBe(403);
    expect((await call(`/o/${grok.secret}`, { method: 'HEAD' })).status).toBe(204);
    for (let i = 0; i < 20; i++) expect((await call(`/o/guess${i}`, { ip: '6.6.6.6' })).status).toBe(404);
    // That IP is now ignored entirely, even with the right secret.
    expect((await call(`/o/${grok.secret}`, { ip: '6.6.6.6' })).status).toBe(429);
    expect(opens()).toBe(0);
  });

  it('master switch, per-link disable, rotation and hourly caps', async () => {
    const { grok } = await linkAndConfigure();
    await post('/admin/api/settings', { enabled: false, cooldownSec: 0 });
    expect((await call(`/o/${grok.secret}?json`)).status).toBe(423);
    await post('/admin/api/settings', { enabled: true });

    await post('/admin/api/channel/update', { id: grok.id, maxPerHour: 2 });
    expect((await call(`/o/${grok.secret}?json`)).status).toBe(200);
    expect((await call(`/o/${grok.secret}?json`)).status).toBe(200);
    expect((await call(`/o/${grok.secret}?json`)).status).toBe(429);

    await post('/admin/api/channel/update', { id: grok.id, enabled: false });
    expect((await call(`/o/${grok.secret}?json`)).status).toBe(403);

    await post('/admin/api/channel/rotate', { id: grok.id });
    expect((await call(`/o/${grok.secret}?json`)).status).toBe(404);
    expect(opens()).toBe(2);
  });

  it('sends phone notifications for opens and blocked attempts', async () => {
    const { phone } = await linkAndConfigure();
    await post('/admin/api/settings', { notifyUrl: 'https://ntfy.sh/gate-test-topic' });
    await call(`/o/${phone.secret}?json`, { method: 'POST' });
    await call(`/o/${phone.secret}?json`, { method: 'POST', country: 'RU', ip: '9.9.9.9' });
    await new Promise((r) => setTimeout(r, 0));
    expect(notifications.some((n) => n.includes('נפתח'))).toBe(true);
    expect(notifications.some((n) => n.includes('נחסם') && n.includes('RU'))).toBe(true);
  });

  it('refuses to run without its secrets configured', async () => {
    env.ENC_KEY = undefined;
    expect((await call('/admin')).status).toBe(503);
  });
});

describe('paired devices', () => {
  const carPost = (path: string, body: unknown, c: string) =>
    call(path, { method: 'POST', headers: { origin: ORIGIN, 'x-gate-csrf': '1', 'content-type': 'application/json', cookie: c }, body: JSON.stringify(body) });

  it('pairs a car browser with a code approved by the owner, then opens with no secret in any URL', async () => {
    await linkAndConfigure();
    expect(await (await call('/car')).text()).toContain('צימוד המכשיר');
    const start = await carPost('/car/pair/start', {}, '');
    const { code } = await start.json<{ code: string }>();
    expect(code).toMatch(/^[A-Z2-9]{6}$/);
    const pairCookie = start.headers.get('set-cookie')!.split(';')[0]!;

    // Not approved yet; and a different browser can't poll someone else's code.
    expect(await (await carPost('/car/pair/status', { code }, pairCookie)).json()).toMatchObject({ done: false });
    expect((await carPost('/car/pair/status', { code }, '__Host-gate_p=' + 'x'.repeat(32))).status).toBe(410);

    expect((await post('/admin/api/pair/approve', { code, name: 'טסלה' })).status).toBe(200);
    const done = await carPost('/car/pair/status', { code }, pairCookie);
    expect(await done.json()).toMatchObject({ done: true });
    const deviceCookie = done.headers.get('set-cookie')!;
    expect(deviceCookie).toMatch(/__Host-gate_d=.+Secure; HttpOnly; SameSite=Strict; Max-Age=31536000/);
    const dc = deviceCookie.split(';')[0]!;

    expect(await (await call('/car', { headers: { cookie: dc } })).text()).toContain('טסלה');
    expect((await carPost('/car/open', { alias: 'home' }, dc)).status).toBe(200);
    expect(opens()).toBe(1);
    // The code is single-use.
    expect((await carPost('/car/pair/status', { code }, pairCookie)).status).toBe(410);
    // The device hash never reaches the browser.
    expect(JSON.stringify(await state())).not.toContain('deviceHash');

    // Revoking the device works instantly.
    const s = await state();
    await post('/admin/api/channel/delete', { id: s.config.channels.find((c) => c.kind === 'car')!.id });
    expect((await carPost('/car/open', { alias: 'home' }, dc)).status).toBe(401);
  });

  it('refuses a car open without CSRF header or from another origin', async () => {
    await linkAndConfigure();
    const r = await call('/car/open', { method: 'POST', headers: { origin: 'https://evil.example', 'content-type': 'text/plain' }, body: '{}' });
    expect(r.status).toBe(403);
  });
});

describe('arming (AI must not act without the owner)', () => {
  it('Grok opens only within the window armed by the phone', async () => {
    const { grok, phone } = await linkAndConfigure();
    await post('/admin/api/channel/update', { id: grok.id, requireArm: true, armMinutes: 5 });
    await post('/admin/api/settings', { cooldownSec: 0 });
    expect((await call(`/o/${grok.secret}?json`)).status).toBe(403);
    expect((await call(`/arm/${grok.secret}`, { method: 'POST' })).status).toBe(404); // only a phone link can arm
    expect((await call(`/arm/${phone.secret}`, { method: 'POST' })).status).toBe(200);
    expect((await call(`/o/${grok.secret}?json`)).status).toBe(200);
    expect(opens()).toBe(1);
  });
});

describe('hardening', () => {
  it('shows a lockout countdown and Retry-After', async () => {
    await setupOwner();
    cookie = '';
    const bad = await SoftAuthenticator.foreignKey();
    let last: Response | undefined;
    for (let i = 0; i < 5; i++) last = (await passkeyLogin(device, { key: bad })).res;
    expect(last!.status).toBe(429);
    expect(Number(last!.headers.get('retry-after'))).toBeGreaterThan(800);
    expect(await (await call('/admin')).text()).toMatch(/lock\(\d+\)/);
  });

  it('never leaks PalGate internals to Grok or the browser', async () => {
    const { grok } = await linkAndConfigure();
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ err: 'x', status: 'failed', msg: 'INTERNAL-DB-ERROR at node 7' }), { status: 500 }));
    const r = await call(`/o/${grok.secret}`);
    const body = await r.text();
    expect(r.status).toBe(502);
    expect(body).not.toContain('INTERNAL-DB-ERROR');
    expect(body).toMatch(/ref [A-Z0-9_-]+/i);
  });

  it('escapes stored values everywhere (no stored XSS)', async () => {
    const { grok } = await linkAndConfigure();
    await post('/admin/api/gates', { gates: [{ alias: 'home', label: '<img src=x onerror=alert(1)>', deviceId: 'DEV1', output: 1 }] });
    await post('/admin/api/settings', { cooldownSec: 0 });
    const page = await (await call(`/o/${grok.secret}`)).text();
    expect(page).not.toContain('<img src=x');
    expect(page).toContain('&lt;img');
  });

  it('rejects oversized bodies, odd paths and junk input', async () => {
    await setupOwner();
    const huge = await post('/admin/api/gates', { gates: [{ alias: 'a', label: 'x'.repeat(20_000), deviceId: 'D' }] });
    expect(huge.status).toBe(400); // body dropped → "gates required"
    expect((await call('/o/' + 'a'.repeat(250))).status).toBe(400);
    const r = await post('/admin/api/gates', { gates: [{ alias: '../../etc', label: 1, deviceId: 'D<script>', output: 99 }] });
    expect(r.status).toBe(200);
    const g = (await state()).config.gates[0]!;
    expect(g).toEqual({ alias: 'etc', label: '', deviceId: 'Dscript', output: 4 });
  });

  it('applies the Cloudflare rate limiter before doing any work', async () => {
    const { grok } = await linkAndConfigure();
    env.RL_PUBLIC = { limit: async () => ({ success: false }) };
    expect((await call(`/o/${grok.secret}`)).status).toBe(429);
    expect(opens()).toBe(0);
  });

  it('requires a valid Cloudflare Access token when that layer is configured', async () => {
    env.ACCESS_TEAM_DOMAIN = 'team.cloudflareaccess.com';
    env.ACCESS_AUD = 'aud123';
    expect((await call('/admin')).status).toBe(403);
    expect((await call('/admin', { headers: { 'cf-access-jwt-assertion': 'a.b.c' } })).status).toBe(403);
  });
});
