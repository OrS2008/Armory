/**
 * Live traffic from TomTom (needs the TOMTOM_KEY secret; everything degrades
 * gracefully without it). The key never reaches the browser: tiles and
 * incidents are proxied, and travel times are computed here.
 */
type LonLat = [number, number];
const API = 'https://api.tomtom.com';

/** Evenly thinned copy of a line (keeps both ends), so requests stay small. */
export function thin(line: LonLat[], max: number): LonLat[] {
  if (line.length <= max) return line;
  const out: LonLat[] = [];
  const step = (line.length - 1) / (max - 1);
  for (let i = 0; i < max; i++) out.push(line[Math.round(i * step)]!);
  return out;
}

export interface TrafficTime { seconds: number; delay: number; noTraffic: number }

/**
 * Travel time with live traffic along a given route: TomTom rebuilds the route
 * through our points (so it times *this* road choice) and returns the timing.
 */
export async function timeRoute(key: string, line: LonLat[], base = API): Promise<TrafficTime | null> {
  if (line.length < 2) return null;
  const pts = thin(line, 150);
  const a = pts[0]!, b = pts[pts.length - 1]!;
  const u = new URL(`${base}/routing/1/calculateRoute/${a[1]},${a[0]}:${b[1]},${b[0]}/json`);
  u.searchParams.set('key', key);
  u.searchParams.set('traffic', 'true');
  u.searchParams.set('travelMode', 'car');
  u.searchParams.set('computeTravelTimeFor', 'all');
  u.searchParams.set('routeRepresentation', 'summaryOnly');
  const r = await fetch(u, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ supportingPoints: pts.map(([lon, lat]) => ({ latitude: lat, longitude: lon })) }),
  });
  if (!r.ok) return null;
  const d = (await r.json().catch(() => null)) as { routes?: { summary?: { travelTimeInSeconds?: number; trafficDelayInSeconds?: number; noTrafficTravelTimeInSeconds?: number } }[] } | null;
  const s = d?.routes?.[0]?.summary;
  if (!s || typeof s.travelTimeInSeconds !== 'number') return null;
  return { seconds: s.travelTimeInSeconds, delay: s.trafficDelayInSeconds ?? 0, noTraffic: s.noTrafficTravelTimeInSeconds ?? s.travelTimeInSeconds };
}

/** Traffic-flow tile (PNG, transparent), coloured by speed relative to free flow. */
export async function trafficTile(key: string, z: number, x: number, y: number, dark: boolean, base = API): Promise<Response> {
  const style = dark ? 'relative0-dark' : 'relative0';
  const u = `${base}/traffic/map/4/tile/flow/${style}/${z}/${x}/${y}.png?key=${encodeURIComponent(key)}&tileSize=256`;
  const r = await fetch(u);
  return new Response(r.ok ? r.body : null, {
    status: r.ok ? 200 : r.status === 404 ? 404 : 502,
    headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=120' },
  });
}

export type IncidentKind = 'accident' | 'jam' | 'closed' | 'lane' | 'works' | 'danger' | 'weather' | 'broken' | 'other';
export interface Incident { kind: IncidentKind; lon: number; lat: number; delay: number; magnitude: number; line?: LonLat[]; road?: string }

const ICON: Record<number, IncidentKind> = { 1: 'accident', 2: 'weather', 3: 'danger', 4: 'weather', 5: 'weather', 6: 'jam', 7: 'lane', 8: 'closed', 9: 'works', 10: 'weather', 11: 'weather', 14: 'broken' };

export async function incidents(key: string, bbox: [number, number, number, number], base = API): Promise<Incident[]> {
  const u = new URL(`${base}/traffic/services/5/incidentDetails`);
  u.searchParams.set('key', key);
  u.searchParams.set('bbox', bbox.join(','));
  u.searchParams.set('fields', '{incidents{type,geometry{type,coordinates},properties{iconCategory,magnitudeOfDelay,delay,roadNumbers}}}');
  u.searchParams.set('timeValidityFilter', 'present');
  const r = await fetch(u);
  if (!r.ok) throw new Error(`incidents ${r.status}: ${(await r.text().catch(() => '')).slice(0, 160)}`);
  const d = (await r.json().catch(() => null)) as { incidents?: { geometry?: { type: string; coordinates: unknown }; properties?: { iconCategory?: number; magnitudeOfDelay?: number; delay?: number; roadNumbers?: string[] } }[] } | null;
  const out: Incident[] = [];
  for (const i of d?.incidents ?? []) {
    const g = i.geometry;
    if (!g) continue;
    let line: LonLat[] | undefined;
    let pt: LonLat | undefined;
    if (g.type === 'Point') pt = g.coordinates as LonLat;
    else if (g.type === 'LineString') { line = g.coordinates as LonLat[]; pt = line[0]; }
    if (!pt) continue;
    const p = i.properties ?? {};
    out.push({
      kind: ICON[p.iconCategory ?? 0] ?? 'other', lon: pt[0], lat: pt[1], delay: p.delay ?? 0, magnitude: p.magnitudeOfDelay ?? 0,
      line: line && line.length > 1 ? thin(line, 40) : undefined, road: p.roadNumbers?.[0],
    });
  }
  return out.slice(0, 300);
}
