/**
 * Offline search over search.json (built by scripts/offline/build_offline.py):
 * cities and neighbourhoods, streets (with their city) and named places.
 * Matches every word of the query as a word prefix, in Hebrew, English or the
 * local name; ranks exact words, important places and nearness first.
 */
import type { Lang } from '../i18n';

type Row = (string | number)[];
export interface Index { places: Row[]; streets: Row[]; pois: Row[]; keys: { kind: 0 | 1 | 2; i: number; words: string[] }[] }
export interface Hit { name: string; detail: string; lon: number; lat: number }

const FINAL: Record<string, string> = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };
export function normalize(s: string): string {
  return s.toLowerCase()
    .replace(/[֑-ׇ]/g, '')            // niqqud and cantillation
    .replace(/[ךםןףץ]/g, (c) => FINAL[c]!)
    .replace(/["'׳״`’.,()\-–/]/g, ' ')
    .replace(/\s+/g, ' ').trim();
}
const words = (s: string) => normalize(s).split(' ').filter(Boolean);

export function buildIndex(data: { places: Row[]; streets: Row[]; pois: Row[] }): Index {
  const keys: Index['keys'] = [];
  const add = (kind: 0 | 1 | 2, rows: Row[], from: number) => rows.forEach((r, i) => {
    const w = new Set<string>();
    for (let k = from; k < from + 3; k++) for (const x of words(String(r[k] ?? ''))) w.add(x);
    if (w.size) keys.push({ kind, i, words: [...w] });
  });
  add(0, data.places, 1);   // [kind, he, en, local, lon, lat, pop]
  add(1, data.streets, 0);  // [he, en, local, lon, lat, city]
  add(2, data.pois, 1);     // [type, he, en, local, lon, lat, city]
  return { ...data, keys };
}

const KIND_W = [0, 1, 2, 4, 5, 6, 8]; // city, town, village, suburb, neighbourhood, hamlet, locality

function pick(lang: Lang, he: unknown, en: unknown, local: unknown): string {
  const h = String(he || ''), e = String(en || ''), l = String(local || '');
  return lang === 'he' ? h || l || e : e || l || h;
}

export function search(ix: Index, q: string, lang: Lang, near: [number, number] | null, limit = 8): Hit[] {
  const qw = words(q);
  if (!qw.length) return [];
  const out: { score: number; hit: Hit }[] = [];
  const cityName = (c: unknown) => { const p = typeof c === 'number' && c >= 0 ? ix.places[c] : null; return p ? pick(lang, p[1], p[2], p[3]) : ''; };
  for (const k of ix.keys) {
    // every query word must start some word of the name — or of the city ("הרצל רחובות")
    let exact = 0, miss = 0, cityUsed = 0;
    const cityWords = k.kind === 0 ? [] : words(cityName((k.kind === 1 ? ix.streets[k.i]![5] : ix.pois[k.i]![6])));
    for (const w of qw) {
      if (/^\d+$/.test(w)) continue; // house numbers: we place the street
      const hit = k.words.find((x) => x.startsWith(w));
      if (hit) { if (hit === w) exact++; continue; }
      if (cityWords.some((x) => x.startsWith(w))) { cityUsed++; continue; }
      miss++; break;
    }
    if (miss) continue;
    const row = k.kind === 0 ? ix.places[k.i]! : k.kind === 1 ? ix.streets[k.i]! : ix.pois[k.i]!;
    const lon = Number(k.kind === 1 ? row[3] : row[4]), lat = Number(k.kind === 1 ? row[4] : row[5]);
    let score = (qw.length - exact) * 3 - cityUsed * 0.5;
    if (k.kind === 0) score += KIND_W[Number(row[0])] ?? 6;
    else score += k.kind === 1 ? 4 : 5;
    if (k.words.length > qw.length + 2) score += 1; // long names match short queries less well
    if (near) {
      const d = Math.hypot((lon - near[0]) * Math.cos(near[1] * Math.PI / 180), lat - near[1]) * 111;
      score += Math.min(8, d / 15);
    }
    const name = k.kind === 0 ? pick(lang, row[1], row[2], row[3]) : k.kind === 1 ? pick(lang, row[0], row[1], row[2]) : pick(lang, row[1], row[2], row[3]);
    const detail = k.kind === 0 ? '' : cityName(k.kind === 1 ? row[5] : row[6]);
    const num = qw.find((w) => /^\d+$/.test(w));
    out.push({ score, hit: { name: k.kind === 1 && num ? `${name} ${num}` : name, detail, lon, lat } });
  }
  out.sort((a, b) => a.score - b.score);
  const seen = new Set<string>(), res: Hit[] = [];
  for (const o of out) {
    const key = o.hit.name + '|' + o.hit.detail;
    if (seen.has(key)) continue;
    seen.add(key); res.push(o.hit);
    if (res.length >= limit) break;
  }
  return res;
}
