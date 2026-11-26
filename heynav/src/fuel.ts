/**
 * Fuel stations along a route. With the TomTom key: TomTom's search along a route
 * (it also knows the detour each one costs). Otherwise OpenStreetMap via Overpass.
 */
import type { Lang } from './i18n';

type LonLat = [number, number];
const OVERPASS = 'https://overpass-api.de/api/interpreter';

export interface Station { id: string; name: string; brand: string; lon: number; lat: number; detour?: number }

interface OsmEl { type: string; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string | undefined> }

export function stationsFrom(els: OsmEl[], lang: Lang): Station[] {
  const out: Station[] = [];
  const seen = new Set<string>();
  for (const e of els) {
    const lat = e.lat ?? e.center?.lat, lon = e.lon ?? e.center?.lon;
    if (lat == null || lon == null) continue;
    const t = e.tags ?? {};
    const brand = (lang === 'he' ? t['brand:he'] ?? t.brand : t['brand:en'] ?? t.brand) ?? '';
    const name = (lang === 'he' ? t['name:he'] ?? t.name : t['name:en'] ?? t.name) ?? '';
    const k = `${lon.toFixed(4)},${lat.toFixed(4)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    const shown = name || brand;
    out.push({ id: `${e.type[0]}${e.id}`, name: shown, brand: brand !== shown ? brand : '', lon, lat });
  }
  return out;
}

/** Stations within ~400 m of the line (Overpass "around" a polyline). */
export async function fuelOnRoute(line: LonLat[], lang: Lang, ua: string, base = OVERPASS): Promise<Station[]> {
  const coords = line.map(([lon, lat]) => `${lat.toFixed(5)},${lon.toFixed(5)}`).join(',');
  const q = `[out:json][timeout:20];nwr["amenity"="fuel"](around:400,${coords});out center tags 200;`;
  const r = await fetch(base, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': ua, accept: 'application/json' },
    body: 'data=' + encodeURIComponent(q),
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error(`overpass ${r.status}: ${(await r.text().catch(() => '')).slice(0, 200)}`);
  const d = (await r.json()) as { elements?: OsmEl[] };
  return stationsFrom(d.elements ?? [], lang);
}

interface TTResult {
  id: string; position?: { lat: number; lon: number }; detourTime?: number;
  poi?: { name?: string; brands?: { name: string }[]; categorySet?: { id: number }[] };
}

export function stationsFromTomTom(results: TTResult[]): Station[] {
  const out: Station[] = [];
  for (const x of results) {
    if (!x.position) continue;
    // keep fuel stations only (the free-text search can return car dealers named "fuel")
    if (x.poi?.categorySet && !x.poi.categorySet.some((c) => c.id === 7311)) continue;
    const name = x.poi?.name ?? '';
    const brand = x.poi?.brands?.[0]?.name ?? '';
    out.push({ id: 't' + x.id, name: name || brand, brand: brand && brand !== name ? brand : '', lon: x.position.lon, lat: x.position.lat, detour: x.detourTime });
  }
  return out;
}

/** TomTom search along the route: stations up to ~10 minutes off it, spread along the way. */
export async function fuelTomTom(key: string, line: LonLat[], lang: Lang, base = 'https://api.tomtom.com'): Promise<Station[]> {
  const u = new URL(`${base}/search/2/searchAlongRoute/gas%20station.json`);
  u.searchParams.set('key', key);
  u.searchParams.set('maxDetourTime', '600');
  u.searchParams.set('limit', '20');
  u.searchParams.set('spreadingMode', 'auto');
  u.searchParams.set('language', lang === 'he' ? 'he-IL' : 'en-GB');
  const r = await fetch(u, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ route: { points: line.map(([lon, lat]) => ({ lat, lon })) } }),
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error(`tomtom search ${r.status}`);
  const d = (await r.json()) as { results?: TTResult[] };
  return stationsFromTomTom(d.results ?? []);
}
