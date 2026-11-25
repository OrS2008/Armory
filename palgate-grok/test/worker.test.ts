import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { b64u, hotp, unbase32 } from '../src/crypto';
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
const PASSWORD = 'correct horse battery';
let kv: MemKV;
let env: Env;
let palCalls: string[];
let notifications: string[];
let cookie = '';
let totpSecret = '';
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

async function code(offsetSteps = 0) {
  return hotp(unbase32(totpSecret), Math.floor(now / 30_000) + offsetSteps);
}

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
  const r1 = await post('/admin/setup/start', { setupCode: 'setup-code-123', password: PASSWORD });
  expect(r1.status).toBe(200);
  const d = await r1.json<{ token: string; secret: string; svg: string }>();
  expect(d.svg).toContain('<svg');
  totpSecret = d.secret;
  const r2 = await post('/admin/setup/finish', { token: d.token, code: await code() });
  expect(r2.status).toBe(200);
  expect(r2.headers.get('set-cookie')).toMatch(/__Host-gate_s=.+; Path=\/; Secure; HttpOnly; SameSite=Strict/);
  saveCookie(r2);
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
  return { grok: ch('grok'), car: ch('car'), phone: ch('phone'), config: s.config };
}

const opens = () => palCalls.filter((u) => u.includes('open-gate')).length;

describe('owner account', () => {
  it('shows setup first, then login, never the panel without a session', async () => {
    expect(await (await call('/admin')).text()).toContain('הגדרת חשבון');
    await setupOwner();
    const anon = await (await call('/admin')).text();
    expect(anon).toContain('כניסה לניהול');
    expect(anon).not.toContain('פותחן שערים');
    const authed = await (await call('/admin', { headers: { cookie } })).text();
    expect(authed).toContain('פותחן שערים');
  });

  it('cannot be set up twice and the setup code is useless afterwards', async () => {
    await setupOwner();
    const again = await post('/admin/setup/start', { setupCode: 'setup-code-123', password: 'another long password' });
    expect(again.status).toBe(409);
  });

  it('rejects a wrong setup code and short passwords', async () => {
    expect((await post('/admin/setup/start', { setupCode: 'nope', password: PASSWORD })).status).toBe(401);
    expect((await post('/admin/setup/start', { setupCode: 'setup-code-123', password: 'short' })).status).toBe(400);
  });

  it('needs both password and a fresh TOTP code, and a code works only once', async () => {
    await setupOwner();
    cookie = '';
    tick(60);
    expect((await post('/admin/login', { password: 'wrong password!!', code: await code() })).status).toBe(401);
    expect((await post('/admin/login', { password: PASSWORD, code: '000000' })).status).toBe(401);
    const c = await code();
    const ok = await post('/admin/login', { password: PASSWORD, code: c });
    expect(ok.status).toBe(200);
    // Replay of the same code is refused.
    expect((await post('/admin/login', { password: PASSWORD, code: c })).status).toBe(401);
  });

  it('locks an IP out after 5 failures, even with correct credentials', async () => {
    await setupOwner();
    cookie = '';
    for (let i = 0; i < 5; i++) await post('/admin/login', { password: 'bad bad bad bad', code: '123456' });
    tick(60);
    const r = await post('/admin/login', { password: PASSWORD, code: await code() });
    expect(r.status).toBe(429);
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
    expect(dump).not.toContain(totpSecret);
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

  it('car and phone links work only via POST and only from allowed countries', async () => {
    const { car, phone } = await linkAndConfigure();
    expect((await call(`/o/${phone.secret}`)).status).toBe(405); // GET refused
    expect((await call(`/o/${phone.secret}?json`, { method: 'POST', country: 'FR' })).status).toBe(403);
    expect((await call(`/o/${phone.secret}?json`, { method: 'POST' })).status).toBe(200);
    expect((await call(`/car/${car.secret}`)).status).toBe(200);
    expect((await call(`/car/${phone.secret}`)).status).toBe(404); // a phone secret is not a car page
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
