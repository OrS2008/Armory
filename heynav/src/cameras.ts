/**
 * Speed and red-light cameras, from a public Google My Maps layer (built from the
 * "מיצו בדרכים" database). The Worker reads its KML export, keeps a parsed copy
 * in the edge cache for a few hours, and serves a compact list to the app.
 */

export const CAMERA_MAP_ID = '1bspXgBYQ2GWj_6rDdGrJhG81RQConHHm';
const KML_URL = `https://www.google.com/maps/d/kml?mid=${CAMERA_MAP_ID}&forcekml=1`;
const TTL = 6 * 3600;

export type CamKind = 'speed' | 'redlight' | 'average' | 'rail' | 'bus' | 'security' | 'dummy' | 'other';
export interface Camera {
  id: number;
  lon: number;
  lat: number;
  h: number[];          // directions of travel it enforces (degrees); empty = any
  limit: number | null; // km/h
  kind: CamKind;
  active: boolean;
  alert: boolean;       // worth warning the driver about
  desc: string;
}

const KIND: [RegExp, CamKind][] = [
  [/ממוצעת/, 'average'],
  [/אור אדום|רמזור/, 'redlight'],
  [/רכבת/, 'rail'],
  [/תחבורה ציבורית/, 'bus'],
  [/ביטחון/, 'security'],
  [/דחליל/, 'dummy'],
  [/מהירות/, 'speed'],
];
const ALERT: CamKind[] = ['speed', 'redlight', 'average', 'rail'];

function unxml(s: string): string {
  return s
    .replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/, '$1')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&')
    .trim();
}

/** KML text → cameras. Tolerant: placemarks without a usable position are skipped. */
export function parseCameras(kml: string): Camera[] {
  const out: Camera[] = [];
  for (const m of kml.matchAll(/<Placemark>([\s\S]*?)<\/Placemark>/g)) {
    const body = m[1]!;
    const data: Record<string, string> = {};
    for (const d of body.matchAll(/<Data name="([^"]+)">\s*<value>([\s\S]*?)<\/value>\s*<\/Data>/g)) data[d[1]!] = unxml(d[2]!);
    let lat = Number(data.latitude), lon = Number(data.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      const c = /<coordinates>\s*(-?[\d.]+),(-?[\d.]+)/.exec(body);
      if (!c) continue;
      lon = Number(c[1]); lat = Number(c[2]);
    }
    if (!(Math.abs(lat) <= 90 && Math.abs(lon) <= 180)) continue;
    const type = data.camera_type ?? unxml(/<name>([\s\S]*?)<\/name>/.exec(body)?.[1] ?? '');
    const kind = KIND.find(([re]) => re.test(type))?.[1] ?? 'other';
    const h = [data.heading, data.secondary_heading].map((x) => Number(x)).filter((x) => Number.isFinite(x) && x >= 0 && x <= 360);
    const limit = Number(data.speed_limit_kmph);
    const active = !/לא פעילה/.test(data.camera_status ?? '');
    out.push({
      id: Number(data.id) || out.length + 1,
      lon: Math.round(lon * 1e6) / 1e6,
      lat: Math.round(lat * 1e6) / 1e6,
      h,
      limit: Number.isFinite(limit) && limit > 0 ? limit : null,
      kind,
      active,
      alert: active && ALERT.includes(kind),
      desc: (data.description ?? '').slice(0, 160),
    });
  }
  return out;
}

export async function getCameras(ctx: ExecutionContext, base?: string): Promise<{ cameras: Camera[]; updated: string }> {
  const cache = (globalThis as { caches?: { default?: Cache } }).caches?.default;
  const key = new Request('https://cache.heynav/cameras/v1');
  const hit = cache ? await cache.match(key) : undefined;
  if (hit) return hit.json();
  const r = await fetch(base ?? KML_URL, { headers: { accept: 'application/vnd.google-earth.kml+xml, text/xml' } });
  if (!r.ok) throw new Error(`camera map ${r.status}`);
  const cameras = parseCameras(await r.text());
  if (!cameras.length) throw new Error('camera map empty');
  const body = { cameras, updated: new Date().toISOString() };
  if (cache) ctx.waitUntil(cache.put(key, new Response(JSON.stringify(body), { headers: { 'cache-control': `max-age=${TTL}` } })));
  return body;
}
