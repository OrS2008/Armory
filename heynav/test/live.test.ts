import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import { core } from '../src/core';
import { buildRoute, type OsrmRoute } from '../src/guidance';
import { parseCameras } from '../src/cameras';
import { nearFirst, rank, type RouteOut } from '../src/api';
import { thin } from '../src/traffic';
import worker from '../src/index';

const kml = fs.readFileSync('test/fixtures/cameras.kml', 'utf8');
const fixture = (name: string) => JSON.parse(fs.readFileSync(`test/fixtures/${name}.json`, 'utf8')) as { routes: OsrmRoute[] };
const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext;

describe('camera map', () => {
  const cams = parseCameras(kml);
  it('reads every camera from the shared map, with type, limit and direction', () => {
    expect(cams.length).toBe(189);
    const first = cams.find((c) => c.id === 1)!;
    expect(first).toMatchObject({ lon: 35.31818, lat: 31.80135, h: [251], limit: 90, kind: 'speed', active: true, alert: true });
    const kinds = new Set(cams.map((c) => c.kind));
    for (const k of ['speed', 'redlight', 'average', 'rail', 'bus', 'security', 'dummy']) expect(kinds.has(k as never), k).toBe(true);
  });
  it('only alerts for real enforcement cameras that are in use', () => {
    expect(cams.filter((c) => c.kind === 'dummy' || c.kind === 'security').every((c) => !c.alert)).toBe(true);
    expect(cams.filter((c) => !c.active).every((c) => !c.alert)).toBe(true);
    expect(cams.filter((c) => c.alert).length).toBeGreaterThan(150);
  });
  it('decodes XML entities and copes with junk', () => {
    const one = parseCameras('<Placemark><name>x</name><ExtendedData><Data name="latitude"><value>32.1</value></Data><Data name="longitude"><value>34.8</value></Data><Data name="camera_type"><value>מצלמת מהירות</value></Data><Data name="description"><value>כביש 4 &amp; צומת</value></Data><Data name="heading"><value>-</value></Data></ExtendedData></Placemark><Placemark><name>no position</name></Placemark>');
    expect(one).toHaveLength(1);
    expect(one[0]).toMatchObject({ desc: 'כביש 4 & צומת', h: [], kind: 'speed' });
  });
});

describe('cameras along a route', () => {
  const route = buildRoute(fixture('tlv-jlm').routes[0]!, 'he');
  const cum = core.cumulative(route.geometry);
  // Synthetic cameras placed on the route, facing the way we drive and the opposite way.
  const at = (along: number) => core.pointAt(route.geometry, cum, along);
  const p1 = at(20000), p2 = at(40000);
  const cams = [
    { id: 1, lon: p1.point[0], lat: p1.point[1], h: [p1.bearing], limit: 100, kind: 'speed', alert: true },
    { id: 2, lon: p2.point[0], lat: p2.point[1], h: [(p2.bearing + 180) % 360], limit: 100, kind: 'speed', alert: true }, // other carriageway
    { id: 3, lon: p2.point[0] + 0.01, lat: p2.point[1], h: [], limit: 80, kind: 'speed', alert: true },                 // a km off the road
    { id: 4, lon: p1.point[0], lat: p1.point[1], h: [p1.bearing], limit: 100, kind: 'security', alert: false },
  ];
  it('keeps cameras on the road, facing our direction; skips the other side and side roads', () => {
    const hits = core.camerasOnRoute(route.geometry, cum, cams);
    expect(hits.map((h) => h.cam.id)).toEqual([1]);
    expect(Math.abs(hits[0]!.along - 20000)).toBeLessThan(20);
  });
  it('warns once, about 20 seconds ahead, with the speed limit', () => {
    const w = core.cameraWatch(core.camerasOnRoute(route.geometry, cum, cams), 'he');
    const said: string[] = [];
    for (let a = 18000; a < 20100; a += 27) { const r = w.update(a, 27); if (r.say) said.push(r.say); }
    expect(said).toEqual(['מצלמת מהירות בעוד 500 מטר. מהירות מותרת 100']);
  });
  it('does not flag cameras at nearby junctions the route only passes by', () => {
    // Real data: three red-light cameras sit 200–240 m from this route, at side junctions.
    expect(core.camerasOnRoute(route.geometry, cum, parseCameras(kml))).toEqual([]);
  });
  it('with real cameras from the map: alerts driving their way, stays quiet the other way', () => {
    const real = parseCameras(kml).filter((c) => c.alert && c.h.length === 1).slice(0, 25);
    const R = 6371008.8, rad = Math.PI / 180;
    const move = (lon: number, lat: number, brg: number, m: number): [number, number] =>
      [lon + (m * Math.sin(brg * rad)) / (R * Math.cos(lat * rad)) / rad, lat + (m * Math.cos(brg * rad)) / R / rad];
    for (const c of real) {
      const h = c.h[0]!;
      const along = [move(c.lon, c.lat, h + 180, 400), [c.lon, c.lat] as [number, number], move(c.lon, c.lat, h, 400)];
      const against = [...along].reverse();
      expect(core.camerasOnRoute(along, core.cumulative(along), [c]).length, `camera ${c.id}`).toBe(1);
      expect(core.camerasOnRoute(against, core.cumulative(against), [c]).length, `camera ${c.id} reversed`).toBe(0);
    }
  });
});

describe('choosing between routes', () => {
  it('measures how much two routes share the same road', () => {
    const r = buildRoute(fixture('tlv-jlm').routes[0]!, 'he');
    expect(core.overlap(r.geometry, r.geometry)).toBe(1);
    const other = buildRoute(fixture('roundabout').routes[0]!, 'he');
    expect(core.overlap(other.geometry, r.geometry)).toBe(0);
  });
  it('fastest by live traffic when known, shortest by distance', () => {
    const base = { geometry: [], steps: [] } as never as ReturnType<typeof buildRoute>;
    const routes: RouteOut[] = [
      { ...base, distance: 10000, duration: 600, traffic: { seconds: 1500, delay: 900 } }, // short but jammed
      { ...base, distance: 14000, duration: 800, traffic: { seconds: 850, delay: 50 } },
      { ...base, distance: 12000, duration: 700 },                                        // no traffic data: router estimate
    ];
    expect(rank(routes)).toEqual({ best: 2, shortest: 0 });
    routes[2]!.traffic = { seconds: 1000, delay: 300 };
    expect(rank(routes)).toEqual({ best: 1, shortest: 0 });
  });
  it('search: a nearby match beats the same name in another city', () => {
    const r = nearFirst([
      { name: 'עזריאלי', detail: 'מודיעין', lon: 35.008, lat: 31.9 },
      { name: 'עזריאלי שרונה', detail: 'תל אביב', lon: 34.79, lat: 32.07 },
      { name: 'עזריאלי ראשונים', detail: 'ראשון לציון', lon: 34.79, lat: 31.95 },
    ], 32.08, 34.79);
    expect(r[0]!.detail).toBe('תל אביב');
  });
  it('thins long lines but keeps both ends', () => {
    const line = Array.from({ length: 1000 }, (_, i) => [34 + i / 1000, 32] as [number, number]);
    const t = thin(line, 150);
    expect(t).toHaveLength(150);
    expect(t[0]).toEqual(line[0]);
    expect(t.at(-1)).toEqual(line.at(-1));
  });
});

describe('server: traffic and cameras', () => {
  afterEach(() => vi.unstubAllGlobals());
  const get = (path: string, env: object = {}) => worker.fetch(new Request(`https://heynav.test${path}`, { headers: { 'x-hn': '1' } }), env as never, ctx);

  it('search survives the search service refusing: retries, then falls back to Nominatim', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (u: URL | string) => {
      const s = String(u);
      calls.push(s.includes('photon') ? 'photon' : 'nominatim');
      if (s.includes('photon')) return new Response('', { status: 521 });
      expect(s).toContain('accept-language=he');
      return new Response(JSON.stringify([{ lat: '32.0752', lon: '34.7746', name: 'דיזנגוף סנטר', address: { road: 'דיזנגוף', house_number: '50', city: 'תל אביב-יפו', country_code: 'il' } }]));
    }));
    const d = await (await get('/api/search?q=' + encodeURIComponent('דיזנגוף סנטר q' + Math.random()) + '&lat=32.08&lon=34.78')).json() as { ok: boolean; places: { name: string; detail: string }[] };
    expect(calls).toEqual(['photon', 'photon', 'photon', 'nominatim']);
    expect(d.places[0]).toMatchObject({ name: 'דיזנגוף סנטר', detail: 'דיזנגוף 50, תל אביב-יפו' });
  });
  it('serves cameras parsed from the map', async () => {
    vi.stubGlobal('fetch', vi.fn(async (u: string) => { expect(u).toContain('google.com/maps/d/kml?mid=1bspXgBYQ2GWj_6rDdGrJhG81RQConHHm'); return new Response(kml); }));
    const d = await (await get('/api/cameras')).json() as { ok: boolean; cameras: unknown[] };
    expect(d.ok).toBe(true);
    expect(d.cameras).toHaveLength(189);
  });
  it('says plainly when the camera map is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 500 })));
    expect((await get('/api/cameras')).status).toBe(502);
  });
  it('reports traffic as off, and routes still work, without a TomTom key', async () => {
    expect(await (await get('/api/config')).json()).toEqual({ ok: true, traffic: false });
    expect((await get('/api/traffic/12/2440/1660.png')).status).toBe(404);
    expect(await (await get('/api/incidents?bbox=34.7,32,34.8,32.1')).json()).toEqual({ ok: true, incidents: [] });
  });
  it('times every alternative with traffic and recommends the fastest', async () => {
    const osrm = fixture('tlv-jlm');
    const two = { ...osrm, routes: [osrm.routes[0], { ...osrm.routes[0], distance: osrm.routes[0]!.distance + 5000 }] };
    let tt = 0;
    vi.stubGlobal('fetch', vi.fn(async (u: URL | string, init?: RequestInit) => {
      const s = String(u);
      if (s.includes('osrm') || s.includes('router')) { expect(s).toContain('alternatives=3'); return new Response(JSON.stringify(two)); }
      expect(s).toContain('/routing/1/calculateRoute/');
      expect(s).toContain('key=SECRET');
      expect(JSON.parse(String(init!.body)).supportingPoints.length).toBeLessThanOrEqual(150);
      tt++;
      // first candidate is jammed, second is clear
      return new Response(JSON.stringify({ routes: [{ summary: tt === 1 ? { travelTimeInSeconds: 5400, trafficDelayInSeconds: 2400 } : { travelTimeInSeconds: 3300, trafficDelayInSeconds: 100 } }] }));
    }));
    const r = await get('/api/route?from=34.7818,32.0853&to=35.2137,31.7683', { TOMTOM_KEY: 'SECRET', ROUTER_BASE: 'https://router.test/' });
    const d = await r.json() as { routes: { traffic?: { seconds: number } }[]; best: number; shortest: number; traffic: boolean };
    expect(d.traffic).toBe(true);
    expect(d.routes.map((x) => x.traffic?.seconds)).toEqual([5400, 3300]);
    expect(d.best).toBe(1);
    expect(d.shortest).toBe(0);
  });
  it('proxies traffic tiles and incidents without ever sending the key to the browser', async () => {
    vi.stubGlobal('fetch', vi.fn(async (u: string | URL) => {
      const s = String(u);
      if (s.includes('/traffic/map/')) { expect(s).toContain('relative0-dark/12/2440/1660.png'); return new Response(new Uint8Array([137, 80, 78, 71])); }
      return new Response(JSON.stringify({ incidents: [{ geometry: { type: 'LineString', coordinates: [[34.78, 32.08], [34.79, 32.08]] }, properties: { iconCategory: 1, magnitudeOfDelay: 3, delay: 400 } }] }));
    }));
    const env = { TOMTOM_KEY: 'SECRET' };
    const tile = await get('/api/traffic/12/2440/1660.png?dark=1', env);
    expect(tile.headers.get('content-type')).toBe('image/png');
    const inc = await (await get('/api/incidents?bbox=34.7,32,34.8,32.1', env)).json() as { incidents: { kind: string }[] };
    expect(inc.incidents[0]!.kind).toBe('accident');
    expect(JSON.stringify(inc)).not.toContain('SECRET');
    expect((await get('/api/incidents?bbox=30,29,36,34', env)).status).toBe(400); // too large an area
    expect((await get('/api/traffic/99/1/1.png', env)).status).toBe(400);
  });
});
