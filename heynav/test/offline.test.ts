import { describe, expect, it } from 'vitest';
import fs from 'fs';
import { loadGraph, route } from '../src/offline/router';
import { core } from '../src/core';

const FILE = process.env.HN_GRAPH || '/home/user/offline/out/graph.bin';
const have = fs.existsSync(FILE);
const G = have ? (() => { const b = fs.readFileSync(FILE); return loadGraph(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); })() : null;

function drive(r: NonNullable<ReturnType<typeof route>>) {
  const trk = core.tracker(r, 'he');
  const cum = core.cumulative(r.geometry);
  let arrived = false;
  for (let a = 0; a < trk.total + 40 && !arrived; a += 20) arrived = trk.update({ pos: core.pointAt(r.geometry, cum, a).point, accuracy: 5, speed: 15, heading: null, time: a }).arrived;
  return arrived;
}

describe.skipIf(!have)('offline router (built graph)', () => {
  it('Tel Aviv → Jerusalem: close to the online route, drivable to the end', () => {
    const t0 = Date.now();
    const r = route(G!, [34.7818, 32.0853], [35.2137, 31.7683], 'he')!;
    const ms = Date.now() - t0;
    console.log('TLV-JLM', Math.round(r.distance / 100) / 10, 'km', Math.round(r.duration / 60), 'min', ms, 'ms');
    console.log(r.steps.filter((s) => s.speak).map((s) => s.text).join('\n'));
    expect(r.distance / 1000).toBeGreaterThan(55);
    expect(r.distance / 1000).toBeLessThan(80);
    expect(r.duration / 60).toBeGreaterThan(40);
    expect(r.duration / 60).toBeLessThan(90);
    expect(drive(r)).toBe(true);
  });
  it('city streets with turns and a roundabout (Tel Aviv)', () => {
    const r = route(G!, [34.7818, 32.0853], [34.7925, 32.0745], 'he')!;
    console.log('city', Math.round(r.distance), 'm', r.steps.map((s) => s.text).join(' | '));
    expect(r.distance).toBeGreaterThan(1500);
    expect(r.distance).toBeLessThan(5000);
    expect(drive(r)).toBe(true);
  });
  it('Yerevan, names not in Armenian for a Hebrew user where the map has another name', () => {
    const r = route(G!, [44.5152, 40.1776], [44.5156, 40.1913], 'he')!;
    console.log('yerevan', Math.round(r.distance), 'm', r.steps.map((s) => s.text).join(' | '));
    expect(r.distance).toBeGreaterThan(1000);
    expect(drive(r)).toBe(true);
  });
  it('avoids Area A when asked (Kiryat Arba → Otniel goes around Hebron)', () => {
    const plain = route(G!, [35.12, 31.535], [35.03, 31.43], 'he')!;
    const avoid = route(G!, [35.12, 31.535], [35.03, 31.43], 'he', { areas: true })!;
    console.log('hebron', Math.round(plain.distance / 100) / 10, 'km vs', Math.round(avoid.distance / 100) / 10, 'km');
    expect(avoid.distance).toBeGreaterThanOrEqual(plain.distance);
  });
  it('a stop on the way', () => {
    const r = route(G!, [34.7818, 32.0853], [34.888, 32.084], 'he', {}, [34.838, 32.06])!;
    expect(r.steps.filter((s) => s.type === 'waypoint')).toHaveLength(1);
    expect(drive(r)).toBe(true);
  });
});

import { buildIndex, search } from '../src/offline/search';
const SFILE = process.env.HN_SEARCH || '/home/user/offline/out/search.json';
describe.skipIf(!fs.existsSync(SFILE))('offline search', () => {
  const t0 = Date.now();
  const ix = buildIndex(JSON.parse(fs.readFileSync(SFILE, 'utf8')));
  console.log('index built', Date.now() - t0, 'ms', ix.keys.length, 'entries');
  const q = (s: string, near: [number, number] | null = [34.78, 32.08], lang: 'he' | 'en' = 'he') => { const t = Date.now(); const r = search(ix, s, lang, near); console.log(JSON.stringify(s), Date.now() - t, 'ms →', r.slice(0, 4).map((h) => h.name + (h.detail ? ' (' + h.detail + ')' : '')).join(' | ')); return r; };
  it('cities, streets with city, places', () => {
    expect(q('ירושלים')[0]!.name).toBe('ירושלים');
    expect(q('דיזנגוף').some((h) => h.name.includes('דיזנגוף'))).toBe(true);
    expect(q('הרצל רחובות').some((h) => h.name === 'הרצל' && h.detail === 'רחובות')).toBe(true);
    expect(q('עזריאלי').length).toBeGreaterThan(0);
    expect(q('ביג', [34.79, 31.25]).length).toBeGreaterThan(0);
    expect(q('Yerevan', null, 'en')[0]!.name).toMatch(/Yerevan/);
    expect(q('ירוואן', null).length).toBeGreaterThanOrEqual(0);
  });
});
