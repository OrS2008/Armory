import type { buildRoute } from './guidance';
/** Input parsing and result shaping for the API (kept out of the entry module). */

/** "lon,lat" → [lon, lat], or null. */
export function lonLat(s: string | null): [number, number] | null {
  const m = /^(-?\d{1,3}(?:\.\d{1,9})?),(-?\d{1,2}(?:\.\d{1,9})?)$/.exec(s ?? '');
  if (!m) return null;
  const lon = Number(m[1]), lat = Number(m[2]);
  return Math.abs(lon) <= 180 && Math.abs(lat) <= 90 ? [lon, lat] : null;
}

export interface Place { name: string; detail: string; lon: number; lat: number }

export interface PhotonFeature {
  geometry: { coordinates: [number, number] };
  properties: Record<string, string | undefined>;
}

export function placeFromPhoton(f: PhotonFeature): Place {
  const p = f.properties;
  // OSM sometimes names internal roads by bare numbers ("1240"): useless to a driver.
  const street = p.street && !/^\d+$/.test(p.street) ? [p.street, p.housenumber].filter(Boolean).join(' ') : '';
  const name = p.name || street || p.city || p.state || '';
  const detail = [p.name && street && street !== p.name ? street : '', p.city && p.city !== name ? p.city : p.district ?? '', p.country && p.countrycode !== 'IL' ? p.country : '']
    .filter(Boolean).join(', ');
  return { name, detail, lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] };
}


export type RouteOut = ReturnType<typeof buildRoute> & { traffic?: { seconds: number; delay: number } };

/** Fastest by traffic time when known (else the router's estimate); shortest by distance. */
export function rank(routes: RouteOut[]) {
  const time = (x: RouteOut) => x.traffic?.seconds ?? x.duration;
  let best = 0, shortest = 0;
  routes.forEach((x, i) => {
    if (time(x) < time(routes[best]!)) best = i;
    if (x.distance < routes[shortest]!.distance) shortest = i;
  });
  return { best, shortest };
}


/**
 * Photon ranks an exact name match first even when it is in another city. Blend its
 * order with distance from the driver: each ~8 km away costs one place in the list.
 */
export function nearFirst(places: Place[], lat: number, lon: number): Place[] {
  const km = (p: Place) => {
    const x = (p.lon - lon) * Math.cos(((p.lat + lat) / 2) * (Math.PI / 180)), y = p.lat - lat;
    return Math.sqrt(x * x + y * y) * 111.2;
  };
  return places.map((p, i) => ({ p, s: i + km(p) / 8 })).sort((a, b) => a.s - b.s).map((x) => x.p);
}

export interface NominatimHit { lat: string; lon: string; name?: string; display_name?: string; address?: Record<string, string | undefined> }

export function placeFromNominatim(h: NominatimHit): Place {
  const a = h.address ?? {};
  const street = a.road && !/^\d+$/.test(a.road) ? [a.road, a.house_number].filter(Boolean).join(' ') : '';
  const city = a.city ?? a.town ?? a.village ?? a.suburb ?? '';
  const name = h.name || street || (h.display_name ?? '').split(',')[0]!.trim() || city;
  const detail = [street && street !== name ? street : '', city && city !== name ? city : '', a.country_code && a.country_code !== 'il' ? a.country ?? '' : '']
    .filter(Boolean).join(', ');
  return { name, detail, lon: Number(h.lon), lat: Number(h.lat) };
}
