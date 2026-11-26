/**
 * Driver reports (police, accident, closure…), shared by everyone using HeyNav.
 * Stored in KV by ~10 km grid cell, so a map view reads a handful of keys. Each
 * report fades out on its own; "still there" extends it, two "gone" votes remove it.
 */

export const KINDS = ['police', 'accident', 'closure', 'hazard', 'jam', 'camera'] as const;
export type Kind = (typeof KINDS)[number];
const LIFE_MIN: Record<Kind, number> = { police: 60, accident: 90, closure: 240, hazard: 120, jam: 45, camera: 60 };

export interface Report { id: string; kind: Kind; lon: number; lat: number; h: number | null; t: number; exp: number; up: number; down: number }

export const cellOf = (lon: number, lat: number) => `rc:${Math.floor(lat * 10)}:${Math.floor(lon * 10)}`;

function metres(a: [number, number], b: [number, number]) {
  const rad = Math.PI / 180, x = (b[0] - a[0]) * rad * Math.cos(((a[1] + b[1]) / 2) * rad), y = (b[1] - a[1]) * rad;
  return Math.sqrt(x * x + y * y) * 6371008.8;
}

async function readCell(kv: KVNamespace, key: string, now: number): Promise<Report[]> {
  const list = ((await kv.get(key, 'json')) as Report[] | null) ?? [];
  return list.filter((r) => r.exp > now);
}
const writeCell = (kv: KVNamespace, key: string, list: Report[]) =>
  list.length ? kv.put(key, JSON.stringify(list.slice(-200)), { expirationTtl: 6 * 3600 }) : kv.delete(key);

export async function addReport(kv: KVNamespace, kind: Kind, lon: number, lat: number, h: number | null, now = Date.now()) {
  const key = cellOf(lon, lat);
  const list = await readCell(kv, key, now);
  // Someone already reported the same thing here: count it as a confirmation instead.
  const same = list.find((r) => r.kind === kind && metres([r.lon, r.lat], [lon, lat]) < 150);
  if (same) {
    same.up++;
    same.exp = Math.min(now + LIFE_MIN[kind] * 2 * 60e3, Math.max(same.exp, now + LIFE_MIN[kind] * 60e3));
    await writeCell(kv, key, list);
    return same;
  }
  const b = new Uint8Array(6);
  crypto.getRandomValues(b);
  const r: Report = {
    id: [...b].map((x) => x.toString(16).padStart(2, '0')).join(''), kind,
    lon: Math.round(lon * 1e5) / 1e5, lat: Math.round(lat * 1e5) / 1e5, h: h == null ? null : Math.round(h) % 360,
    t: now, exp: now + LIFE_MIN[kind] * 60e3, up: 1, down: 0,
  };
  list.push(r);
  await writeCell(kv, key, list);
  return r;
}

export async function vote(kv: KVNamespace, id: string, lon: number, lat: number, up: boolean, now = Date.now()) {
  const key = cellOf(lon, lat);
  const list = await readCell(kv, key, now);
  const r = list.find((x) => x.id === id);
  if (!r) return null;
  if (up) { r.up++; r.exp = Math.min(now + LIFE_MIN[r.kind] * 2 * 60e3, r.exp + 30 * 60e3); }
  else r.down++;
  const keep = list.filter((x) => !(x.down >= 2 && x.down > x.up));
  await writeCell(kv, key, keep);
  return keep.includes(r) ? r : { ...r, removed: true };
}

/** All live reports in a bounding box (limited to a sensible area). */
export async function listReports(kv: KVNamespace, w: number, s: number, e: number, n: number, now = Date.now()) {
  const keys: string[] = [];
  for (let la = Math.floor(s * 10); la <= Math.floor(n * 10); la++)
    for (let lo = Math.floor(w * 10); lo <= Math.floor(e * 10); lo++) keys.push(`rc:${la}:${lo}`);
  if (keys.length > 64) return null;
  const lists = await Promise.all(keys.map((k) => readCell(kv, k, now)));
  return lists.flat().filter((r) => r.lon >= w && r.lon <= e && r.lat >= s && r.lat <= n);
}
