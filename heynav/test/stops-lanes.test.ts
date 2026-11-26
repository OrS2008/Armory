import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import { core } from '../src/core';
import { buildRoute, type OsrmRoute } from '../src/guidance';
import { buildValhallaRoute, tripLine } from '../src/valhalla';
import { laneSections } from '../src/traffic';
import { attachLanes } from '../src/api';
import { stationsFrom, stationsFromTomTom } from '../src/fuel';
import worker from '../src/index';

const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext;
const osrmVia = JSON.parse(fs.readFileSync('test/fixtures/osrm-via.json', 'utf8'));
const valVia = JSON.parse(fs.readFileSync('test/fixtures/valhalla-via.json', 'utf8'));
const STOP: [number, number] = [34.838, 32.06];

/** Drives a route end to end through the tracker; returns what was said. */
function drive(r: ReturnType<typeof buildRoute>) {
  const trk = core.tracker(r, 'he');
  const cum = core.cumulative(r.geometry);
  const said: string[] = [];
  let arrivedAt = -1;
  for (let a = 0; a < trk.total + 30; a += 12) {
    const p = trk.update({ pos: core.pointAt(r.geometry, cum, a).point, accuracy: 5, speed: 14, heading: null, time: a });
    if (p.say) said.push(p.say);
    if (p.arrived && arrivedAt < 0) arrivedAt = a;
  }
  return { said, arrivedAt, total: trk.total };
}

describe('a stop on the way', () => {
  for (const [name, build] of [
    ['OSRM', () => buildRoute(osrmVia.routes[0] as OsrmRoute, 'he')],
    ['Valhalla', () => buildValhallaRoute(valVia.trip, 'he')],
  ] as const) {
    it(`${name}: one continuous route, the stop is a waypoint, arrival only at the end`, () => {
      const r = build();
      const wp = r.steps.filter((s) => s.type === 'waypoint');
      expect(wp).toHaveLength(1);
      expect(r.steps.filter((s) => s.type === 'arrive')).toHaveLength(1);
      expect(r.steps.at(-1)!.type).toBe('arrive');
      expect(r.steps.filter((s) => s.type === 'depart')).toHaveLength(1);
      expect(wp[0]!.text).toMatch(/^הגעת לעצירה/);
      // the waypoint sits where the stop is
      const cum = core.cumulative(r.geometry);
      expect(core.dist(core.pointAt(r.geometry, cum, wp[0]!.start).point, STOP)).toBeLessThan(150);
      for (let i = 1; i < r.steps.length; i++) expect(r.steps[i]!.start).toBeGreaterThanOrEqual(r.steps[i - 1]!.start - 1);
      // driving it: the stop is announced, and "arrived" only happens at the real destination
      const d = drive(r);
      expect(d.said.some((x) => x.includes('הגעת לעצירה'))).toBe(true);
      expect(d.arrivedAt).toBeGreaterThan(d.total - 60);
    });
  }
  it('Valhalla: legs are joined without a gap', () => {
    const line = tripLine(valVia.trip);
    const r = buildValhallaRoute(valVia.trip, 'he');
    expect(r.geometry.length).toBe(line.length);
    expect(Math.abs(r.distance / 1000 - valVia.trip.summary.length)).toBeLessThan(0.3);
  });
});

describe('lane guidance', () => {
  const route = buildRoute(JSON.parse(fs.readFileSync('test/fixtures/tlv-jlm.json', 'utf8')).routes[0], 'he');
  const cum = core.cumulative(route.geometry);
  const turn = route.steps.find((s) => s.speak && s.type !== 'depart' && s.start > 2000)!;
  const at = (a: number) => core.pointAt(route.geometry, cum, a).point;

  it('reads TomTom lane sections, keeping only junctions where the lane matters', () => {
    const pts = [at(0), at(turn.start - 300), at(turn.start - 100)].map(([lon, lat]) => ({ latitude: lat, longitude: lon }));
    const secs = laneSections({
      legs: [{ points: pts }],
      sections: [
        { sectionType: 'TRAVEL_MODE', startPointIndex: 0 },
        { sectionType: 'LANES', startPointIndex: 1, lanes: [{ directions: ['LEFT'] }, { directions: ['STRAIGHT'] }, { directions: ['STRAIGHT', 'RIGHT'], follow: 'RIGHT' }] },
        { sectionType: 'LANES', startPointIndex: 2, lanes: [{ directions: ['STRAIGHT'], follow: 'STRAIGHT' }, { directions: ['STRAIGHT'], follow: 'STRAIGHT' }] },
      ],
    });
    expect(secs).toHaveLength(1);
    expect(secs[0]!.lanes).toEqual([{ d: ['left'], ok: false }, { d: ['straight'], ok: false }, { d: ['straight', 'right'], ok: true }]);
  });

  it('puts lanes on the turn they lead to, not on others', () => {
    const r = JSON.parse(JSON.stringify(route));
    const lanes = [{ d: ['straight'], ok: false }, { d: ['right'], ok: true }];
    attachLanes(r, [{ at: at(turn.start - 300), lanes }, { at: at(turn.start + 5000), lanes }]);
    const withLanes = r.steps.filter((s: { lanes?: unknown }) => s.lanes);
    expect(withLanes.length).toBeGreaterThanOrEqual(1);
    expect(r.steps[route.steps.indexOf(turn)].lanes).toEqual(lanes);
    // a section far from any turn attaches to nothing extra
    for (const s of withLanes) expect(Math.abs(s.start - turn.start) < 1 || Math.abs(s.start - (turn.start + 5000)) < 800).toBe(true);
  });
});

describe('fuel stations', () => {
  afterEach(() => vi.unstubAllGlobals());
  const els = [
    { type: 'node', id: 1, lat: 32.07, lon: 34.8, tags: { amenity: 'fuel', name: 'פז איילון', 'name:en': 'Paz Ayalon', brand: 'פז' } },
    { type: 'way', id: 2, center: { lat: 32.08, lon: 34.81 }, tags: { amenity: 'fuel', brand: 'Sonol', 'brand:he': 'סונול' } },
    { type: 'node', id: 3, lat: 32.07, lon: 34.8, tags: { amenity: 'fuel', name: 'duplicate' } },
    { type: 'node', id: 4, tags: { amenity: 'fuel' } },
  ];
  it('turns OSM elements into stations (Hebrew names, brand, areas by centre, no duplicates)', () => {
    expect(stationsFrom(els, 'he')).toEqual([
      { id: 'n1', name: 'פז איילון', brand: 'פז', lon: 34.8, lat: 32.07 },
      { id: 'w2', name: 'סונול', brand: '', lon: 34.81, lat: 32.08 },
    ]);
    expect(stationsFrom(els, 'en')[0]!.name).toBe('Paz Ayalon');
  });
  it('TomTom results: fuel stations only, with brand and detour', () => {
    expect(stationsFromTomTom([
      { id: 'a', position: { lat: 32.07, lon: 34.8 }, detourTime: 95, poi: { name: 'פז', brands: [{ name: 'פ״ז' }], categorySet: [{ id: 7311 }] } },
      { id: 'b', position: { lat: 32.08, lon: 34.81 }, poi: { name: 'דלק מוטורס', categorySet: [{ id: 9910002 }] } },
    ])).toEqual([{ id: 'ta', name: 'פז', brand: 'פ״ז', lon: 34.8, lat: 32.07, detour: 95 }]);
  });
  it('the API asks Overpass around the given line and validates input', async () => {
    let body = '';
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init: RequestInit) => { body = decodeURIComponent(String(init.body)); return new Response(JSON.stringify({ elements: els })); }));
    const call = (q: string) => worker.fetch(new Request('https://x.test/api/fuel?' + q, { headers: { 'x-hn': '1', cookie: 'hn_lang=he' } }), {} as never, ctx);
    const r = await call('line=34.78,32.08;34.80,32.07;34.83,32.06');
    const d = (await r.json()) as { ok: boolean; stations: unknown[] };
    expect(d.ok).toBe(true);
    expect(d.stations).toHaveLength(2);
    expect(body).toContain('amenity"="fuel"](around:400,32.08000,34.78000,32.07000,34.80000,32.06000,34.83000)');
    expect((await call('line=34.78,32.08')).status).toBe(400);
    expect((await call('line=evil;34.80,32.07')).status).toBe(400);
  });
});

describe('route API with a stop', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('passes the stop to the router between start and destination', async () => {
    let asked = '';
    vi.stubGlobal('fetch', vi.fn(async (u: string | URL) => { asked = String(u); return new Response(JSON.stringify(osrmVia)); }));
    const r = await worker.fetch(new Request('https://x.test/api/route?from=34.7818,32.0853&to=34.888,32.084&via=34.838,32.06', { headers: { 'x-hn': '1' } }), {} as never, ctx);
    const d = (await r.json()) as { ok: boolean; route: { steps: { type: string }[] } };
    expect(d.ok).toBe(true);
    expect(asked).toContain('34.7818,32.0853;34.838,32.06;34.888,32.084');
    expect(d.route.steps.some((s) => s.type === 'waypoint')).toBe(true);
    const bad = await worker.fetch(new Request('https://x.test/api/route?from=34.7818,32.0853&to=34.888,32.084&via=x', { headers: { 'x-hn': '1' } }), {} as never, ctx);
    expect(bad.status).toBe(400);
  });
});
