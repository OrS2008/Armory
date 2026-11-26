import { describe, expect, it, vi, afterEach } from 'vitest';
import fs from 'fs';
import vm from 'vm';
import { core, navCore } from '../src/core';
import { buildRoute, type OsrmRoute } from '../src/guidance';
import worker from '../src/index';
import { lonLat, placeFromPhoton } from '../src/api';
import { appPage } from '../src/page';

const fixture = (name: string) => JSON.parse(fs.readFileSync(`test/fixtures/${name}.json`, 'utf8')).routes[0] as OsrmRoute;
type LL = [number, number];

/** Drives along the route at a steady speed, one fix per second, like the in-app test drive. */
function drive(routeName: string, lang: 'he' | 'en', speed = 12, mutate?: (pos: LL, i: number) => LL) {
  const route = buildRoute(fixture(routeName), lang);
  const trk = core.tracker(route, lang);
  const cum = core.cumulative(route.geometry);
  const said: { at: number; text: string }[] = [];
  let arrivedAt = -1, reroutes = 0, last;
  for (let i = 0, along = 0; i < 20000; i++, along += speed) {
    const pt = core.pointAt(route.geometry, cum, along);
    const pos = mutate ? mutate(pt.point, i) : pt.point;
    last = trk.update({ pos, accuracy: 5, speed, heading: pt.bearing, time: i * 1000 });
    if (last.say) said.push({ at: along, text: last.say });
    if (last.reroute) reroutes++;
    if (last.arrived) { arrivedAt = along; break; }
    if (along > trk.total + 100) break;
  }
  return { route, said, arrivedAt, reroutes, last: last!, total: trk.total };
}

describe('geometry', () => {
  it('measures street-scale distances accurately', () => {
    // Two points about 1 km apart north–south in Tel Aviv.
    expect(core.dist([34.78, 32.08], [34.78, 32.089])).toBeGreaterThan(995);
    expect(core.dist([34.78, 32.08], [34.78, 32.089])).toBeLessThan(1005);
  });
  it('gives compass bearings', () => {
    expect(Math.round(core.bearing([34.78, 32.08], [34.78, 32.09]))).toBe(0);
    expect(Math.round(core.bearing([34.78, 32.08], [34.79, 32.08]))).toBe(90);
    expect(core.angleDiff(350, 10)).toBe(20);
  });
  it('projects a point onto a line and reports how far along and how far off it is', () => {
    const line: LL[] = [[34.78, 32.08], [34.79, 32.08]];
    const cum = core.cumulative(line);
    const p = core.project(line, cum, [34.785, 32.0805]);
    expect(p.along).toBeGreaterThan(cum[1]! * 0.49);
    expect(p.along).toBeLessThan(cum[1]! * 0.51);
    expect(p.offset).toBeGreaterThan(50);
    expect(p.offset).toBeLessThan(60);
  });
  it('formats distances the way people say them', () => {
    expect(core.spokenDistance(480, 'he')).toBe('500 מטר');
    expect(core.spokenDistance(1000, 'he')).toBe('קילומטר');
    expect(core.spokenDistance(2400, 'en')).toBe('2.4 kilometres');
    expect(core.shortDistance(1450, 'he')).toBe('1.4 ק״מ');
    expect(core.shortDistance(73, 'en')).toBe('70 m');
  });
});

describe('directions', () => {
  it('builds Hebrew and English instructions from real OSRM routes', () => {
    const he = buildRoute(fixture('roundabout'), 'he').steps.map((s) => s.text);
    expect(he).toContain('בכיכר צא ביציאה השנייה להעצמאות');
    expect(he).toContain('בסוף הדרך פנה שמאלה לקהילת ציון');
    expect(he.at(-1)).toBe('הגעת ליעד. היעד מימינך');
    const en = buildRoute(fixture('roundabout'), 'en').steps.map((s) => s.text);
    expect(en).toContain('At the roundabout, take the first exit onto הבנים');
    const hw = buildRoute(fixture('tlv-jlm'), 'he').steps.map((s) => s.text);
    expect(hw).toContain('עלה לרמפה מימין לכיוון איילון דרום');
    expect(hw.some((t) => t.startsWith('בהתפצלות שמור ימינה'))).toBe(true);
  });
  it('joins step geometry into one line whose length matches OSRM', () => {
    for (const f of ['tlv-city', 'tlv-jlm', 'roundabout']) {
      const r = buildRoute(fixture(f), 'he');
      expect(Math.abs(r.distance - fixture(f).distance) / fixture(f).distance).toBeLessThan(0.01);
      for (let i = 1; i < r.steps.length; i++) expect(r.steps[i]!.start).toBeGreaterThanOrEqual(r.steps[i - 1]!.start);
    }
  });
  it('uses ל- before a road number and attaches ל to Hebrew names', () => {
    const r = buildRoute({ distance: 1, duration: 1, legs: [{ steps: [
      { geometry: { coordinates: [[34.78, 32.08], [34.781, 32.08]] }, maneuver: { location: [34.78, 32.08], type: 'turn', modifier: 'right' }, name: '', ref: '4', distance: 1, duration: 1 },
      { geometry: { coordinates: [[34.781, 32.08], [34.782, 32.08]] }, maneuver: { location: [34.781, 32.08], type: 'turn', modifier: 'left' }, name: 'Main St', distance: 1, duration: 1 },
    ] }] }, 'he');
    expect(r.steps[0]!.text).toBe('פנה ימינה לכביש 4');
    expect(r.steps[1]!.text).toBe('פנה שמאלה ל-Main St');
  });
});

describe('guidance while driving', () => {
  for (const name of ['tlv-city', 'roundabout']) {
    it(`announces every turn once, in order, and arrives (${name})`, () => {
      const { route, said, arrivedAt, reroutes, total } = drive(name, 'he');
      expect(reroutes).toBe(0);
      expect(arrivedAt).toBeGreaterThan(total - 40);
      // Each announced manoeuvre's own text is spoken at least once before (or at) it, never after.
      const speakable = route.steps.slice(1).filter((s) => s.speak);
      for (const s of speakable) {
        const hits = said.filter((x) => x.text.includes(s.text));
        expect(hits.length, s.text).toBeGreaterThan(0);
        expect(hits[0]!.at, s.text).toBeLessThanOrEqual(s.start + 15);
      }
      // No manoeuvre is announced "now" twice: the number of announcements stays modest.
      expect(said.length).toBeLessThanOrEqual(speakable.length * 2 + 1);
      expect(said.at(-1)!.text).toContain('הגעת ליעד');
    });
  }
  it('gives an early warning on long highway stretches', () => {
    const { said } = drive('tlv-jlm', 'he', 27);
    expect(said.some((x) => x.text.startsWith('בעוד 2 קילומטר, בהתפצלות'))).toBe(true);
  });
  it('asks for a new route after leaving it, but not for one stray fix', () => {
    const stray = drive('tlv-city', 'he', 12, (p, i) => (i === 40 ? [p[0] + 0.002, p[1]] : p));
    expect(stray.reroutes).toBe(0);
    const off = drive('tlv-city', 'he', 12, (p, i) => (i >= 40 ? [p[0] + 0.003, p[1] + 0.003] : p));
    expect(off.reroutes).toBeGreaterThan(0);
  });
  it('counts down remaining distance and time', () => {
    const route = buildRoute(fixture('tlv-city'), 'he');
    const trk = core.tracker(route, 'he');
    const a = trk.update({ pos: route.geometry[0]!, accuracy: 5, speed: 10, heading: null, time: 0 });
    const mid = core.pointAt(route.geometry, core.cumulative(route.geometry), trk.total / 2).point;
    const b = trk.update({ pos: mid, accuracy: 5, speed: 10, heading: null, time: 1 });
    expect(a.remaining).toBeGreaterThan(b.remaining);
    expect(b.remaining).toBeGreaterThan(trk.total * 0.45);
    expect(b.remainingTime).toBeLessThan(a.remainingTime);
  });
});

describe('browser copy of the core', () => {
  it('runs on its own, with nothing from outside the function', () => {
    const src = `(function(){var __name=(f)=>f;return (${navCore.toString()})();})()`;
    const copy = vm.runInNewContext(src, { Math, Set, Infinity }) as typeof core;
    const route = buildRoute(fixture('tlv-city'), 'he');
    const a = core.tracker(route, 'he').intro();
    expect(copy.tracker(route, 'he').intro()).toBe(a);
    expect(copy.shortDistance(1450, 'he')).toBe('1.4 ק״מ');
  });
  it('the page script is valid JavaScript with the core inside', () => {
    const html = appPage('he', 'https://x.test');
    const m = /<script type="module" nonce="\{\{NONCE\}\}">([\s\S]*?)<\/script>/.exec(html);
    expect(m).toBeTruthy();
    const body = m![1]!.replace(/^\s*import[^\n]*\n/, '');
    expect(body).not.toContain('__CORE__');
    expect(() => new vm.Script(`(async function(){${body}\n})`)).not.toThrow();
  });
});

describe('server', () => {
  const env = {};
  const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext;
  const get = (path: string, headers: Record<string, string> = { 'x-hn': '1' }) => worker.fetch(new Request(`https://heynav.test${path}`, { headers }), env, ctx);
  afterEach(() => vi.unstubAllGlobals());

  it('serves the app with a strict CSP carrying a fresh nonce, and location allowed', async () => {
    const r = await get('/', {});
    expect(r.status).toBe(200);
    const csp = r.headers.get('content-security-policy')!;
    const nonce = /nonce-([A-Za-z0-9]+)/.exec(csp)![1]!;
    const html = await r.text();
    expect(html).toContain(`nonce="${nonce}"`);
    expect(html).not.toContain('{{NONCE}}');
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain('connect-src \'self\' https://tiles.openfreemap.org');
    expect(r.headers.get('permissions-policy')).toContain('geolocation=(self)');
  });
  it('serves MapLibre and the fonts itself', async () => {
    expect((await get('/vendor/maplibre-gl.mjs', {})).headers.get('content-type')).toContain('javascript');
    expect((await get('/vendor/maplibre-gl-worker.mjs?v=6', {})).status).toBe(200);
    expect((await get('/fonts/heebo-hebrew-400-normal.woff2', {})).headers.get('content-type')).toBe('font/woff2');
    expect((await get('/vendor/../index.ts', {})).status).toBe(404);
  });
  it('refuses API calls without the app header (no cross-site use)', async () => {
    expect((await get('/api/search?q=tel', {})).status).toBe(403);
  });
  it('validates input before calling anyone', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    expect((await get('/api/search?q=a')).status).toBe(400);
    expect((await get('/api/route?from=1,2&to=evil')).status).toBe(400);
    expect((await get('/api/route?from=34.7,32.1&to=200,32')).status).toBe(400);
    expect(f).not.toHaveBeenCalled();
    expect(lonLat('34.78,32.08')).toEqual([34.78, 32.08]);
    expect(lonLat('34.78,32.08;1,1')).toBeNull();
  });
  it('turns Photon results into places, de-duplicated', async () => {
    const feat = (name: string, city: string) => ({ geometry: { coordinates: [34.77, 32.07] }, properties: { name, city, countrycode: 'IL', country: 'ישראל' } });
    vi.stubGlobal('fetch', vi.fn(async (u: URL, init: RequestInit) => {
      expect(String(u)).toContain('photon.komoot.io');
      expect((init.headers as Record<string, string>)['user-agent']).toMatch(/^HeyNav\//);
      return new Response(JSON.stringify({ features: [feat('דיזנגוף סנטר', 'תל אביב'), feat('דיזנגוף סנטר', 'תל אביב'), feat('', '')] }));
    }));
    const d = await (await get('/api/search?q=' + encodeURIComponent('דיזנגוף') + '&lat=32.08&lon=34.78')).json() as { places: unknown[] };
    expect(d.places).toEqual([{ name: 'דיזנגוף סנטר', detail: 'תל אביב', lon: 34.77, lat: 32.07 }]);
    expect(placeFromPhoton({ geometry: { coordinates: [1, 2] }, properties: { street: 'Herzl', housenumber: '5', city: 'Haifa', countrycode: 'IL' } }).name).toBe('Herzl 5');
    expect(placeFromPhoton({ geometry: { coordinates: [1, 2] }, properties: { name: 'Mall', street: '1240', city: 'Tel Aviv', countrycode: 'IL' } }).detail).toBe('Tel Aviv');
    expect(placeFromPhoton({ geometry: { coordinates: [1, 2] }, properties: { housenumber: '7', city: 'Haifa', countrycode: 'IL' } }).name).toBe('Haifa');
  });
  it('returns a ready-to-drive route with directions, starting in the car\'s direction when rerouting', async () => {
    const osrm = JSON.parse(fs.readFileSync('test/fixtures/roundabout.json', 'utf8'));
    let called = '';
    vi.stubGlobal('fetch', vi.fn(async (u: URL) => { called = String(u); return new Response(JSON.stringify(osrm)); }));
    const d = await (await get('/api/route?from=34.8516,32.1663&to=34.8461,32.163&bearing=90&lang=he')).json() as { ok: boolean; route: { steps: { text: string }[] } };
    expect(called).toContain('34.8516,32.1663;34.8461,32.163');
    expect(called).toContain('bearings=90%2C60%3B');
    expect(d.ok).toBe(true);
    expect(d.route.steps.map((s) => s.text)).toContain('בכיכר צא ביציאה השנייה להעצמאות');
  });
  it('reports no route and rate limiting cleanly', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ code: 'NoRoute' }))));
    expect((await get('/api/route?from=34.8,32.1&to=35.2,31.7')).status).toBe(404);
    const limited = { RL_API: { limit: async () => ({ success: false }) } };
    const r = await worker.fetch(new Request('https://heynav.test/api/route?from=34.8,32.1&to=35.2,31.7', { headers: { 'x-hn': '1' } }), limited as never, ctx);
    expect(r.status).toBe(429);
  });
});
