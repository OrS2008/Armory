import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { b64u, open } from '../src/crypto';
import worker, { type Config, type Env } from '../src/index';
import { tenant } from '../src/store';
import { SoftAuthenticator } from './soft-authenticator';

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
  async list({ prefix = '', cursor }: { prefix?: string; cursor?: string }) {
    const keys = [...this.m.keys()].filter((k) => k.startsWith(prefix)).sort();
    const start = cursor ? Number(cursor) : 0;
    const page = keys.slice(start, start + 2); // tiny pages to exercise pagination
    const done = start + 2 >= keys.length;
    return { keys: page.map((name) => ({ name })), list_complete: done, cursor: done ? undefined : String(start + 2) };
  }
}

const ORIGIN = 'https://gate.test';
const ctx = { waitUntil: (p: Promise<unknown>) => void p, passThroughOnException() {} } as unknown as ExecutionContext;
let kv: MemKV;
let env: Env;
let opened: { device: string; phone: number }[];
let linkCounter: number;
let ipCounter = 2;
const PHONES = [972501111111, 972502222222, 972503333333];

function call(path: string, init: RequestInit & { ip?: string; country?: string } = {}) {
  const headers = new Headers(init.headers);
  headers.set('cf-connecting-ip', init.ip ?? '10.0.0.1');
  headers.set('cf-ipcountry', init.country ?? 'IL');
  return worker.fetch(new Request(ORIGIN + path, { ...init, headers }), env, ctx);
}

/** A browser: its own cookie jar, IP and passkey device. */
class Browser {
  cookies = new Map<string, string>();
  device = new SoftAuthenticator({ origin: ORIGIN });
  ip = `10.1.${Math.floor(ipCounter / 250)}.${(ipCounter++ % 250) + 1}`;
  get cookie() {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
  }
  keep(r: Response) {
    const c = r.headers.get('set-cookie');
    if (c) {
      const [kvp] = c.split(';');
      const [k, v] = kvp!.split('=');
      if (v) this.cookies.set(k!, v);
      else this.cookies.delete(k!);
    }
    return r;
  }
  async post(path: string, body: unknown = {}, extra: Record<string, string> = {}) {
    return this.keep(
      await call(path, {
        method: 'POST',
        ip: this.ip,
        headers: { origin: ORIGIN, 'x-gate-csrf': '1', 'content-type': 'application/json', cookie: this.cookie, ...extra },
        body: JSON.stringify(body),
      }),
    );
  }
  get(path: string) {
    return call(path, { ip: this.ip, headers: { cookie: this.cookie } });
  }
  async api<T = Record<string, unknown>>(p: string, body: unknown = {}) {
    return (await this.post('/app/api/' + p, body)).json<T>();
  }
  username = `user${ipCounter}x`;
  password = 'correct horse battery staple';
  async signup(withPasskey = false) {
    const r = await this.post('/app/signup', { username: this.username, password: this.password });
    expect(r.status).toBe(200);
    const code = (await r.json<{ recoveryCode: string }>()).recoveryCode;
    if (withPasskey) await this.addPasskey();
    return code;
  }
  async addPasskey(device = this.device) {
    const o = await this.api<{ token: string; options: never }>('passkey/options');
    return this.post('/app/api/passkey/verify', { token: o.token, response: await device.create(o.options), name: 'iPhone' });
  }
  loginPassword(username = this.username, password = this.password) {
    return this.post('/app/login/password', { username, password });
  }
  async login(path = '/app') {
    const o = await (await this.post(`${path}/login/options`)).json<{ token: string; options: { challenge: string; rpId: string } }>();
    return this.post(`${path}/login/verify`, { token: o.token, response: await this.device.get(o.options) });
  }
  async state() {
    return this.api<{ config: Config; log: { kind: string; detail?: string; gate?: string }[]; linked: unknown }>('state');
  }
  async linkAndSetGate(gateLabel: string) {
    const { id } = await this.api<{ id: string }>('link/start');
    expect((await this.post('/app/api/link/wait', { id })).status).toBe(200);
    const { devices } = await this.api<{ devices: { id: string }[] }>('devices');
    await this.api('gates', { gates: [{ alias: 'home', label: gateLabel, deviceId: devices[0]!.id, output: 1 }] });
    await this.api('settings', { cooldownSec: 0 });
    return (await this.state()).config;
  }
}

beforeEach(() => {
  kv = new MemKV();
  env = { GATE: kv as unknown as KVNamespace, ENC_KEY: b64u(crypto.getRandomValues(new Uint8Array(32))), SETUP_CODE: 'setup-code-123' };
  opened = [];
  linkCounter = 0;
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.startsWith('https://ntfy.sh/')) return new Response('ok');
    const ok = (extra: object) => new Response(JSON.stringify({ err: null, status: 'ok', ...extra }));
    if (url.includes('/un/secondary/init/')) {
      const phone = PHONES[linkCounter++ % PHONES.length]!;
      return ok({ user: { id: String(phone), token: '00112233445566778899aabbccddee' + String(linkCounter).padStart(2, '0') }, secondary: '1' });
    }
    const token = new Headers(init?.headers).get('x-bt-token') ?? '';
    const phone = parseInt(token.slice(2, 14), 16);
    if (!/^11[0-9A-F]{44}$/.test(token) || !PHONES.includes(phone)) return new Response('{"err":"bad","status":"failed"}', { status: 401 });
    if (url.includes('/user/check-token')) return ok({});
    if (url.endsWith('/devices')) return ok({ devices: [{ id: `DEV-${phone}`, name1: `gate of ${phone}` }] });
    const mm = url.match(/device\/([^/]+)\/open-gate/);
    if (mm) {
      opened.push({ device: mm[1]!, phone });
      return ok({ msg: 'Gate opened: true' });
    }
    return new Response('{}', { status: 404 });
  });
});
afterEach(() => vi.unstubAllGlobals());

async function setupAdmin() {
  const admin = new Browser();
  const o = await (await admin.post('/sa/setup/options', { setupCode: 'setup-code-123' })).json<{ token: string; options: never }>();
  expect((await admin.post('/sa/setup/verify', { token: o.token, response: await admin.device.create(o.options) })).status).toBe(200);
  return admin;
}

// =====================================================================
describe('isolation between customers', () => {
  it('each customer sees only their own gates, links and log', async () => {
    const a = new Browser();
    const b = new Browser();
    await a.signup();
    await b.signup();
    const ca = await a.linkAndSetGate('A-gate');
    const cb = await b.linkAndSetGate('B-gate');
    expect(ca.gates[0]!.deviceId).not.toBe(cb.gates[0]!.deviceId);
    const sa = JSON.stringify(await a.state());
    const sb = JSON.stringify(await b.state());
    expect(sa).toContain('A-gate');
    expect(sa).not.toContain('B-gate');
    expect(sb).not.toContain('A-gate');
    for (const ch of cb.channels) if (ch.secret) expect(sa).not.toContain(ch.secret);
  });

  it("a customer's link opens only that customer's gate, with that customer's PalGate account", async () => {
    const a = new Browser();
    const b = new Browser();
    await a.signup();
    await b.signup();
    const ca = await a.linkAndSetGate('A');
    const cb = await b.linkAndSetGate('B');
    const grokA = ca.channels.find((c) => c.kind === 'grok')!;
    const grokB = cb.channels.find((c) => c.kind === 'grok')!;
    expect((await call(`/o/${grokA.secret}`)).status).toBe(200);
    expect((await call(`/o/${grokB.secret}`)).status).toBe(200);
    expect(opened).toEqual([
      { device: ca.gates[0]!.deviceId, phone: PHONES[0] },
      { device: cb.gates[0]!.deviceId, phone: PHONES[1] },
    ]);
    expect((await a.state()).log.filter((l) => l.kind === 'open')).toHaveLength(1);
    expect((await b.state()).log.filter((l) => l.kind === 'open')).toHaveLength(1);
  });

  it("a customer cannot change, rotate or delete another customer's links by id", async () => {
    const a = new Browser();
    const b = new Browser();
    await a.signup();
    await b.signup();
    const target = (await b.state()).config.channels[0]!;
    for (const [path, body] of [
      ['channel/update', { id: target.id, enabled: false, name: 'pwned' }],
      ['channel/rotate', { id: target.id }],
      ['channel/delete', { id: target.id }],
      ['passkey/delete', { id: 'x' }],
    ] as const) {
      expect((await a.post('/app/api/' + path, body)).status).toBe(404);
    }
    expect((await b.state()).config.channels[0]).toEqual(target);
  });

  it('a device paired by customer A belongs to A only', async () => {
    const a = new Browser();
    const b = new Browser();
    await a.signup();
    await b.signup();
    const ca = await a.linkAndSetGate('A');
    await b.linkAndSetGate('B');
    const car = new Browser();
    const { code } = await (await car.post('/car/pair/start')).json<{ code: string }>();
    expect((await a.post('/app/api/pair/approve', { code, name: 'Tesla A' })).status).toBe(200);
    expect((await b.post('/app/api/pair/approve', { code, name: 'steal' })).status).toBe(404);
    await car.post('/car/pair/status', { code });
    expect((await car.post('/car/open', { alias: 'home' })).status).toBe(200);
    expect(opened.at(-1)).toEqual({ device: ca.gates[0]!.deviceId, phone: PHONES[0] });
    expect(JSON.stringify(await b.state())).not.toContain('Tesla A');
  });

  it("each customer's data is sealed with its own key", async () => {
    const a = new Browser();
    const b = new Browser();
    await a.signup();
    await b.signup();
    await a.linkAndSetGate('A-secret-label');
    const ids = [...new Set([...kv.m.keys()].filter((k) => k.startsWith('t:')).map((k) => k.split(':')[1]!))];
    expect(ids).toHaveLength(2);
    const [t1, t2] = await Promise.all(ids.map((id) => tenant(env, id)));
    const slot = `t:${t1!.id}:config`;
    const blob = JSON.parse(kv.m.get(slot)!);
    await expect(open(t1!.key, slot, blob)).resolves.toBeTruthy();
    await expect(open(t2!.key, slot, blob)).rejects.toThrow(); // the other customer's key
    await expect(open(env.ENC_KEY!, slot, blob)).rejects.toThrow(); // the master key itself
    const dump = [...kv.m.entries()].join('\n');
    for (const s of ['A-secret-label', String(PHONES[0]), 'DEV-', 'iPhone']) expect(dump).not.toContain(s);
  });

  it('deleting a customer removes every trace and leaves others intact', async () => {
    const a = new Browser();
    const b = new Browser();
    await a.signup();
    await b.signup();
    const ca = await a.linkAndSetGate('A');
    const cb = await b.linkAndSetGate('B');
    const before = [...kv.m.keys()];
    expect((await a.post('/app/api/account/delete', { confirm: 'DELETE' })).status).toBe(200);
    const after = [...kv.m.keys()];
    const tidA = before.filter((k) => k.startsWith('tn:') && !after.includes(k))[0]!.slice(3);
    expect(after.some((k) => k.includes(tidA))).toBe(false);
    expect(after.filter((k) => k.startsWith('ix:')).length).toBeLessThan(before.filter((k) => k.startsWith('ix:')).length);
    expect((await call(`/o/${ca.channels[0]!.secret}`)).status).toBe(404);
    expect((await a.loginPassword()).status).toBe(401);
    expect((await call(`/o/${cb.channels[0]!.secret}`)).status).toBe(200);
  });

  it('a customer session cannot reach the admin panel, and vice versa', async () => {
    const a = new Browser();
    await a.signup(true);
    expect((await a.post('/sa/api/state')).status).toBe(401);
    const admin = await setupAdmin();
    expect((await admin.post('/app/api/state')).status).toBe(401);
    expect((await a.login('/sa')).status).toBe(401);
    expect((await admin.login('/app')).status).toBe(401);
  });
});

// =====================================================================
describe('super admin', () => {
  it('is created once with the setup code', async () => {
    expect((await new Browser().post('/sa/setup/options', { setupCode: 'nope' })).status).toBe(401);
    await setupAdmin();
    expect((await new Browser().post('/sa/setup/options', { setupCode: 'setup-code-123' })).status).toBe(409);
  });

  it('sees registry metadata only, never customer data', async () => {
    const a = new Browser();
    await a.signup();
    const cfg = await a.linkAndSetGate('Private Gate Name');
    const admin = await setupAdmin();
    const st = await (await admin.post('/sa/api/state')).json<{ tenants: unknown[] }>();
    expect(st.tenants).toHaveLength(1);
    const raw = JSON.stringify(st);
    for (const s of ['Private Gate Name', String(PHONES[0]), cfg.channels[0]!.secret, 'DEV-', 'passkeys']) expect(raw).not.toContain(s);
  });

  it('blocking a customer stops their sessions, links and logins until unblocked', async () => {
    const a = new Browser();
    await a.signup(true);
    const cfg = await a.linkAndSetGate('A');
    const admin = await setupAdmin();
    const { tenants } = await (await admin.post('/sa/api/state')).json<{ tenants: { id: string }[] }>();
    await admin.post('/sa/api/tenant/status', { id: tenants[0]!.id, status: 'blocked' });
    expect((await a.post('/app/api/state')).status).toBe(401);
    expect((await call(`/o/${cfg.channels[0]!.secret}`)).status).toBe(404);
    expect((await a.login()).status).toBe(401);
    expect((await a.loginPassword()).status).toBe(401);
    await admin.post('/sa/api/tenant/status', { id: tenants[0]!.id, status: 'active' });
    expect((await a.login()).status).toBe(200);
    expect((await a.loginPassword()).status).toBe(200);
  });

  it('can close sign-ups and enforces the daily cap', async () => {
    const admin = await setupAdmin();
    await admin.post('/sa/api/platform', { signupsOpen: false });
    expect((await new Browser().post('/app/signup', { username: 'closed1', password: 'correct horse battery' })).status).toBe(403);
    expect(await (await call('/app', { headers: { cookie: 'hg_lang=he' } })).text()).toContain('ההרשמה לחשבונות חדשים סגורה');
    await admin.post('/sa/api/platform', { signupsOpen: true, maxSignupsPerDay: 1 });
    await new Browser().signup();
    expect((await new Browser().post('/app/signup', { username: 'capped1', password: 'correct horse battery' })).status).toBe(429);
  });

  it('deletes a customer only with the id typed as confirmation', async () => {
    await new Browser().signup();
    const admin = await setupAdmin();
    const { tenants } = await (await admin.post('/sa/api/state')).json<{ tenants: { id: string }[] }>();
    expect((await admin.post('/sa/api/tenant/delete', { id: tenants[0]!.id, confirm: 'x' })).status).toBe(404);
    expect((await admin.post('/sa/api/tenant/delete', { id: tenants[0]!.id, confirm: tenants[0]!.id })).status).toBe(200);
    expect([...kv.m.keys()].some((k) => k.startsWith('t:') || k.startsWith('tn:'))).toBe(false);
  });
});

// =====================================================================
describe('customer accounts', () => {
  it('sign-up validates the username and password, and usernames are unique', async () => {
    const b = new Browser();
    expect((await b.post('/app/signup', { username: 'a b', password: 'correct horse battery' })).status).toBe(400);
    expect((await b.post('/app/signup', { username: 'okname', password: 'short' })).status).toBe(400);
    expect((await b.post('/app/signup', { username: 'samename1', password: 'samename1' })).status).toBe(400);
    expect((await b.post('/app/signup', { username: 'Dupe.User', password: 'correct horse battery' })).status).toBe(200);
    const r = await new Browser().post('/app/signup', { username: 'dupe.user', password: 'another long password' });
    expect(r.status).toBe(409);
  });

  it('signs in with username + password; wrong and unknown users get the same answer', async () => {
    const a = new Browser();
    await a.signup();
    a.cookies.clear();
    const bad = await a.loginPassword(a.username, 'wrong password!!');
    const unknown = await a.loginPassword('nobody-here', 'wrong password!!');
    expect(bad.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect((await bad.json<{ message: string }>()).message).toBe((await unknown.json<{ message: string }>()).message);
    expect((await a.loginPassword(a.username.toUpperCase())).status).toBe(200);
    expect((await a.post('/app/api/state')).status).toBe(200);
  });

  it('locks one account after 10 wrong passwords even from many IPs', async () => {
    const a = new Browser();
    await a.signup();
    for (let i = 0; i < 10; i++) {
      const attacker = new Browser();
      await attacker.loginPassword(a.username, `guess number ${i}`);
    }
    const r = await new Browser().loginPassword(a.username, a.password);
    expect(r.status).toBe(429);
    // the owner gets back in with the recovery code
  });

  it('password change needs the current password and signs out other sessions', async () => {
    const a = new Browser();
    await a.signup();
    const other = new Browser();
    other.username = a.username;
    await other.loginPassword();
    expect((await a.post('/app/api/password', { current: 'nope nope nope', next: 'a brand new password' })).status).toBe(401);
    expect((await a.post('/app/api/password', { current: a.password, next: 'short' })).status).toBe(400);
    expect((await a.post('/app/api/password', { current: a.password, next: 'a brand new password' })).status).toBe(200);
    expect((await a.post('/app/api/state')).status).toBe(200);
    expect((await other.post('/app/api/state')).status).toBe(401);
    expect((await new Browser().loginPassword(a.username, 'a brand new password')).status).toBe(200);
  });

  it('signs in with a passkey; refuses replay, phishing origin, foreign key and strangers', async () => {
    const a = new Browser();
    await a.signup(true);
    a.cookies.clear();
    expect((await a.login()).status).toBe(200);
    const o = await (await a.post('/app/login/options')).json<{ token: string; options: { challenge: string; rpId: string } }>();
    const resp = await a.device.get(o.options);
    expect((await a.post('/app/login/verify', { token: o.token, response: resp })).status).toBe(200);
    expect((await a.post('/app/login/verify', { token: o.token, response: resp })).status).toBe(401);
    const o2 = await (await a.post('/app/login/options')).json<{ token: string; options: { challenge: string; rpId: string } }>();
    expect((await a.post('/app/login/verify', { token: o2.token, response: await a.device.get(o2.options, 'https://gate.test.evil.example') })).status).toBe(401);
    const o3 = await (await a.post('/app/login/options')).json<{ token: string; options: { challenge: string; rpId: string } }>();
    expect((await a.post('/app/login/verify', { token: o3.token, response: await a.device.get(o3.options, undefined, await SoftAuthenticator.foreignKey()) })).status).toBe(401);
    const stranger = new Browser();
    await stranger.device.create({ challenge: 'x', rp: { id: 'gate.test' }, user: { id: 'AAAA' } });
    expect((await stranger.login()).status).toBe(401);
  });

  it('refuses a passkey from an authenticator that skipped Face ID / PIN', async () => {
    const a = new Browser();
    await a.signup();
    expect((await a.addPasskey(new SoftAuthenticator({ origin: ORIGIN, userVerified: false }))).status).toBe(400);
  });

  it('recovery code works once, rotates, and signs out other sessions', async () => {
    const a = new Browser();
    const code = await a.signup();
    const lost = new Browser();
    const r = await lost.post('/app/recover', { code: code.toLowerCase().replace(/-/g, ' ') });
    expect(r.status).toBe(200);
    const next = (await r.json<{ recoveryCode: string }>()).recoveryCode;
    expect(next).not.toBe(code);
    expect((await lost.post('/app/api/state')).status).toBe(200);
    expect((await a.post('/app/api/state')).status).toBe(401);
    expect((await new Browser().post('/app/recover', { code })).status).toBe(401);
  });

  it('passkeys can be added and removed; the password keeps the account reachable', async () => {
    const a = new Browser();
    await a.signup(true);
    expect((await a.addPasskey(new SoftAuthenticator({ origin: ORIGIN }))).status).toBe(200);
    const st = await a.api<{ passkeys: { id: string }[]; account: { hasPassword: boolean } }>('state');
    expect(st.passkeys).toHaveLength(2);
    expect(st.account.hasPassword).toBe(true);
    for (const p of st.passkeys) expect((await a.post('/app/api/passkey/delete', { id: p.id })).status).toBe(200);
    expect((await new Browser().loginPassword(a.username, a.password)).status).toBe(200);
  });

  it('locks an IP out after 5 failures with a countdown', async () => {
    const a = new Browser();
    await a.signup();
    a.cookies.clear();
    let last!: Response;
    for (let i = 0; i < 5; i++) last = await a.loginPassword(a.username, `wrong ${i} attempt`);
    expect(last.status).toBe(429);
    expect(Number(last.headers.get('retry-after'))).toBeGreaterThan(800);
    expect(await (await a.get('/app')).text()).toMatch(/lock\(\d+\)/);
  });

  it('refuses cross-site requests', async () => {
    const a = new Browser();
    await a.signup();
    expect((await a.post('/app/api/test', {}, { origin: 'https://evil.example' })).status).toBe(403);
    expect((await call('/app/api/test', { method: 'POST', headers: { origin: ORIGIN, cookie: a.cookie }, body: '{}' })).status).toBe(403);
  });
});

// =====================================================================
describe('opening rules', () => {
  async function ready() {
    const a = new Browser();
    await a.signup();
    const cfg = await a.linkAndSetGate('G');
    return { a, grok: cfg.channels.find((c) => c.kind === 'grok')!, phone: cfg.channels.find((c) => c.kind === 'phone')! };
  }

  it('phone links are POST-only and country-restricted; previews and HEAD never open', async () => {
    const { grok, phone } = await ready();
    expect((await call(`/o/${phone.secret}`)).status).toBe(405);
    expect((await call(`/o/${phone.secret}?json`, { method: 'POST', country: 'FR' })).status).toBe(403);
    expect((await call(`/o/${phone.secret}?json`, { method: 'POST' })).status).toBe(200);
    expect((await call(`/o/${grok.secret}`, { headers: { 'user-agent': 'WhatsApp/2.23' } })).status).toBe(403);
    expect((await call(`/o/${grok.secret}`, { method: 'HEAD' })).status).toBe(204);
    expect(opened).toHaveLength(1);
  });

  it('Grok can be required to be armed by the phone first', async () => {
    const { a, grok, phone } = await ready();
    await a.api('channel/update', { id: grok.id, requireArm: true });
    expect((await call(`/o/${grok.secret}?json`)).status).toBe(403);
    expect((await call(`/arm/${grok.secret}`, { method: 'POST' })).status).toBe(404);
    expect((await call(`/arm/${phone.secret}`, { method: 'POST' })).status).toBe(200);
    expect((await call(`/o/${grok.secret}?json`)).status).toBe(200);
  });

  it('master switch, hourly cap and rotation', async () => {
    const { a, grok } = await ready();
    await a.api('settings', { enabled: false });
    expect((await call(`/o/${grok.secret}?json`)).status).toBe(423);
    await a.api('settings', { enabled: true });
    await a.api('channel/update', { id: grok.id, maxPerHour: 1 });
    expect((await call(`/o/${grok.secret}?json`)).status).toBe(200);
    expect((await call(`/o/${grok.secret}?json`)).status).toBe(429);
    await a.api('channel/rotate', { id: grok.id });
    expect((await call(`/o/${grok.secret}?json`)).status).toBe(404);
  });

  it('throttles secret guessing per IP', async () => {
    const { grok } = await ready();
    for (let i = 0; i < 20; i++) await call(`/o/${'x'.repeat(31)}${i % 10}`, { ip: '6.6.6.6' });
    expect((await call(`/o/${grok.secret}`, { ip: '6.6.6.6' })).status).toBe(429);
  });

  it('never leaks PalGate internals; escapes stored values', async () => {
    const { a, grok } = await ready();
    await a.api('gates', { gates: [{ alias: 'home', label: '<img src=x onerror=alert(1)>', deviceId: `DEV-${PHONES[0]}`, output: 1 }] });
    const page = await (await call(`/o/${grok.secret}`)).text();
    expect(page).toContain('&lt;img');
    expect(page).not.toContain('<img src=x');
    vi.stubGlobal('fetch', async () => new Response('{"err":"x","status":"failed","msg":"INTERNAL-DB-ERROR"}', { status: 500 }));
    await a.api('settings', { cooldownSec: 0 });
    const r = await call(`/o/${grok.secret}`);
    expect(r.status).toBe(502);
    expect(await r.text()).not.toContain('INTERNAL-DB-ERROR');
  });

  it('applies the Cloudflare rate limiter first', async () => {
    const { grok } = await ready();
    env.RL_PUBLIC = { limit: async () => ({ success: false }) };
    expect((await call(`/o/${grok.secret}`)).status).toBe(429);
    expect(opened).toHaveLength(0);
  });
});

// =====================================================================
describe('pages and languages', () => {
  const pages = ['/', '/privacy', '/app', '/sa', '/car'];

  it('every page carries the disclaimer, in the chosen language', async () => {
    for (const p of pages) {
      const he = await (await call(p, { headers: { cookie: 'hg_lang=he' } })).text();
      expect(he).toContain('HeyGate אינו קשור ל-PalGate, ל-xAI או ל-Tesla');
      expect(he).toContain('dir="rtl"');
      const en = await (await call(p, { headers: { cookie: 'hg_lang=en' } })).text();
      expect(en).toContain('HeyGate is not affiliated with PalGate, xAI or Tesla');
      expect(en).toContain('dir="ltr"');
    }
    const a = new Browser();
    await a.signup();
    expect(await (await a.get('/app')).text()).toContain('HeyGate is not affiliated');
  });

  it('falls back to the browser language, and shows the day/night and language switches', async () => {
    const en = await (await call('/', { headers: { 'accept-language': 'en-US,en;q=0.9' } })).text();
    expect(en).toContain('lang="en"');
    const he = await (await call('/', { headers: { 'accept-language': 'he-IL,he;q=0.9' } })).text();
    expect(he).toContain('lang="he"');
    for (const h of [en, he]) {
      expect(h).toContain('data-theme-opt="dark"');
      expect(h).toContain('data-lang="en"');
      expect(h).toContain('data-lang="he"');
    }
  });

  it('server messages arrive translated', async () => {
    const he = await call('/app/signup', { method: 'POST', headers: { origin: ORIGIN, 'x-gate-csrf': '1', cookie: 'hg_lang=he' }, body: JSON.stringify({ username: 'x', password: 'y' }) });
    expect((await he.json<{ message: string }>()).message).toMatch(/שם משתמש/);
    const en = await call('/app/signup', { method: 'POST', ip: '10.9.9.9', headers: { origin: ORIGIN, 'x-gate-csrf': '1', cookie: 'hg_lang=en' }, body: JSON.stringify({ username: 'x', password: 'y' }) });
    expect((await en.json<{ message: string }>()).message).toMatch(/^Username/);
  });

  it('every L.key used by page scripts exists in both languages', async () => {
    const { UI } = await import('../src/ui-strings');
    const src = (await import('node:fs')).readFileSync('src/pages.ts', 'utf8');
    const used = new Set([...src.matchAll(/\bL\.([a-z0-9_]+)/g)].map((m) => m[1]!));
    expect(used.size).toBeGreaterThan(100);
    for (const k of used) {
      expect(UI.he, `he.${k}`).toHaveProperty(k);
      expect(UI.en, `en.${k}`).toHaveProperty(k);
    }
  });

  it('new accounts get channel names in their language', async () => {
    const a = new Browser();
    a.cookies.set('hg_lang', 'en');
    await a.signup();
    const names = (await a.state()).config.channels.map((c) => c.name);
    expect(names).toContain('Phone automation');
  });
});

describe('pages', () => {
  it('serve the landing page, privacy page and security headers, with an early theme script', async () => {
    const home = await call('/');
    const h = await home.text();
    expect(h).toContain('HeyGate');
    expect(h).toContain('data-theme-opt="dark"');
    expect(h).toMatch(/<head>[\s\S]*localStorage\.getItem\('theme'\)[\s\S]*<\/head>/);
    expect(home.headers.get('content-security-policy')).toMatch(/script-src 'nonce-[^']+'/);
    expect(home.headers.get('x-frame-options')).toBe('DENY');
    expect((await call('/privacy')).status).toBe(200);
    expect((await call('/admin')).status).toBe(301);
  });

  it('refuses to run without its secrets configured', async () => {
    env.ENC_KEY = undefined;
    expect((await call('/app')).status).toBe(503);
  });
});
