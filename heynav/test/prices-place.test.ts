import { afterEach, describe, expect, it, vi } from 'vitest';
import { official, pricesAt, setPrice, validPrice } from '../src/prices';
import { openState, pickPoi } from '../src/place';
import worker from '../src/index';

const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext;
function memKV() {
  const m = new Map<string, string>();
  return {
    m,
    async get(k: string, t?: string) { const v = m.get(k); return v == null ? null : t === 'json' ? JSON.parse(v) : v; },
    async put(k: string, v: string) { m.set(k, v); },
    async delete(k: string) { m.delete(k); },
  } as unknown as KVNamespace & { m: Map<string, string> };
}
const DAY = 864e5;

describe('fuel prices from drivers', () => {
  it('stores by position and finds the same station from a slightly different point', async () => {
    const kv = memKV();
    const t0 = Date.parse('2026-11-20T10:00:00Z');
    await setPrice(kv, 34.8, 32.07, { s95: 7.79, dsl: 7.6 }, t0);
    await setPrice(kv, 34.80003, 32.07002, { f95: 8.05 }, t0 + 1000); // same station, other source's coordinates
    const [a, b] = (await pricesAt(kv, [[34.80008, 32.07004], [34.9, 32.1]], t0 + 2000))!;
    expect(a).toEqual({ s95: { v: 7.79, t: t0 }, dsl: { v: 7.6, t: t0 }, f95: { v: 8.05, t: t0 + 1000 } });
    expect(b).toBeNull();
  });
  it('a newer report wins; old prices disappear after three weeks', async () => {
    const kv = memKV();
    const t0 = Date.parse('2026-11-01T10:00:00Z');
    await setPrice(kv, 34.8, 32.07, { s95: 7.9, dsl: 7.7 }, t0);
    await setPrice(kv, 34.8, 32.07, { s95: 7.8 }, t0 + 10 * DAY);
    const [p] = (await pricesAt(kv, [[34.8, 32.07]], t0 + 22 * DAY))!;
    expect(p).toEqual({ s95: { v: 7.8, t: t0 + 10 * DAY } });
  });
  it('finds a station stored just across a cell edge', async () => {
    const kv = memKV();
    await setPrice(kv, 34.79999, 32.07, { s95: 7.7 }, 1000);
    expect((await pricesAt(kv, [[34.80002, 32.07]], 2000))![0]).not.toBeNull();
  });
  it('rejects silly prices', () => {
    expect(validPrice('s95', 7.85)).toBe(true);
    expect(validPrice('s95', 78.5)).toBe(false);
    expect(validPrice('dsl', '7')).toBe(false);
    expect(validPrice('gas', 7)).toBe(false);
  });
  it('the official 95 maximum shows only while current', () => {
    expect(official(Date.parse('2026-11-26T12:00:00Z'))).toEqual({ from: '2026-11-05', self95: 7.85, full95: 8.11 });
    expect(official(Date.parse('2027-01-20T12:00:00Z'))).toBeNull();
  });
  it('API: same-origin writes only, validated, then readable', async () => {
    const env = { REPORTS: memKV() };
    const post = (body: unknown, origin = 'https://x.test') => worker.fetch(new Request('https://x.test/api/price', { method: 'POST', headers: { 'x-hn': '1', origin, 'content-type': 'application/json' }, body: JSON.stringify(body) }), env as never, ctx);
    expect((await post({ lon: 34.8, lat: 32.07, s95: 7.8 }, 'https://evil.test')).status).toBe(403);
    expect((await post({ lon: 34.8, lat: 32.07, s95: 70 })).status).toBe(400);
    expect((await post({ lon: 34.8, lat: 32.07 })).status).toBe(400);
    expect((await post({ lon: 34.8, lat: 32.07, s95: 7.8, dsl: 7.55 })).status).toBe(200);
    const r = await worker.fetch(new Request('https://x.test/api/prices?pts=34.8,32.07;34.9,32.1', { headers: { 'x-hn': '1' } }), env as never, ctx);
    const d = (await r.json()) as { prices: ({ s95?: { v: number } } | null)[] };
    expect(d.prices[0]!.s95!.v).toBe(7.8);
    expect(d.prices[1]).toBeNull();
  });
});

describe('place card', () => {
  afterEach(() => vi.unstubAllGlobals());
  const res = (name: string, lon: number, lat: number, extra: object = {}) => ({ id: name, position: { lon, lat }, poi: { name }, ...extra });
  it('picks the result that is the tapped place', () => {
    const at: [number, number] = [34.774, 32.0786];
    const list = [res('Cafe Other', 34.77401, 32.07861), res('Shake Shack', 34.7742, 32.0787), res('Shake Shack', 34.79, 32.09)];
    expect(pickPoi(list, at, 'Shake Shack')!.position.lon).toBe(34.7742);
    expect(pickPoi(list, at, 'Nothing like it')).toBeNull();
    expect(pickPoi([res('far', 34.8, 32.1)], at, '')).toBeNull();
  });
  it('knows whether it is open now', () => {
    const ranges = [{ startTime: { date: '2026-11-26', hour: 12, minute: 0 }, endTime: { date: '2026-11-26', hour: 23, minute: 30 } }];
    expect(openState(ranges, { date: '2026-11-26', hm: 13 * 60 })).toEqual({ open: true, until: '23:30' });
    expect(openState(ranges, { date: '2026-11-26', hm: 9 * 60 })).toEqual({ open: false, opens: '12:00' });
    expect(openState(undefined, { date: '2026-11-26', hm: 0 })).toBeNull();
  });
  it('API: details via TomTom with the key kept server-side; photos only same-origin', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (u: string | URL) => {
      calls.push(String(u));
      if (String(u).includes('poiSearch')) return new Response(JSON.stringify({ results: [res('Shake Shack', 34.7742, 32.0787, { address: { freeformAddress: 'דיזנגוף 1, תל אביב' }, dataSources: { poiDetails: [{ id: 'abc' }] } })] }));
      if (String(u).includes('poiDetails')) return new Response(JSON.stringify({ result: { rating: { value: 4.3, totalRatings: 210 }, priceRange: { value: 2 }, photos: [{ id: 'photo-1234' }] } }));
      return new Response('x', { headers: { 'content-type': 'image/jpeg' } });
    }));
    const env = { TOMTOM_KEY: 'k' };
    const r = await worker.fetch(new Request('https://x.test/api/place?at=34.774,32.0786&name=Shake%20Shack', { headers: { 'x-hn': '1' } }), env as never, ctx);
    const d = (await r.json()) as { place: { rating: number; photos: string[]; address: string } };
    expect(d.place).toMatchObject({ rating: 4.3, photos: ['photo-1234'], address: 'דיזנגוף 1, תל אביב' });
    expect(JSON.stringify(d)).not.toContain('key=');
    const ph = (site: string) => worker.fetch(new Request('https://x.test/api/place/photo?id=photo-1234', { headers: { 'sec-fetch-site': site } }), env as never, ctx);
    expect((await ph('same-origin')).status).toBe(200);
    expect((await ph('cross-site')).status).toBe(403);
  });
});
