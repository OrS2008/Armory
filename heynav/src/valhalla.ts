/**
 * Routing through Valhalla (public FOSSGIS server), used when the driver asks to
 * avoid toll roads or Area A. Produces the same route model as OSRM routes, so
 * the guidance engine, tests and screen don't care which router answered.
 */
import { AREA_A } from './areas.gen';
import type { Lang } from './i18n';
import type { Route, Step } from './guidance';

type LonLat = [number, number];
const VALHALLA = 'https://valhalla1.openstreetmap.de/route';

/** Valhalla's encoded polyline (precision 6) → [lon, lat] points. */
export function decode6(s: string): LonLat[] {
  const out: LonLat[] = [];
  let i = 0, lat = 0, lon = 0;
  while (i < s.length) {
    for (let k = 0; k < 2; k++) {
      let r = 0, sh = 0, b: number;
      do { b = s.charCodeAt(i++) - 63; r |= (b & 31) << sh; sh += 5; } while (b >= 32);
      const v = r & 1 ? ~(r >> 1) : r >> 1;
      if (k === 0) lat += v; else lon += v;
    }
    out.push([lon / 1e6, lat / 1e6]);
  }
  return out;
}

/** Ray-casting point-in-polygon. */
export function inRing(p: LonLat, ring: LonLat[]): boolean {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x1, y1] = ring[i]!, [x2, y2] = ring[j]!;
    if (y1 > p[1] !== y2 > p[1] && p[0] < ((x2 - x1) * (p[1] - y1)) / (y2 - y1) + x1) c = !c;
  }
  return c;
}

const BOXES = AREA_A.map((a) => {
  let w = 180, s = 90, e = -180, n = -90;
  for (const [x, y] of a.ring) { w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y); }
  return { ...a, w, s, e, n };
});

/** First point of the line inside an Area A outline (with that area's name), or null. */
export function firstInArea(line: LonLat[], skipNear?: LonLat[]): { at: LonLat; index: number; name: string } | null {
  for (let i = 0; i < line.length; i++) {
    const p = line[i]!;
    for (const b of BOXES) {
      if (p[0] < b.w || p[0] > b.e || p[1] < b.s || p[1] > b.n) continue;
      if (!inRing(p, b.ring)) continue;
      // The trip starts or ends inside an area: that part can't be avoided, so don't count it.
      if (skipNear?.some((q) => Math.abs(q[0] - p[0]) < 0.03 && Math.abs(q[1] - p[1]) < 0.03)) continue;
      return { at: p, index: i, name: b.name };
    }
  }
  return null;
}

export function areasOnRoute(line: LonLat[], ends: LonLat[] = []): string[] {
  const names = new Set<string>();
  for (let i = 0; i < line.length; i += 2) {
    const p = line[i]!;
    for (const b of BOXES) {
      if (p[0] < b.w || p[0] > b.e || p[1] < b.s || p[1] > b.n) continue;
      if (ends.some((q) => Math.abs(q[0] - p[0]) < 0.03 && Math.abs(q[1] - p[1]) < 0.03)) continue;
      if (inRing(p, b.ring)) names.add(b.name);
    }
  }
  return [...names];
}

interface VManeuver {
  type: number; instruction: string; street_names?: string[]; begin_shape_index: number; end_shape_index: number;
  length: number; time: number; roundabout_exit_count?: number; verbal_pre_transition_instruction?: string;
}
interface VTrip { summary: { length: number; time: number; has_toll?: boolean }; legs: { shape: string; maneuvers: VManeuver[] }[] }

// Valhalla manoeuvre types → our arrow icons and whether to announce them.
const ICON: Record<number, string> = {
  1: 'straight', 2: 'slight-right', 3: 'slight-left', 4: 'arrive', 5: 'arrive', 6: 'arrive', 7: 'straight', 8: 'straight',
  9: 'slight-right', 10: 'right', 11: 'sharp-right', 12: 'uturn', 13: 'uturn', 14: 'sharp-left', 15: 'left', 16: 'slight-left',
  17: 'straight', 18: 'slight-right', 19: 'slight-left', 20: 'slight-right', 21: 'slight-left', 22: 'straight', 23: 'fork-right',
  24: 'fork-left', 25: 'straight', 26: 'roundabout', 27: 'straight', 37: 'slight-right', 38: 'slight-left',
};
const SILENT = new Set([7, 8, 22, 27]); // "becomes", "continue", "stay straight", "exit roundabout"

export function buildValhallaRoute(trip: VTrip, lang: Lang): Route {
  const leg = trip.legs[0]!;
  const geometry = decode6(leg.shape);
  const cum = [0];
  for (let i = 1; i < geometry.length; i++) {
    const a = geometry[i - 1]!, b = geometry[i]!, rad = Math.PI / 180;
    const x = (b[0] - a[0]) * rad * Math.cos(((a[1] + b[1]) / 2) * rad), y = (b[1] - a[1]) * rad;
    cum.push(cum[i - 1]! + Math.sqrt(x * x + y * y) * 6371008.8);
  }
  const steps: Step[] = leg.maneuvers.map((m) => {
    const start = cum[m.begin_shape_index] ?? 0;
    const end = cum[m.end_shape_index] ?? start;
    const arrive = m.type >= 4 && m.type <= 6;
    let icon = ICON[m.type] ?? 'straight';
    if (m.type === 26 && m.roundabout_exit_count) icon = `roundabout-${Math.min(4, m.roundabout_exit_count)}`;
    const text = (m.verbal_pre_transition_instruction || m.instruction || '').replace(/\.\s*$/, '').trim();
    return {
      type: arrive ? 'arrive' : m.type === 1 || m.type === 2 || m.type === 3 ? 'depart' : 'turn',
      name: m.street_names?.[0] ?? '', distance: end - start, duration: m.time, start,
      text: text || (lang === 'he' ? 'המשך' : 'Continue'), speak: !SILENT.has(m.type), icon,
    };
  });
  return { geometry, steps, distance: cum[cum.length - 1] ?? 0, duration: trip.summary.time };
}

export interface AvoidOptions { tolls: boolean; areas: boolean }

async function call(base: string, ua: string, from: LonLat, to: LonLat, lang: Lang, o: AvoidOptions, exclude: LonLat[], bearing: number | null) {
  const body = {
    locations: [
      { lon: from[0], lat: from[1], ...(bearing != null ? { heading: Math.round(bearing) % 360, heading_tolerance: 60 } : {}) },
      { lon: to[0], lat: to[1] },
    ],
    costing: 'auto',
    costing_options: { auto: { use_tolls: o.tolls ? 0 : 0.5 } },
    exclude_locations: exclude.map(([lon, lat]) => ({ lon, lat })),
    alternates: 2,
    language: lang === 'he' ? 'he-IL' : 'en-US',
    directions_options: { units: 'kilometers' },
  };
  const r = await fetch(base, { method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': ua }, body: JSON.stringify(body) });
  const d = (await r.json().catch(() => null)) as { trip?: VTrip; alternates?: { trip: VTrip }[]; error?: string } | null;
  if (!r.ok || !d?.trip) return null;
  return [d.trip, ...(d.alternates ?? []).map((a) => a.trip)];
}

/**
 * Routes with the driver's avoid options. For Area A: route, find where the route
 * first enters an area, block that road, and route again (a few rounds). Whatever
 * still crosses an area is reported so the screen can warn.
 */
export async function valhallaRoutes(from: LonLat, to: LonLat, lang: Lang, o: AvoidOptions, ua: string, bearing: number | null, base = VALHALLA) {
  const ends: LonLat[] = [from, to];
  const exclude: LonLat[] = [];
  let trips = await call(base, ua, from, to, lang, o, exclude, bearing);
  if (!trips) return null;
  if (o.areas) {
    for (let round = 0; round < 6; round++) {
      const lines = trips.map((t) => decode6(t.legs[0]!.shape));
      if (lines.some((l) => !firstInArea(l, ends))) break;          // at least one clean route: done
      const hit = firstInArea(lines[0]!, ends);
      if (!hit) break;
      // Block the road a little way inside the boundary, where the route goes in.
      const i = Math.min(lines[0]!.length - 1, hit.index + 2);
      exclude.push(lines[0]![i]!);
      const next = await call(base, ua, from, to, lang, o, exclude, bearing);
      if (!next) break;
      trips = next;
    }
  }
  const routes = trips.map((t) => {
    const r = buildValhallaRoute(t, lang);
    return { ...r, tolls: !!t.summary.has_toll, areas: o.areas ? areasOnRoute(r.geometry, ends) : [] };
  });
  // When avoiding areas, offer only routes that stay out, if there are any.
  if (o.areas && routes.some((r) => !r.areas.length)) return routes.filter((r) => !r.areas.length);
  return routes;
}
