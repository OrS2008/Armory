/**
 * Fuel prices at stations, reported by drivers (as Waze does): in Israel no public
 * source gives current prices per station. Only 95 petrol has a regulated maximum
 * (OFFICIAL below), set monthly by the Ministry of Energy; diesel is not regulated.
 *
 * Stored in KV by ~1 km cell: a station is matched by position (within 80 m), so a
 * price reported on a TomTom result also shows on the same station from the map.
 */

export const FUELS = ['s95', 'f95', 'dsl'] as const; // 95 self-service, 95 full service, diesel
export type Fuel = (typeof FUELS)[number];

/** The regulated maximum for 95 at the pump (₪/litre, VAT included) and the full-service extra. */
export const OFFICIAL = { from: '2026-11-05', self95: 7.85, fullExtra: 0.26 };

export interface StationPrices { lon: number; lat: number; p: Partial<Record<Fuel, { v: number; t: number }>> }

const KEEP_DAYS = 21; // a price older than this is not shown
const cellOf = (lon: number, lat: number) => `fp:${Math.floor(lat * 100)}:${Math.floor(lon * 100)}`;

function metres(a: [number, number], b: [number, number]) {
  const rad = Math.PI / 180, x = (b[0] - a[0]) * rad * Math.cos(((a[1] + b[1]) / 2) * rad), y = (b[1] - a[1]) * rad;
  return Math.sqrt(x * x + y * y) * 6371008.8;
}

function fresh(list: StationPrices[], now: number): StationPrices[] {
  const cut = now - KEEP_DAYS * 864e5;
  for (const s of list) for (const f of FUELS) if (s.p[f] && s.p[f]!.t < cut) delete s.p[f];
  return list.filter((s) => FUELS.some((f) => s.p[f]));
}

export function validPrice(fuel: string, v: unknown): v is number {
  return (FUELS as readonly string[]).includes(fuel) && typeof v === 'number' && Number.isFinite(v) && v >= 4 && v <= 15;
}

/** Saves a driver's price; the newest report for a fuel at a station wins. */
export async function setPrice(kv: KVNamespace, lon: number, lat: number, prices: Partial<Record<Fuel, number>>, now = Date.now()) {
  // The station may already be stored in a neighbouring cell (it sits near an edge).
  let key = cellOf(lon, lat);
  let list: StationPrices[] = [];
  let st: StationPrices | undefined;
  for (const k of nearCells(lon, lat)) {
    const l = fresh(((await kv.get(k, 'json')) as StationPrices[] | null) ?? [], now);
    const hit = l.find((s) => metres([s.lon, s.lat], [lon, lat]) < 80);
    if (hit) { key = k; list = l; st = hit; break; }
    if (k === key) list = l;
  }
  if (!st) { st = { lon, lat, p: {} }; list.push(st); }
  for (const f of FUELS) { const v = prices[f]; if (v != null) st.p[f] = { v: Math.round(v * 100) / 100, t: now }; }
  await kv.put(key, JSON.stringify(list.slice(-300)), { expirationTtl: KEEP_DAYS * 86400 });
  return st;
}

function nearCells(lon: number, lat: number): string[] {
  const keys = [cellOf(lon, lat)];
  for (const dy of [-0.001, 0, 0.001]) for (const dx of [-0.001, 0, 0.001]) { const k = cellOf(lon + dx, lat + dy); if (!keys.includes(k)) keys.push(k); }
  return keys;
}

/** Prices for each asked point (a station), or null where nobody has reported one. */
export async function pricesAt(kv: KVNamespace, pts: [number, number][], now = Date.now()) {
  const keys = new Set<string>();
  // a station near a cell edge may be stored in the neighbouring cell
  for (const [lon, lat] of pts) for (const k of nearCells(lon, lat)) keys.add(k);
  if (keys.size > 120) return null;
  const all: StationPrices[] = [];
  await Promise.all([...keys].map(async (k) => { all.push(...fresh(((await kv.get(k, 'json')) as StationPrices[] | null) ?? [], now)); }));
  return pts.map((q) => {
    let best: StationPrices | null = null, bd = 80;
    for (const s of all) { const d = metres([s.lon, s.lat], q); if (d < bd) { bd = d; best = s; } }
    return best ? best.p : null;
  });
}

/** The official 95 maximum, only while it is current (it changes monthly). */
export function official(now = Date.now()) {
  const from = Date.parse(OFFICIAL.from + 'T00:00:00+02:00');
  if (!(now >= from && now - from < 40 * 864e5)) return null;
  return { from: OFFICIAL.from, self95: OFFICIAL.self95, full95: Math.round((OFFICIAL.self95 + OFFICIAL.fullExtra) * 100) / 100 };
}
