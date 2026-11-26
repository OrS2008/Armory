import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import { core } from '../src/core';
import { areasOnRoute, buildValhallaRoute, decode6, firstInArea, inRing, valhallaRoutes } from '../src/valhalla';
import { addReport, cellOf, listReports, vote } from '../src/reports';
import worker from '../src/index';

const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext;
const hebron = JSON.parse(fs.readFileSync('test/fixtures/valhalla-hebron.json', 'utf8'));

describe('Valhalla routes', () => {
  it('decodes the shape and builds steps the guidance engine can drive', () => {
    const r = buildValhallaRoute(hebron.trip, 'he');
    expect(r.geometry.length).toBeGreaterThan(50);
    expect(Math.abs(r.distance / 1000 - hebron.trip.summary.length)).toBeLessThan(0.3);
    expect(r.steps.at(-1)!.type).toBe('arrive');
    for (let i = 1; i < r.steps.length; i++) expect(r.steps[i]!.start).toBeGreaterThanOrEqual(r.steps[i - 1]!.start);
    expect(r.steps.every((s) => s.text.length > 0 && !s.text.endsWith('.'))).toBe(true);
    // the same tracker drives it to the end
    const trk = core.tracker(r, 'he');
    const cum = core.cumulative(r.geometry);
    let arrived = false;
    for (let a = 0; a < trk.total + 30 && !arrived; a += 15) arrived = trk.update({ pos: core.pointAt(r.geometry, cum, a).point, accuracy: 5, speed: 15, heading: null, time: a }).arrived;
    expect(arrived).toBe(true);
  });
  it('knows this direct route crosses Hebron (Area A)', () => {
    const r = buildValhallaRoute(hebron.trip, 'he');
    expect(areasOnRoute(r.geometry, [[35.12, 31.535], [35.03, 31.43]])).toContain('Hebron');
    expect(firstInArea(r.geometry)).not.toBeNull();
  });
  it('point-in-polygon and polyline decoding', () => {
    expect(inRing([0.5, 0.5], [[0, 0], [1, 0], [1, 1], [0, 1]])).toBe(true);
    expect(inRing([1.5, 0.5], [[0, 0], [1, 0], [1, 1], [0, 1]])).toBe(false);
    expect(decode6('_c`|@_c`|@_c`|@_c`|@')).toEqual([[1, 1], [2, 2]]);
  });
  it('avoiding areas: blocks the road where the route enters, routes again, offers only clean routes', async () => {
    const clean = { ...hebron.trip, legs: [{ ...hebron.trip.legs[0], shape: 'o}zbaAiu}ebAoAsA' }] }; // a short line well outside any area
    const bodies: { exclude_locations: unknown[]; costing_options: { auto: { use_tolls: number } } }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init: RequestInit) => {
      const b = JSON.parse(String(init.body));
      bodies.push(b);
      return new Response(JSON.stringify({ trip: b.exclude_locations.length ? clean : hebron.trip }));
    }));
    const rs = await valhallaRoutes([35.12, 31.535], [35.03, 31.43], 'he', { tolls: true, areas: true }, 'ua', null, 'https://valhalla.test/route');
    expect(bodies.length).toBe(2);
    expect(bodies[1]!.exclude_locations.length).toBe(1);
    expect(bodies[0]!.costing_options.auto.use_tolls).toBe(0);
    expect(rs!.every((r) => r.areas.length === 0)).toBe(true);
    vi.unstubAllGlobals();
  });
});

/** Minimal in-memory KV. */
function memKV() {
  const m = new Map<string, string>();
  return {
    m,
    async get(k: string, t?: string) { const v = m.get(k); return v == null ? null : t === 'json' ? JSON.parse(v) : v; },
    async put(k: string, v: string) { m.set(k, v); },
    async delete(k: string) { m.delete(k); },
  } as unknown as KVNamespace & { m: Map<string, string> };
}

describe('driver reports', () => {
  it('adds, merges a repeat report nearby, lists by area, and expires', async () => {
    const kv = memKV();
    const t0 = 1_800_000_000_000;
    const a = await addReport(kv, 'police', 34.78, 32.08, 90, t0);
    const b = await addReport(kv, 'police', 34.7805, 32.0801, 90, t0 + 1000); // ~50 m away: same thing
    expect(b.id).toBe(a.id);
    expect(b.up).toBe(2);
    await addReport(kv, 'accident', 34.79, 32.09, null, t0);
    expect((await listReports(kv, 34.7, 32.0, 34.8, 32.1, t0))!.length).toBe(2);
    expect((await listReports(kv, 34.7, 32.0, 34.8, 32.1, t0 + 3 * 3600e3))!.length).toBe(0); // both gone after 3 h
    expect(cellOf(34.78, 32.08)).toBe('rc:320:347');
    expect(await listReports(kv, 30, 29, 36, 34, t0)).toBeNull(); // too large an area
  });
  it('two "gone" votes remove a report; "still there" keeps it', async () => {
    const kv = memKV();
    const t0 = 1_800_000_000_000;
    const r = await addReport(kv, 'hazard', 34.78, 32.08, null, t0);
    await vote(kv, r.id, r.lon, r.lat, false, t0);
    expect((await listReports(kv, 34.7, 32.0, 34.8, 32.1, t0))!.length).toBe(1);
    const gone = await vote(kv, r.id, r.lon, r.lat, false, t0);
    expect((gone as { removed?: boolean }).removed).toBe(true);
    expect((await listReports(kv, 34.7, 32.0, 34.8, 32.1, t0))!.length).toBe(0);
  });
  it('server: same-origin writes only, validated, and readable by others', async () => {
    const env = { REPORTS: memKV() };
    const post = (path: string, body: unknown, origin = 'https://heynav.test') =>
      worker.fetch(new Request(`https://heynav.test${path}`, { method: 'POST', headers: { 'x-hn': '1', origin, 'content-type': 'application/json' }, body: JSON.stringify(body) }), env as never, ctx);
    expect((await post('/api/report', { kind: 'police', lon: 34.78, lat: 32.08 }, 'https://evil.test')).status).toBe(403);
    expect((await post('/api/report', { kind: 'aliens', lon: 34.78, lat: 32.08 })).status).toBe(400);
    expect((await post('/api/report', { kind: 'police', lon: 999, lat: 32.08 })).status).toBe(400);
    const ok = await (await post('/api/report', { kind: 'police', lon: 34.78, lat: 32.08, h: 450 })).json() as { report: { id: string; h: number } };
    expect(ok.report.h).toBe(90);
    const list = await (await worker.fetch(new Request('https://heynav.test/api/reports?bbox=34.7,32.0,34.8,32.1', { headers: { 'x-hn': '1' } }), env as never, ctx)).json() as { reports: unknown[] };
    expect(list.reports).toHaveLength(1);
    expect((await post('/api/report/vote', { id: 'nope', lon: 34.78, lat: 32.08 })).status).toBe(400);
    expect((await worker.fetch(new Request('https://heynav.test/api/search?q=x', { method: 'POST', headers: { 'x-hn': '1' } }), env as never, ctx)).status).toBe(405);
  });
});

afterEach(() => vi.unstubAllGlobals());
