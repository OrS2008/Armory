/**
 * Navigation core: geometry and route progress. Pure functions, no imports.
 *
 * The whole factory is also sent to the browser as source (navCore.toString()), so
 * the code the tests check is exactly the code that guides the driver. Keep it
 * self-contained: nothing outside this function may be referenced from inside it.
 */
export function navCore() {
  type LonLat = [number, number];
  const R = 6371008.8;
  const rad = Math.PI / 180;

  /** Metres between two [lon, lat] points (equirectangular: accurate at street scale). */
  function dist(a: LonLat, b: LonLat): number {
    const x = (b[0] - a[0]) * rad * Math.cos(((a[1] + b[1]) / 2) * rad);
    const y = (b[1] - a[1]) * rad;
    return Math.sqrt(x * x + y * y) * R;
  }

  /** Initial compass bearing from a to b, 0..360. */
  function bearing(a: LonLat, b: LonLat): number {
    const f1 = a[1] * rad, f2 = b[1] * rad, dl = (b[0] - a[0]) * rad;
    const y = Math.sin(dl) * Math.cos(f2);
    const x = Math.cos(f1) * Math.sin(f2) - Math.sin(f1) * Math.cos(f2) * Math.cos(dl);
    return (Math.atan2(y, x) / rad + 360) % 360;
  }

  /** Smallest absolute difference between two bearings, 0..180. */
  function angleDiff(a: number, b: number): number {
    const d = Math.abs(a - b) % 360;
    return d > 180 ? 360 - d : d;
  }

  /** Point at fraction t along a→b. */
  function lerp(a: LonLat, b: LonLat, t: number): LonLat {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  }

  /** Cumulative distance (m) at each vertex of a line. */
  function cumulative(line: LonLat[]): number[] {
    const out = [0];
    for (let i = 1; i < line.length; i++) out.push(out[i - 1]! + dist(line[i - 1]!, line[i]!));
    return out;
  }

  interface Projection { seg: number; t: number; point: LonLat; along: number; offset: number }

  /**
   * Nearest point on the line to p. Works in a local metric frame around p, so
   * it stays right at any latitude. `from`/`to` limit the search to a window of
   * segments (the car only moves forward a little between fixes).
   */
  function project(line: LonLat[], cum: number[], p: LonLat, from = 0, to = line.length - 1): Projection {
    const kx = Math.cos(p[1] * rad) * rad * R, ky = rad * R;
    let best: Projection = { seg: 0, t: 0, point: line[0]!, along: 0, offset: Infinity };
    const lo = Math.max(0, from), hi = Math.min(line.length - 1, to);
    for (let i = lo; i < hi; i++) {
      const a = line[i]!, b = line[i + 1]!;
      const ax = (a[0] - p[0]) * kx, ay = (a[1] - p[1]) * ky;
      const bx = (b[0] - p[0]) * kx, by = (b[1] - p[1]) * ky;
      const dx = bx - ax, dy = by - ay;
      const len2 = dx * dx + dy * dy;
      let t = len2 ? -(ax * dx + ay * dy) / len2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const x = ax + dx * t, y = ay + dy * t;
      const d = Math.sqrt(x * x + y * y);
      if (d < best.offset) best = { seg: i, t, point: lerp(a, b, t), along: cum[i]! + (cum[i + 1]! - cum[i]!) * t, offset: d };
    }
    return best;
  }

  /** The point `along` metres from the start of the line, with the bearing there. */
  function pointAt(line: LonLat[], cum: number[], along: number): { point: LonLat; bearing: number; seg: number } {
    const total = cum[cum.length - 1] ?? 0;
    const a = Math.max(0, Math.min(total, along));
    let i = 0;
    while (i < cum.length - 2 && cum[i + 1]! < a) i++;
    const len = cum[i + 1]! - cum[i]!;
    const t = len ? (a - cum[i]!) / len : 0;
    return { point: lerp(line[i]!, line[i + 1]!, t), bearing: bearing(line[i]!, line[i + 1]!), seg: i };
  }

  interface Step { type: string; modifier?: string; distance: number; duration: number; start: number; text: string; speak: boolean; icon: string; name: string }
  interface Route { geometry: LonLat[]; steps: Step[]; distance: number; duration: number }

  interface Fix { pos: LonLat; accuracy: number; speed: number | null; heading: number | null; time: number }

  /** What the screen and the voice need after each GPS fix. */
  interface Progress {
    snapped: LonLat;      // where the car is drawn (on the road when close to it)
    onRoute: boolean;
    offset: number;       // metres from the route
    along: number;        // metres travelled along the route
    step: number;         // index of the step being driven
    next: number;         // index of the upcoming manoeuvre, -1 after the last
    toNext: number;       // metres to the upcoming manoeuvre
    remaining: number;    // metres to the destination
    remainingTime: number;// seconds to the destination
    bearing: number;      // direction to draw the car and turn the map
    arrived: boolean;
    reroute: boolean;     // the car has left the route: ask for a new one
    say: string | null;   // announcement to speak now, if any
  }

  /** Spoken distance, rounded the way people say it. */
  function spokenDistance(m: number, lang: string): string {
    const he = lang === 'he';
    if (m >= 950) {
      const km = Math.round(m / 100) / 10;
      if (km === 1) return he ? 'קילומטר' : '1 kilometre';
      if (km === 2) return he ? '2 קילומטר' : '2 kilometres';
      return he ? `${km} קילומטר` : `${km} kilometres`;
    }
    const r = m >= 300 ? Math.round(m / 100) * 100 : m >= 100 ? Math.round(m / 50) * 50 : Math.max(10, Math.round(m / 10) * 10);
    return he ? `${r} מטר` : `${r} metres`;
  }

  /** Distance for the banner: "350 מ׳", "1.4 ק״מ". */
  function shortDistance(m: number, lang: string): string {
    const he = lang === 'he';
    if (m >= 1000) return `${(m / 1000).toFixed(m >= 10000 ? 0 : 1)} ${he ? 'ק״מ' : 'km'}`;
    const r = m >= 100 ? Math.round(m / 50) * 50 : Math.max(0, Math.round(m / 10) * 10);
    return `${r} ${he ? 'מ׳' : 'm'}`;
  }

  /**
   * Keeps track of one route as fixes come in. Announcements happen once per
   * stage per manoeuvre: early (only on long stretches), prepare, and now.
   */
  function tracker(route: Route, lang: string) {
    const line = route.geometry;
    const cum = cumulative(line);
    const total = cum[cum.length - 1] ?? 0;
    const said = new Set<string>();
    let lastSeg = 0;
    let offCount = 0;
    let lastBearing = line.length > 1 ? bearing(line[0]!, line[1]!) : 0;
    let arrived = false;
    const and = lang === 'he' ? 'ואז' : 'then';
    const inPrefix = (m: number) => (lang === 'he' ? `בעוד ${spokenDistance(m, lang)}, ` : `In ${spokenDistance(m, lang)}, `);

    function remainingTime(along: number): number {
      let t = 0;
      for (const s of route.steps) {
        const end = s.start + s.distance;
        if (end <= along) continue;
        const left = Math.min(s.distance, end - along);
        t += s.distance > 0 ? s.duration * (left / s.distance) : 0;
      }
      return t;
    }

    function update(fix: Fix): Progress {
      // Look a bounded way ahead of the last known position, then everywhere if that fails.
      let pr = project(line, cum, fix.pos, Math.max(0, lastSeg - 3), lastSeg + 80);
      if (pr.offset > 60) {
        const full = project(line, cum, fix.pos);
        if (full.offset < pr.offset) pr = full;
      }
      const tolerance = Math.max(35, Math.min(80, fix.accuracy * 1.5));
      const onRoute = pr.offset <= tolerance;
      if (onRoute) { lastSeg = pr.seg; offCount = 0; } else if (fix.accuracy <= 60) offCount++;

      const along = onRoute ? pr.along : cum[lastSeg] ?? 0;
      let step = 0;
      for (let i = 0; i < route.steps.length; i++) if (route.steps[i]!.start <= along + 3) step = i;
      const next = step + 1 < route.steps.length ? step + 1 : -1;
      const toNext = next >= 0 ? Math.max(0, route.steps[next]!.start - along) : Math.max(0, total - along);
      const remaining = Math.max(0, total - along);

      // Direction: the road's when on it (steady), else the GPS heading, else the last one.
      let b = lastBearing;
      if (onRoute) b = pointAt(line, cum, along + 5).bearing;
      else if (fix.heading != null && (fix.speed ?? 0) > 1.5) b = fix.heading;
      lastBearing = b;

      if (!arrived && remaining < 25 && onRoute) arrived = true;

      let say: string | null = null;
      if (onRoute && !arrived && next >= 0) {
        const s = route.steps[next]!;
        const speed = fix.speed != null && fix.speed > 0 ? fix.speed : 13; // ~50 km/h when unknown
        const nowAt = Math.max(40, speed * 5);                 // about five seconds before
        const prepareAt = speed > 22 ? 1000 : speed > 14 ? 500 : 250;
        const earlyAt = 2000;
        const legLength = s.start - (route.steps[step]?.start ?? 0);
        const follow = route.steps[next + 1];
        const then = follow && follow.speak && follow.start - s.start < 120 ? ` ${and} ${follow.text}` : '';
        if (s.type === 'arrive') {
          if (toNext <= nowAt && !said.has(next + ':now')) { said.add(next + ':now'); said.add(next + ':prep'); say = s.text; }
          else if (toNext <= prepareAt && toNext > nowAt * 1.5 && !said.has(next + ':prep')) { said.add(next + ':prep'); say = inPrefix(toNext) + s.text; }
        } else if (s.speak) {
          if (toNext <= nowAt) {
            if (!said.has(next + ':now')) { said.add(next + ':now'); said.add(next + ':prep'); said.add(next + ':early'); say = s.text + then; }
          } else if (toNext <= prepareAt) {
            if (!said.has(next + ':prep') && toNext > nowAt * 1.5) { said.add(next + ':prep'); said.add(next + ':early'); say = inPrefix(toNext) + s.text; }
          } else if (toNext <= earlyAt && legLength > 3000 && !said.has(next + ':early')) {
            said.add(next + ':early'); say = inPrefix(toNext) + s.text;
          }
        }
      }

      const snapped = onRoute && pr.offset < 25 ? pr.point : fix.pos;
      return {
        snapped, onRoute, offset: pr.offset, along, step, next, toNext, remaining,
        remainingTime: remainingTime(along), bearing: b, arrived,
        reroute: !arrived && offCount >= 3, say,
      };
    }

    /** First announcement when guidance starts. */
    function intro(): string {
      const first = route.steps[0];
      const second = route.steps[1];
      if (!first) return '';
      const lead = first.text;
      if (second && second.speak && second.start < 400) return `${lead}, ${and} ${second.text}`;
      return lead;
    }

    return { update, intro, total, cum };
  }

  return { dist, bearing, angleDiff, cumulative, project, pointAt, tracker, spokenDistance, shortDistance };
}

export const core = navCore();
export type Core = typeof core;
