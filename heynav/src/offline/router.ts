/**
 * Offline router: A* over the road graph built by scripts/offline/build_offline.py.
 * Produces OSRM-shaped steps and runs them through the same guidance code as online
 * routes (guidance.buildRoute), so directions, voice, cameras and lanes don't care
 * whether the route came from the internet or from the phone.
 */
import { buildRoute, type OsrmRoute, type OsrmStep } from '../guidance';
import type { Lang } from '../i18n';

type LonLat = [number, number];
const R = 6371008.8, RAD = Math.PI / 180;

export interface Graph {
  n: number; e: number;
  lon: Int32Array; lat: Int32Array; first: Uint32Array;
  to: Uint32Array; len: Uint32Array; time: Uint32Array; way: Uint32Array; geo: Uint32Array; geon: Uint16Array; flags: Uint8Array;
  glon: Int32Array; glat: Int32Array;
  ways: [string, string, string, string, number][]; // [name:he, name:en, name, ref, class]
  grid: Map<number, number[]>;
}
const F_REV = 1, F_TOLL = 2, F_AREA = 4, F_ROUND = 8;
const CLASSES = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential',
  'motorway_link', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link', 'living_street', 'service', 'road'];
const isLink = (c: number) => c >= 7 && c <= 11;
const isBig = (c: number) => c <= 1;
const CELL = 0.005;
const cellKey = (lon: number, lat: number) => Math.floor(lat / CELL) * 100000 + Math.floor(lon / CELL);

/** Reads graph.bin (see the build script for the layout). */
export function loadGraph(buf: ArrayBuffer): Graph {
  const dv = new DataView(buf);
  if (String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3)) !== 'HNG1') throw new Error('bad graph');
  const n = dv.getUint32(4, true), e = dv.getUint32(8, true), g = dv.getUint32(12, true), wl = dv.getUint32(16, true);
  let o = 20;
  const take = <T>(C: new (b: ArrayBuffer, o: number, l: number) => T, count: number, size: number): T => { const a = new C(buf, o, count); o += count * size; o = (o + 3) & ~3; return a; };
  const lon = take(Int32Array, n, 4), lat = take(Int32Array, n, 4), first = take(Uint32Array, n + 1, 4);
  const to = take(Uint32Array, e, 4), len = take(Uint32Array, e, 4), time = take(Uint32Array, e, 4), way = take(Uint32Array, e, 4), geo = take(Uint32Array, e, 4);
  const geon = take(Uint16Array, e, 2), flags = take(Uint8Array, e, 1);
  const glon = take(Int32Array, g, 4), glat = take(Int32Array, g, 4);
  const ways = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, o, wl)));
  return { n, e, lon, lat, first, to, len, time, way, geo, geon, flags, glon, glat, ways, grid: new Map() };
}

/** Lazily indexes the edges of one grid cell's neighbourhood (cheap: only where the driver is). */
function indexAround(G: Graph, lon: number, lat: number) {
  // Build the whole index once; ~1.4M edges take well under a second.
  if (G.grid.size) return;
  for (let e = 0; e < G.e; e++) {
    if (G.flags[e]! & F_REV) continue; // one direction of each road is enough for snapping
    const s = G.geo[e]!, k = G.geon[e]!;
    let last = -1;
    for (let j = 0; j < k; j++) {
      const c = cellKey(G.glon[s + j]! / 1e6, G.glat[s + j]! / 1e6);
      if (c === last) continue;
      last = c;
      let l = G.grid.get(c);
      if (!l) G.grid.set(c, (l = []));
      if (l[l.length - 1] !== e) l.push(e);
    }
  }
  void lon; void lat;
}

const pt = (G: Graph, i: number): LonLat => [G.glon[i]! / 1e6, G.glat[i]! / 1e6];
function dist(a: LonLat, b: LonLat) {
  const x = (b[0] - a[0]) * RAD * Math.cos(((a[1] + b[1]) / 2) * RAD), y = (b[1] - a[1]) * RAD;
  return Math.sqrt(x * x + y * y) * R;
}
function bearing(a: LonLat, b: LonLat) {
  const f1 = a[1] * RAD, f2 = b[1] * RAD, dl = (b[0] - a[0]) * RAD;
  return (Math.atan2(Math.sin(dl) * Math.cos(f2), Math.cos(f1) * Math.sin(f2) - Math.sin(f1) * Math.cos(f2) * Math.cos(dl)) / RAD + 360) % 360;
}

/** Edge geometry in travel direction. */
function edgeLine(G: Graph, e: number): LonLat[] {
  const s = G.geo[e]!, k = G.geon[e]!, out: LonLat[] = [];
  for (let j = 0; j < k; j++) out.push(pt(G, s + j));
  if (G.flags[e]! & F_REV) out.reverse();
  return out;
}

interface Snap { e: number; frac: number; point: LonLat; d: number }

/** Nearest drivable roads to a point, best first (service roads count as a little further away). */
export function snapAll(G: Graph, p: LonLat, maxM = 1500, count = 6): Snap[] {
  indexAround(G, p[0], p[1]);
  const found = new Map<number, Snap>();
  const kx = Math.cos(p[1] * RAD) * RAD * R, ky = RAD * R;
  for (let ring = 0; ring <= 8; ring++) {
    for (let dy = -ring; dy <= ring; dy++) for (let dx = -ring; dx <= ring; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
      const list = G.grid.get(cellKey(p[0] + dx * CELL, p[1] + dy * CELL));
      if (!list) continue;
      for (const e of list) {
        if (found.has(e)) continue;
        const line = edgeLine(G, e);
        let acc = 0, total = 0, best: Snap | null = null;
        for (let j = 1; j < line.length; j++) total += dist(line[j - 1]!, line[j]!);
        for (let j = 1; j < line.length; j++) {
          const a = line[j - 1]!, b = line[j]!;
          const ax = (a[0] - p[0]) * kx, ay = (a[1] - p[1]) * ky, bx = (b[0] - p[0]) * kx, by = (b[1] - p[1]) * ky;
          const vx = bx - ax, vy = by - ay, L2 = vx * vx + vy * vy;
          const t = L2 > 0 ? Math.max(0, Math.min(1, -(ax * vx + ay * vy) / L2)) : 0;
          const x = ax + vx * t, y = ay + vy * t, d = Math.sqrt(x * x + y * y);
          const seg = Math.sqrt(L2);
          if (!best || d < best.d) best = { e, frac: total > 0 ? (acc + seg * t) / total : 0, point: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], d };
          acc += seg;
        }
        if (best) { const cls = G.ways[G.way[e]!]![4]; best.d = best.d * (cls >= 13 ? 2.5 : 1) + (cls >= 13 ? 15 : 0); found.set(e, best); }
      }
    }
    if (found.size >= count * 2 && ring >= 1) break;
  }
  return [...found.values()].filter((x) => x.d <= maxM).sort((a, b) => a.d - b.d).slice(0, count);
}
export const snap = (G: Graph, p: LonLat) => snapAll(G, p, 1500, 1)[0] ?? null;

/** The reverse direction of an edge, if the road can be driven that way. */
function reverseOf(G: Graph, e: number): number {
  const v = G.to[e]!;
  for (let k = G.first[v]!; k < G.first[v + 1]!; k++) if (G.geo[k] === G.geo[e] && k !== e) return k;
  return -1;
}

class Heap {
  ids: number[] = []; keys: number[] = [];
  get size() { return this.ids.length; }
  push(id: number, key: number) {
    const a = this.ids, k = this.keys; let i = a.length; a.push(id); k.push(key);
    while (i > 0) { const p = (i - 1) >> 1; if (k[p]! <= key) break; a[i] = a[p]!; k[i] = k[p]!; i = p; }
    a[i] = id; k[i] = key;
  }
  pop(): number {
    const a = this.ids, k = this.keys, top = a[0]!, lid = a.pop()!, lk = k.pop()!;
    if (a.length) {
      let i = 0; const n = a.length;
      for (;;) { let c = 2 * i + 1; if (c >= n) break; if (c + 1 < n && k[c + 1]! < k[c]!) c++; if (k[c]! >= lk) break; a[i] = a[c]!; k[i] = k[c]!; i = c; }
      a[i] = lid; k[i] = lk;
    }
    return top;
  }
}

export interface Avoid { tolls?: boolean; areas?: boolean }

interface Leg { edges: number[]; startSnap: Snap; startEdge: number; endSnap: Snap; endEdge: number; time: number }

/** Fastest path between two snapped points (A* on travel time). */
function leg(G: Graph, a: Snap, b: Snap, avoid: Avoid, inAreaEnds: boolean): Leg | null {
  const n = G.n;
  const g = new Float64Array(n).fill(Infinity);
  const via = new Int32Array(n).fill(-1);
  const done = new Uint8Array(n);
  const heap = new Heap();
  const target: LonLat = b.point;
  const VMAX = 130 / 3.6;
  const h = (v: number) => dist([G.lon[v]! / 1e6, G.lat[v]! / 1e6], target) / VMAX;
  const blocked = (e: number) => (avoid.tolls && G.flags[e]! & F_TOLL) || (avoid.areas && !inAreaEnds && G.flags[e]! & F_AREA);
  // start: drive on from the snapped point either way the road allows
  const starts: [number, number, number][] = []; // [node, cost, edge]
  const ea = a.e, ra = reverseOf(G, ea);
  starts.push([G.to[ea]!, (G.time[ea]! / 10) * (1 - a.frac), ea]);
  if (ra >= 0) starts.push([G.to[ra]!, (G.time[ra]! / 10) * a.frac, ra]);
  for (const [v, c, e] of starts) if (c < g[v]!) { g[v] = c; via[v] = -2 - e; heap.push(v, c + h(v)); }
  // finish: reach the snapped point from either end of its road
  const eb = b.e, rb = reverseOf(G, eb);
  const ends = new Map<number, [number, number]>(); // node -> [extra cost, final edge]
  // edge eb runs u→v: arriving at u, drive frac of it; rb runs v→u: arriving at v, drive (1-frac)
  ends.set(startNodeSlow(G, eb), [(G.time[eb]! / 10) * b.frac, eb]);
  if (rb >= 0) ends.set(G.to[eb]!, [(G.time[rb]! / 10) * (1 - b.frac), rb]);
  let best = Infinity, bestNode = -1;
  // same road, ahead of us: no graph search needed
  if (ea === eb && b.frac >= a.frac) { best = (G.time[ea]! / 10) * (b.frac - a.frac); bestNode = -3; }
  if (ra >= 0 && ra === rb && b.frac <= a.frac) { best = (G.time[ea]! / 10) * (a.frac - b.frac); bestNode = -4; }
  let it = 0;
  while (heap.size) {
    const v = heap.pop();
    if (done[v]) continue;
    done[v] = 1;
    if (g[v]! + h(v) >= best) break;
    const fin = ends.get(v);
    if (fin && g[v]! + fin[0] < best) { best = g[v]! + fin[0]; bestNode = v; }
    if (++it > 3_000_000) break;
    for (let e = G.first[v]!; e < G.first[v + 1]!; e++) {
      if (blocked(e)) continue;
      const w = G.to[e]!;
      const c = g[v]! + G.time[e]! / 10;
      if (c < g[w]!) { g[w] = c; via[w] = e; heap.push(w, c + h(w)); }
    }
  }
  if (bestNode === -1) return null;
  if (bestNode === -3) return { edges: [ea], startSnap: a, startEdge: ea, endSnap: b, endEdge: ea, time: best };
  if (bestNode === -4) return { edges: [ra], startSnap: a, startEdge: ra, endSnap: b, endEdge: ra, time: best };
  const edges: number[] = [];
  let v = bestNode;
  for (;;) {
    const e = via[v]!;
    if (e <= -2) { edges.push(-2 - e); break; }
    edges.push(e);
    v = startNodeSlow(G, e);
  }
  edges.reverse();
  const endEdge = ends.get(bestNode)![1];
  edges.push(endEdge);
  return { edges, startSnap: a, startEdge: edges[0]!, endSnap: b, endEdge, time: best };
}

/** Start node of an edge: edges are stored grouped by start node (CSR), so binary-search the offsets. */
const startCache = new Map<number, number>();
function startNodeSlow(G: Graph, e: number): number {
  const c = startCache.get(e);
  if (c != null) return c;
  // binary search the CSR: edge e belongs to node u where first[u] <= e < first[u+1]
  let lo = 0, hi = G.n;
  while (lo < hi) { const m = (lo + hi) >> 1; if (G.first[m + 1]! <= e) lo = m + 1; else hi = m; }
  startCache.set(e, lo);
  return lo;
}

// ---------------------------------------------------------------- steps
const FOREIGN = /[Ͱ-ϿЀ-ӿ԰-֏؀-ۿႠ-ჿ]/;
function roadName(G: Graph, e: number, lang: Lang): { name: string; ref: string; cls: number } {
  const [nh, ne, nl, ref, cls] = G.ways[G.way[e]!]!;
  let name = lang === 'he' ? nh || (nl && !FOREIGN.test(nl) ? nl : ne || nl) : ne || nl;
  if (/^\d+$/.test(name || '')) name = ''; // internal roads named by a bare number
  return { name: name || '', ref: ref || '', cls };
}

function modifierOf(turn: number): string {
  const a = Math.abs(turn);
  const side = turn > 0 ? 'right' : 'left';
  if (a < 25) return 'straight';
  if (a < 60) return 'slight ' + side;
  if (a < 140) return side;
  if (a < 170) return 'sharp ' + side;
  return 'uturn';
}
const norm180 = (a: number) => ((a + 540) % 360) - 180;

/** Turns a list of edges into OSRM-like steps. */
function steps(G: Graph, L: Leg, lang: Lang, last: boolean): OsrmStep[] {
  const lines = L.edges.map((e) => edgeLine(G, e));
  // trim the first and last edge to the snapped points
  const cut = (line: LonLat[], from: number, to: number) => {
    const cum = [0];
    for (let j = 1; j < line.length; j++) cum.push(cum[j - 1]! + dist(line[j - 1]!, line[j]!));
    const T = cum[cum.length - 1]!, a = from * T, b = to * T, out: LonLat[] = [];
    const at = (d: number): LonLat => { for (let j = 1; j < line.length; j++) if (cum[j]! >= d) { const t = (d - cum[j - 1]!) / Math.max(1e-9, cum[j]! - cum[j - 1]!); return [line[j - 1]![0] + (line[j]![0] - line[j - 1]![0]) * t, line[j - 1]![1] + (line[j]![1] - line[j - 1]![1]) * t]; } return line[line.length - 1]!; };
    out.push(at(a));
    for (let j = 1; j < line.length - 1; j++) if (cum[j]! > a && cum[j]! < b) out.push(line[j]!);
    out.push(at(b));
    return out;
  };
  const rev = (e: number) => (G.flags[e]! & F_REV) !== 0;
  const fracOn = (s: Snap, e: number) => (e === s.e ? s.frac : 1 - s.frac);
  const fracDir = (s: Snap, e: number) => (rev(e) === rev(s.e) ? s.frac : 1 - s.frac);
  void fracOn;
  if (lines.length === 1) lines[0] = cut(lines[0]!, fracDir(L.startSnap, L.edges[0]!), fracDir(L.endSnap, L.edges[0]!));
  else {
    lines[0] = cut(lines[0]!, fracDir(L.startSnap, L.edges[0]!), 1);
    lines[lines.length - 1] = cut(lines[lines.length - 1]!, 0, fracDir(L.endSnap, L.edges[lines.length - 1]!));
  }
  const len = (l: LonLat[]) => { let s = 0; for (let j = 1; j < l.length; j++) s += dist(l[j - 1]!, l[j]!); return s; };
  const time = (e: number, l: LonLat[]) => { const full = G.len[e]! / 10; return full > 0 ? (G.time[e]! / 10) * (len(l) / full) : 0; };

  const out: OsrmStep[] = [];
  const mk = (type: string, modifier: string | undefined, e: number, at: LonLat, extra: Partial<OsrmStep['maneuver']> = {}) => {
    const r = roadName(G, e, lang);
    const step: OsrmStep = { maneuver: { type, modifier, location: at, ...extra }, name: r.name, ref: r.ref, distance: 0, duration: 0, geometry: { coordinates: [at] } };
    out.push(step);
    return step;
  };
  let cur = mk('depart', undefined, L.edges[0]!, lines[0]![0]!);
  let roundExits = 0, inRound = false, roundIn = 0;
  for (let i = 0; i < L.edges.length; i++) {
    const e = L.edges[i]!, line = lines[i]!;
    for (let j = 1; j < line.length; j++) cur.geometry.coordinates.push(line[j]!);
    cur.distance += len(line);
    cur.duration += time(e, line);
    if (i === L.edges.length - 1) break;
    const nx = L.edges[i + 1]!, nline = lines[i + 1]!;
    const node = G.to[e]!;
    const bIn = bearing(line[Math.max(0, line.length - 2)]!, line[line.length - 1]!);
    const bOut = bearing(nline[0]!, nline[Math.min(1, nline.length - 1)]!);
    const turn = norm180(bOut - bIn);
    const here = line[line.length - 1]!;
    // what else could be taken here (not back where we came from)
    const back = reverseOf(G, e);
    const opts: number[] = [];
    for (let k = G.first[node]!; k < G.first[node + 1]!; k++) if (k !== back && G.geo[k] !== G.geo[e]) opts.push(k);
    const r1 = roadName(G, e, lang), r2 = roadName(G, nx, lang);
    const round1 = (G.flags[e]! & F_ROUND) !== 0, round2 = (G.flags[nx]! & F_ROUND) !== 0;
    if (round2 && !round1) { inRound = true; roundExits = 0; roundIn = bIn; cur = mk('roundabout', undefined, nx, here); continue; }
    if (round1 && round2) { if (opts.some((k) => !(G.flags[k]! & F_ROUND))) roundExits++; continue; }
    if (round1 && !round2 && inRound) {
      inRound = false; roundExits++;
      cur.maneuver.exit = roundExits;
      cur.maneuver.modifier = modifierOf(norm180(bOut - roundIn));
      const r = roadName(G, nx, lang); cur.name = r.name; cur.ref = r.ref;
      cur = mk('exit roundabout', undefined, nx, here);
      continue;
    }
    const sameRoad = r1.name === r2.name && r1.ref === r2.ref && isLink(r1.cls) === isLink(r2.cls);
    if (opts.length <= 1 && sameRoad) continue; // just a bend, or a node with no choice
    // carrying on along the same road while a ramp or side road branches off: nothing to say
    if (sameRoad && Math.abs(turn) < 45) continue;
    const mod = modifierOf(turn);
    let type = '';
    if (!isLink(r1.cls) && isLink(r2.cls)) type = isBig(r1.cls) ? 'off ramp' : 'on ramp';
    else if (isLink(r1.cls) && !isLink(r2.cls) && isBig(r2.cls)) type = 'merge';
    else if (!sameRoad && opts.length >= 2 && Math.abs(turn) < 45 && opts.filter((k) => Math.abs(norm180(bearing(here, edgeLine(G, k)[1] ?? here) - bIn)) < 45).length >= 2) type = 'fork';
    else if (Math.abs(turn) >= 25) {
      const straightAhead = opts.some((k) => Math.abs(norm180(bearing(here, edgeLine(G, k)[1] ?? here) - bIn)) < 30);
      type = straightAhead || opts.length === 1 ? 'turn' : 'end of road';
    } else if (!sameRoad) type = 'new name';
    else continue;
    if (type === 'new name' && cur.maneuver.type !== 'depart' && cur.distance < 30) { cur.name = r2.name; cur.ref = r2.ref; continue; }
    cur = mk(type, type === 'new name' ? 'straight' : mod === 'straight' && type === 'fork' ? (turn >= 0 ? 'slight right' : 'slight left') : mod, nx, here);
  }
  const end = lines[lines.length - 1]!;
  const tip = end[end.length - 1]!;
  const arriveStep: OsrmStep = { maneuver: { type: 'arrive', location: tip }, name: cur.name, ref: cur.ref, distance: 0, duration: 0, geometry: { coordinates: [tip] } };
  out.push(arriveStep);
  void last;
  return out;
}

/** A full offline route, as the same model the online API returns. */
export function route(G: Graph, from: LonLat, to: LonLat, lang: Lang, avoid: Avoid = {}, via: LonLat | null = null) {
  const pts = via ? [from, via, to] : [from, to];
  const cands = pts.map((p) => snapAll(G, p));
  if (cands.some((c) => !c.length)) return null;
  const legs: OsrmRoute['legs'] = [];
  let dur = 0, dis = 0;
  let startC = cands[0]!;
  for (let i = 0; i + 1 < cands.length; i++) {
    // An isolated piece of road (car park, gated lane) has no way out: try the next nearest roads.
    let L: Leg | null = null;
    for (const a of startC.slice(0, 3)) {
      for (const b of cands[i + 1]!.slice(0, 4)) {
        L = leg(G, a, b, avoid, false) ?? (avoid.areas ? leg(G, a, b, { ...avoid, areas: false }, true) : null);
        if (L) break;
      }
      if (L) break;
    }
    if (!L) return null;
    startC = [L.endSnap];
    const st = steps(G, L, lang, i + 2 === cands.length);
    legs.push({ steps: st });
    for (const s of st) { dur += s.duration; dis += s.distance; }
  }
  const r = buildRoute({ distance: dis, duration: dur, legs }, lang);
  return { ...r, offline: true, tolls: false, areas: [] as string[] };
}

export const _test = { reverseOf, startNodeSlow, CLASSES };
