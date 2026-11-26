#!/usr/bin/env python3
"""
Builds HeyNav's offline data from an OpenStreetMap extract (.osm.pbf):

  graph.bin   road graph for the offline router (oneway, speeds, names, toll and
              Area A flags, roundabouts, road class)
  search.json places, streets and named points of interest for offline search

Usage: python3 build_offline.py <extract.osm.pbf> <out dir>
Data © OpenStreetMap contributors, ODbL.
"""
import json, math, os, re, struct, sys
from array import array
import osmium

SRC, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)
HERE = os.path.dirname(os.path.abspath(__file__))

# ---------------------------------------------------------------- road model
CLASSES = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential',
           'motorway_link', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link',
           'living_street', 'service', 'road']
CLS = {c: i for i, c in enumerate(CLASSES)}
SPEED = {'motorway': 100, 'trunk': 80, 'primary': 65, 'secondary': 55, 'tertiary': 45, 'unclassified': 35,
         'residential': 30, 'motorway_link': 60, 'trunk_link': 50, 'primary_link': 40, 'secondary_link': 35,
         'tertiary_link': 35, 'living_street': 10, 'service': 15, 'road': 30}
BAD_SERVICE = {'parking_aisle', 'driveway', 'drive-through', 'emergency_access', 'private'}

def maxspeed(v):
    m = re.match(r'^\s*(\d+)', v or '')
    if not m:
        return None
    s = int(m.group(1))
    if 'mph' in v:
        s = s * 1.609
    return s if 5 <= s <= 140 else None

def area_a():
    src = open(os.path.join(HERE, '..', '..', 'src', 'areas.gen.ts'), encoding='utf8').read()
    data = json.loads(src[src.index('= [') + 2:].rstrip().rstrip(';'))
    out = []
    for a in data:
        xs = [p[0] for p in a['ring']]; ys = [p[1] for p in a['ring']]
        out.append((min(xs), min(ys), max(xs), max(ys), a['ring']))
    return out
AREAS = area_a()

def in_ring(x, y, ring):
    c = False
    j = len(ring) - 1
    for i in range(len(ring)):
        x1, y1 = ring[i]; x2, y2 = ring[j]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            c = not c
        j = i
    return c

def in_area_a(x, y):
    for w, s, e, n, ring in AREAS:
        if w <= x <= e and s <= y <= n and in_ring(x, y, ring):
            return True
    return False

def metres(a, b):
    rad = math.pi / 180
    x = (b[0] - a[0]) * rad * math.cos((a[1] + b[1]) / 2 * rad)
    y = (b[1] - a[1]) * rad
    return math.hypot(x, y) * 6371008.8

# ---------------------------------------------------------------- search model
PLACE_KINDS = {'city': 0, 'town': 1, 'village': 2, 'suburb': 3, 'neighbourhood': 4, 'hamlet': 5, 'quarter': 4, 'locality': 6}
POI_KEYS = ('amenity', 'shop', 'tourism', 'leisure', 'historic', 'office')
SKIP_POI = {'bench', 'waste_basket', 'parking_space', 'bicycle_parking', 'recycling', 'drinking_water', 'vending_machine',
            'telephone', 'post_box', 'toilets', 'shelter', 'grit_bin', 'parking_entrance', 'motorcycle_parking', 'hunting_stand',
            'waste_disposal', 'clock', 'bbq', 'water_point', 'loading_dock', 'charging_station_socket'}

def names(t):
    return (t.get('name:he') or '', t.get('name:en') or '', t.get('name') or '')


class Pass(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.ways = []          # (node ids array, lons, lats, wayinfo idx, fwd, bwd, speed, flags)
        self.use = {}           # osm node id -> how many road ways touch it (capped at 2) / endpoint marks
        self.infos = {}         # (nh, ne, n, ref, cls) -> idx
        self.places = []
        self.pois = []
        self.streets = {}

    def info(self, key):
        i = self.infos.get(key)
        if i is None:
            i = self.infos[key] = len(self.infos)
        return i

    def node(self, n):
        t = n.tags
        if not len(t):
            return
        nh, ne, nl = names(t)
        if not (nh or ne or nl):
            return
        loc = n.location
        if 'place' in t and t['place'] in PLACE_KINDS:
            pop = t.get('population') or '0'
            try:
                pop = int(re.sub(r'\D', '', pop) or 0)
            except ValueError:
                pop = 0
            self.places.append([PLACE_KINDS[t['place']], nh, ne, nl, round(loc.lon, 5), round(loc.lat, 5), pop])
            return
        self.poi(t, loc.lon, loc.lat, nh, ne, nl)

    def poi(self, t, lon, lat, nh, ne, nl):
        for k in POI_KEYS:
            v = t.get(k)
            if v and v not in SKIP_POI and v != 'no':
                self.pois.append([k[0] + ':' + v, nh, ne, nl, round(lon, 5), round(lat, 5)])
                return

    def way(self, w):
        t = w.tags
        hw = t.get('highway')
        if hw not in CLS:
            # named buildings / areas with a POI tag: keep for search (first node as position)
            if any(k in t for k in POI_KEYS) and len(w.nodes):
                nh, ne, nl = names(t)
                if nh or ne or nl:
                    try:
                        xs = [nd.location.lon for nd in w.nodes]; ys = [nd.location.lat for nd in w.nodes]
                        self.poi(t, sum(xs) / len(xs), sum(ys) / len(ys), nh, ne, nl)
                    except osmium.InvalidLocationError:
                        pass
            return
        if t.get('area') == 'yes':
            return
        if hw == 'service' and t.get('service') in BAD_SERVICE:
            return
        acc = t.get('motor_vehicle') or t.get('motorcar') or t.get('vehicle') or t.get('access')
        if acc in ('no', 'private', 'agricultural', 'forestry', 'delivery', 'customers') and hw not in ('motorway', 'trunk', 'primary'):
            return
        try:
            ids = array('q', (nd.ref for nd in w.nodes))
            lons = array('d', (nd.location.lon for nd in w.nodes))
            lats = array('d', (nd.location.lat for nd in w.nodes))
        except osmium.InvalidLocationError:
            return
        if len(ids) < 2:
            return
        ow = t.get('oneway', '')
        roundabout = t.get('junction') in ('roundabout', 'circular')
        fwd, bwd = True, True
        if ow in ('yes', '1', 'true') or roundabout or hw == 'motorway' or (hw.endswith('_link') and ow != 'no' and hw == 'motorway_link'):
            bwd = False
        if ow == '-1':
            fwd, bwd = False, True
        if ow in ('no', 'false', '0'):
            fwd, bwd = True, True
        sp = maxspeed(t.get('maxspeed'))
        speed = min(SPEED[hw], sp * 0.9) if sp else SPEED[hw]
        if hw in ('residential', 'service', 'living_street', 'unclassified') and sp:
            speed = min(speed, sp * 0.8)
        flags = (2 if t.get('toll') == 'yes' else 0) | (8 if roundabout else 0)
        nh, ne, nl = names(t)
        ref = (t.get('ref') or '').split(';')[0].strip()
        wi = self.info((nh, ne, nl, ref, CLS[hw]))
        self.ways.append((ids, lons, lats, wi, fwd, bwd, speed, flags))
        for k, i in enumerate(ids):
            c = self.use.get(i, 0) + (2 if k == 0 or k == len(ids) - 1 else 1)
            self.use[i] = min(c, 2)
        # streets for search
        if (nl or nh or ne) and hw not in ('motorway_link', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link', 'service'):
            m = len(ids) // 2
            key = (nh, ne, nl, round(lons[m], 2), round(lats[m], 2))
            if key not in self.streets:
                self.streets[key] = [CLS[hw], nh, ne, nl, round(lons[m], 5), round(lats[m], 5)]


print('reading', SRC)
h = Pass()
h.apply_file(SRC, locations=True, idx='flex_mem')
print('road ways', len(h.ways), 'infos', len(h.infos), 'places', len(h.places), 'pois', len(h.pois), 'streets', len(h.streets))

# ---------------------------------------------------------------- graph
node_idx = {}
nlon, nlat = array('i'), array('i')
def gnode(osm_id, lon, lat):
    i = node_idx.get(osm_id)
    if i is None:
        i = node_idx[osm_id] = len(nlon)
        nlon.append(round(lon * 1e6)); nlat.append(round(lat * 1e6))
    return i

glon, glat = array('i'), array('i')
edges = []  # (from, to, len_dm, time_ds, way, geo, geon, flags)
for ids, lons, lats, wi, fwd, bwd, speed, flags in h.ways:
    start = 0
    for k in range(1, len(ids)):
        if k < len(ids) - 1 and h.use.get(ids[k], 0) < 2:
            continue
        a, b = gnode(ids[start], lons[start], lats[start]), gnode(ids[k], lons[k], lats[k])
        geo = len(glon)
        length = 0.0
        area = False
        for j in range(start, k + 1):
            glon.append(round(lons[j] * 1e6)); glat.append(round(lats[j] * 1e6))
            if j > start:
                length += metres((lons[j - 1], lats[j - 1]), (lons[j], lats[j]))
        mid = (start + k) // 2
        for j in (start, mid, k):
            if in_area_a(lons[j], lats[j]):
                area = True
        f = flags | (4 if area else 0)
        t = length / (speed / 3.6)
        n = k - start + 1
        if a != b or length > 0:
            if fwd:
                edges.append((a, b, round(length * 10), round(t * 10), wi, geo, n, f))
            if bwd:
                edges.append((b, a, round(length * 10), round(t * 10), wi, geo, n, f | 1))
        start = k

N = len(nlon)
edges.sort(key=lambda e: e[0])
first = array('I', [0] * (N + 1))
for e in edges:
    first[e[0] + 1] += 1
for i in range(N):
    first[i + 1] += first[i]
cols = [array('I'), array('I'), array('I'), array('I'), array('I'), array('H'), array('B')]
for e in edges:
    cols[0].append(e[1]); cols[1].append(e[2]); cols[2].append(e[3]); cols[3].append(e[4]); cols[4].append(e[5])
    cols[5].append(min(e[6], 65535)); cols[6].append(e[7])
infos = [None] * len(h.infos)
for k, i in h.infos.items():
    infos[i] = list(k)
wj = json.dumps(infos, ensure_ascii=False, separators=(',', ':')).encode('utf8')

def pad(f):
    while f.tell() % 4:
        f.write(b'\0')

with open(os.path.join(OUT, 'graph.bin'), 'wb') as f:
    f.write(b'HNG1')
    f.write(struct.pack('<IIII', N, len(edges), len(glon), len(wj)))
    for arr in (nlon, nlat, first, *cols[:5]):
        arr.tofile(f)
    cols[5].tofile(f); pad(f)
    cols[6].tofile(f); pad(f)
    glon.tofile(f); glat.tofile(f)
    f.write(wj)
print('graph: nodes', N, 'edges', len(edges), 'shape points', len(glon), 'bytes', os.path.getsize(os.path.join(OUT, 'graph.bin')))

# ---------------------------------------------------------------- search
cities = [p for p in h.places if p[0] <= 2]
grid = {}
for i, p in enumerate(h.places):
    grid.setdefault((int(p[4] * 10), int(p[5] * 10)), []).append(i)
def city_of(lon, lat):
    best, bd = -1, 9e9
    gx, gy = int(lon * 10), int(lat * 10)
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            for i in grid.get((gx + dx, gy + dy), []):
                p = h.places[i]
                if p[0] > 2:
                    continue
                d = metres((lon, lat), (p[4], p[5])) * (0.5 if p[0] == 0 else 1)
                if d < bd:
                    bd, best = d, i
    return best if bd < 9000 else -1

streets = []
seen = set()
for s in h.streets.values():
    c = city_of(s[4], s[5])
    k = (s[1], s[2], s[3], c)
    if k in seen:
        continue
    seen.add(k)
    streets.append(s[1:] + [c])
pois = []
for p in h.pois:
    pois.append(p + [city_of(p[4], p[5])])
search = {'v': 1, 'places': h.places, 'streets': streets, 'pois': pois}
with open(os.path.join(OUT, 'search.json'), 'w', encoding='utf8') as f:
    json.dump(search, f, ensure_ascii=False, separators=(',', ':'))
print('search: places', len(h.places), 'streets', len(streets), 'pois', len(pois), 'bytes', os.path.getsize(os.path.join(OUT, 'search.json')))
