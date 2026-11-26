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

