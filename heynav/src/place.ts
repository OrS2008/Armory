/**
 * Details for a place tapped on the map (restaurant, hotel, mall…): TomTom's POI
 * search near the point, plus POI details (rating, price level, photos) when TomTom
 * has them. The key stays here; photos are proxied through /api/place/photo.
 */
import type { Lang } from './i18n';

type LonLat = [number, number];
const API = 'https://api.tomtom.com';

export interface PlaceInfo {
  name: string; lon: number; lat: number;
  address?: string; phone?: string; url?: string; category?: string;
  hours?: { open: boolean; until?: string; opens?: string } | null;
  rating?: number; ratings?: number; price?: number; photos: string[];
}

interface TTTime { date: string; hour: number; minute: number }
interface TTPoi {
  id: string; position: { lat: number; lon: number }; dist?: number;
  poi?: { name?: string; phone?: string; url?: string; categories?: string[]; openingHours?: { timeRanges?: { startTime: TTTime; endTime: TTTime }[] } };
  address?: { freeformAddress?: string; streetName?: string; streetNumber?: string; municipality?: string };
  dataSources?: { poiDetails?: { id: string }[] };
}

function metres(a: LonLat, b: LonLat) {
  const rad = Math.PI / 180, x = (b[0] - a[0]) * rad * Math.cos(((a[1] + b[1]) / 2) * rad), y = (b[1] - a[1]) * rad;
  return Math.sqrt(x * x + y * y) * 6371008.8;
}
const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
const hhmm = (t: TTTime) => `${String(t.hour).padStart(2, '0')}:${String(t.minute).padStart(2, '0')}`;

/** Open now? Times are local (Israel); `now` is given as local date/time parts. */
export function openState(ranges: { startTime: TTTime; endTime: TTTime }[] | undefined, now: { date: string; hm: number }) {
  if (!ranges?.length) return null;
  const key = (t: TTTime) => `${t.date} ${String(t.hour * 60 + t.minute).padStart(4, '0')}`;
  const cur = `${now.date} ${String(now.hm).padStart(4, '0')}`;
  for (const r of ranges) if (key(r.startTime) <= cur && cur < key(r.endTime)) return { open: true, until: hhmm(r.endTime) };
  const next = ranges.map((r) => r.startTime).filter((t) => key(t) > cur).sort((a, b) => (key(a) < key(b) ? -1 : 1))[0];
  return { open: false, opens: next && next.date === now.date ? hhmm(next) : undefined };
}

function israelNow(d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(d).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hm: Number(p.hour) * 60 + Number(p.minute) };
}

/** Picks the search result that is this place: close by, and the name matches if we have one. */
export function pickPoi(results: TTPoi[], at: LonLat, name: string): TTPoi | null {
  const n = norm(name);
  let best: TTPoi | null = null, score = Infinity;
  for (const r of results) {
    const d = metres(at, [r.position.lon, r.position.lat]);
    if (d > 150) continue;
    const rn = norm(r.poi?.name ?? '');
    const same = n && rn && (rn.includes(n) || n.includes(rn));
    const s = d - (same ? 1000 : 0);
    if ((n ? same : true) && s < score) { score = s; best = r; }
  }
  return best;
}

export async function placeInfo(key: string, at: LonLat, name: string, lang: Lang, base = API): Promise<PlaceInfo | null> {
  const q = name.trim() || 'restaurant';
  // TomTom answers in one language; a place tapped by its English name may come back in
  // Hebrew (and the other way round), so if the name doesn't match, ask in the other one.
  const langs = lang === 'he' ? ['he-IL', 'en-GB'] : ['en-GB', 'he-IL'];
  let hit: TTPoi | null = null;
  for (const l of langs) {
    const u = new URL(`${base}/search/2/poiSearch/${encodeURIComponent(q)}.json`);
    u.searchParams.set('key', key);
    u.searchParams.set('lat', String(at[1]));
    u.searchParams.set('lon', String(at[0]));
    u.searchParams.set('radius', '200');
    u.searchParams.set('limit', '8');
    u.searchParams.set('openingHours', 'nextSevenDays');
    u.searchParams.set('language', l);
    const r = await fetch(u, { signal: AbortSignal.timeout(10000) });
    if (!r.ok) throw new Error(`poiSearch ${r.status}`);
    hit = pickPoi(((await r.json()) as { results?: TTPoi[] }).results ?? [], at, name);
    if (hit) break;
  }
  if (!hit) return null;
  const p = hit.poi ?? {};
  const a = hit.address ?? {};
  const info: PlaceInfo = {
    name: p.name || name, lon: hit.position.lon, lat: hit.position.lat,
    address: a.freeformAddress || [a.streetName, a.streetNumber, a.municipality].filter(Boolean).join(' ') || undefined,
    phone: p.phone, url: p.url ? (/^https?:\/\//.test(p.url) ? p.url : `http://${p.url}`) : undefined,
    category: p.categories?.[0], hours: openState(p.openingHours?.timeRanges, israelNow()), photos: [],
  };
  const did = hit.dataSources?.poiDetails?.[0]?.id;
  if (did) {
    const du = new URL(`${base}/search/2/poiDetails.json`);
    du.searchParams.set('key', key);
    du.searchParams.set('id', did);
    const dr = await fetch(du, { signal: AbortSignal.timeout(8000) }).catch(() => null);
    if (dr?.ok) {
      const d = (await dr.json().catch(() => null)) as { result?: { description?: string; rating?: { totalRatings?: number; value?: number }; priceRange?: { value?: number }; photos?: { id: string }[] } } | null;
      const x = d?.result;
      if (x?.rating?.value != null) { info.rating = x.rating.value; info.ratings = x.rating.totalRatings; }
      if (x?.priceRange?.value != null) info.price = x.priceRange.value;
      info.photos = (x?.photos ?? []).slice(0, 4).map((ph) => ph.id).filter((id) => /^[\w-]{6,80}$/.test(id));
    }
  }
  return info;
}

export async function placePhoto(key: string, id: string, base = API): Promise<Response> {
  const u = `${base}/search/2/poiPhoto?key=${encodeURIComponent(key)}&id=${encodeURIComponent(id)}&width=720&height=400`;
  const r = await fetch(u, { signal: AbortSignal.timeout(10000) });
  const type = r.headers.get('content-type') ?? '';
  if (!r.ok || !type.startsWith('image/')) return new Response(null, { status: 404 });
  return new Response(r.body, { headers: { 'content-type': type, 'cache-control': 'public, max-age=604800' } });
}
