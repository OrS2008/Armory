import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

const SESSION_HEX = '00112233445566778899aabbccddeeff';
let kv: MemKV;
let env: Env;
let palCalls: string[];

const auth = { authorization: 'Basic ' + btoa('admin:pw') };
const call = (path: string, init: RequestInit = {}) =>
  worker.fetch(new Request('https://gate.test' + path, init), env);
const adminPost = (path: string, body: unknown) =>
  call('/admin/api/' + path, {
    method: 'POST',
    headers: { ...auth, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  kv = new MemKV();
  env = { GATE: kv as unknown as KVNamespace, ADMIN_PASSWORD: 'pw' };
  palCalls = [];
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    palCalls.push(url);
    const token = new Headers(init?.headers).get('x-bt-token');
    const ok = (extra: object) => new Response(JSON.stringify({ err: null, status: 'ok', ...extra }));
    if (url.includes('/un/secondary/init/'))
      return ok({ msg: 'success', user: { id: '972501234567', token: SESSION_HEX }, secondary: '1' });
    const valid = !!token && /^11[0-9A-F]{44}$/.test(token) && parseInt(token.slice(2, 14), 16) === 972501234567;
    if (!valid)
      return new Response(JSON.stringify({ err: 'bad token', status: 'failed', msg: 'bad token' }), { status: 401 });
    if (url.includes('/user/check-token')) return ok({ msg: 'token valid' });
    if (url.endsWith('/devices')) return ok({ msg: 'all my devices', devices: [{ id: 'DEV1', name1: 'שער ראשי' }] });
    if (url.includes('/open-gate')) return ok({ msg: 'Gate opened: true' });
    return new Response('{}', { status: 404 });
  });
});
afterEach(() => vi.unstubAllGlobals());

async function linkAndConfigure() {
  const start = await (await adminPost('link/start', {})).json<{ id: string; svg: string }>();
  expect(start.svg).toContain('<svg');
  const linked = await adminPost('link/wait', { id: start.id });
  expect(linked.status).toBe(200);
  const devs = await (await call('/admin/api/devices', { headers: auth })).json<{ devices: { id: string; name: string }[] }>();
  expect(devs.devices).toEqual([{ id: 'DEV1', name: 'שער ראשי', outputs: [1] }]);
  await adminPost('config', { gates: [{ alias: 'Home!', label: 'שער ראשי', deviceId: 'DEV1', output: 1 }] });
  return (await kv.get('config', 'json')) as Config;
}

describe('worker', () => {
  it('requires the admin password', async () => {
    expect((await call('/admin')).status).toBe(401);
    expect((await call('/admin', { headers: { authorization: 'Basic ' + btoa('a:wrong') } })).status).toBe(401);
    expect((await call('/admin', { headers: auth })).status).toBe(200);
  });

  it('links, configures and opens the gate from a Grok fetch', async () => {
    const cfg = await linkAndConfigure();
    expect(cfg.gates[0]!.alias).toBe('home');

    const res = await call(`/o/${cfg.secret}/home/839201`, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; Grok)' } });
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toContain('no-store');
    const text = await res.text();
    expect(text).toContain('SUCCESS');
    expect(palCalls.filter((u) => u.includes('/device/DEV1/open-gate?openBy=100&outputNum=1'))).toHaveLength(1);

    // An immediate repeat is acknowledged but not re-sent.
    const again = await call(`/o/${cfg.secret}`);
    expect(await again.text()).toContain('SUCCESS');
    expect(palCalls.filter((u) => u.includes('open-gate'))).toHaveLength(1);

    const log = (await kv.get('log', 'json')) as { via: string; ok: boolean }[];
    expect(log[0]).toMatchObject({ ok: true, via: 'grok' });
  });

  it('rejects wrong secrets, previews and HEAD without opening', async () => {
    const cfg = await linkAndConfigure();
    expect((await call('/o/nope/home')).status).toBe(404);
    expect((await call(`/o/${cfg.secret}`, { headers: { 'user-agent': 'WhatsApp/2.23' } })).status).toBe(403);
    expect((await call(`/o/${cfg.secret}`, { method: 'HEAD' })).status).toBe(200);
    expect((await call(`/car/${cfg.secret}`)).status).toBe(200);
    expect(palCalls.filter((u) => u.includes('open-gate'))).toHaveLength(0);
  });

  it('enforces the hourly cap and rotates the secret', async () => {
    const cfg = await linkAndConfigure();
    await adminPost('config', { cooldownSec: 0, maxPerHour: 2 });
    for (let i = 0; i < 2; i++) expect((await call(`/o/${cfg.secret}?json`)).status).toBe(200);
    const capped = await call(`/o/${cfg.secret}?json`);
    expect(capped.status).toBe(429);

    await adminPost('rotate', {});
    expect((await call(`/o/${cfg.secret}`)).status).toBe(404);
  });

  it('says so when not linked', async () => {
    const { secret } = (await (await call('/admin/api/state', { headers: auth })).json<{ config: Config }>()).config;
    const r = await call(`/o/${secret}?json`);
    expect(r.status).toBe(503);
  });
});
