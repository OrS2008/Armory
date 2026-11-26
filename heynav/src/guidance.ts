/** Turns an OSRM route into the route model the app drives with, with directions in he/en. */
import type { Lang } from './i18n';

type LonLat = [number, number];

export interface OsrmStep {
  geometry: { coordinates: LonLat[] };
  maneuver: { location: LonLat; type: string; modifier?: string; exit?: number; bearing_before?: number; bearing_after?: number };
  name?: string;
  ref?: string;
  destinations?: string;
  exits?: string;
  rotary_name?: string;
  distance: number;
  duration: number;
}
export interface OsrmRoute { distance: number; duration: number; legs: { steps: OsrmStep[] }[] }

export interface Step {
  type: string;
  modifier?: string;
  exit?: number;
  name: string;
  distance: number;
  duration: number;
  start: number;      // metres from the route start where this manoeuvre happens
  text: string;       // the instruction, without a distance ("Turn left onto Herzl")
  speak: boolean;     // worth announcing (a plain "continue straight" is not)
  icon: string;       // arrow to draw
}
export interface Route { geometry: LonLat[]; steps: Step[]; distance: number; duration: number }

const HE_ORD = ['', 'הראשונה', 'השנייה', 'השלישית', 'הרביעית', 'החמישית', 'השישית', 'השביעית', 'השמינית', 'התשיעית', 'העשירית'];
const EN_ORD = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'];

const HE_DIR: Record<string, string> = {
  left: 'פנה שמאלה', right: 'פנה ימינה', 'slight left': 'פנה קלות שמאלה', 'slight right': 'פנה קלות ימינה',
  'sharp left': 'פנה חדות שמאלה', 'sharp right': 'פנה חדות ימינה', straight: 'המשך ישר', uturn: 'בצע פניית פרסה',
};
const EN_DIR: Record<string, string> = {
  left: 'Turn left', right: 'Turn right', 'slight left': 'Bear left', 'slight right': 'Bear right',
  'sharp left': 'Turn sharp left', 'sharp right': 'Turn sharp right', straight: 'Continue straight', uturn: 'Make a U-turn',
};
const side = (mod: string | undefined) => (mod?.includes('left') ? 'left' : mod?.includes('right') ? 'right' : '');

/** Hebrew "to X": ל attaches to a Hebrew word; before digits or Latin it takes a hyphen. */
function heTo(x: string) {
  return /^[֐-׿]/.test(x) ? `ל${x}` : `ל-${x}`;
}

/** The road's name for speech: its name, else its number ("כביש 2"). */
function roadName(s: OsrmStep, lang: Lang): string {
  const name = (s.name ?? '').trim();
  if (name) return name;
  const ref = (s.ref ?? '').split(';')[0]?.trim();
  if (ref) return lang === 'he' ? `כביש ${ref}` : `route ${ref}`;
  return '';
}

function towards(s: OsrmStep, lang: Lang): string {
  const d = (s.destinations ?? '').split(':').pop()?.split(',')[0]?.trim();
  if (!d) return '';
  return lang === 'he' ? ` לכיוון ${d}` : ` towards ${d}`;
}

export function instruction(s: OsrmStep, lang: Lang): { text: string; speak: boolean; icon: string } {
  const he = lang === 'he';
  const m = s.maneuver;
  const mod = m.modifier;
  const name = roadName(s, lang);
  const onto = name ? (he ? ` ${heTo(name)}` : ` onto ${name}`) : '';
  const dir = (he ? HE_DIR : EN_DIR)[mod ?? 'straight'] ?? (he ? 'המשך' : 'Continue');
  const icon = mod ? mod.replace(' ', '-') : 'straight';

  switch (m.type) {
    case 'depart':
      return { text: name ? (he ? `סע ב${name}` : `Head along ${name}`) : he ? 'צא לדרך' : 'Start driving', speak: true, icon: 'straight' };
    case 'arrive': {
      const sd = side(mod);
      const text = he
        ? sd ? `הגעת ליעד. היעד ${sd === 'left' ? 'משמאלך' : 'מימינך'}` : 'הגעת ליעד'
        : sd ? `You have arrived. Your destination is on the ${sd}` : 'You have arrived';
      return { text, speak: true, icon: 'arrive' };
    }
    case 'roundabout': case 'rotary': case 'roundabout turn': {
      const n = m.exit ?? 0;
      if (m.type === 'roundabout turn' || !n) return { text: dir + onto, speak: true, icon: 'roundabout' };
      const ord = (he ? HE_ORD : EN_ORD)[n] ?? String(n);
      return {
        text: he ? `בכיכר צא ביציאה ${ord}${onto}` : `At the roundabout, take the ${ord} exit${onto}`,
        speak: true, icon: `roundabout-${Math.min(n, 4)}`,
      };
    }
    case 'exit roundabout': case 'exit rotary':
      return { text: he ? `צא מהכיכר${onto}` : `Exit the roundabout${onto}`, speak: false, icon: 'straight' };
    case 'on ramp':
      return { text: he ? `עלה לרמפה${side(mod) ? (side(mod) === 'left' ? ' משמאל' : ' מימין') : ''}${towards(s, lang) || onto}` : `Take the ramp${side(mod) ? ' on the ' + side(mod) : ''}${towards(s, lang) || onto}`, speak: true, icon };
    case 'off ramp':
      return { text: he ? `צא ביציאה${side(mod) ? (side(mod) === 'left' ? ' משמאל' : ' מימין') : ''}${towards(s, lang) || onto}` : `Take the exit${side(mod) ? ' on the ' + side(mod) : ''}${towards(s, lang) || onto}`, speak: true, icon };
    case 'fork': {
      const sd = side(mod);
      const keep = he ? (sd === 'left' ? 'בהתפצלות שמור שמאלה' : sd === 'right' ? 'בהתפצלות שמור ימינה' : 'בהתפצלות המשך ישר') : sd ? `Keep ${sd} at the fork` : 'Continue at the fork';
      return { text: keep + (towards(s, lang) || onto), speak: true, icon: sd ? `fork-${sd}` : 'straight' };
    }
    case 'end of road':
      return { text: (he ? `בסוף הדרך ${dir}` : `At the end of the road, ${dir.toLowerCase()}`) + onto, speak: true, icon };
    case 'merge':
      return { text: (he ? 'השתלב' : 'Merge') + (name ? (he ? ` ב${name}` : ` onto ${name}`) : ''), speak: true, icon: side(mod) ? `slight-${side(mod)}` : 'straight' };
    case 'new name':
    case 'continue':
    case 'notification':
    default: {
      if (!mod || mod === 'straight') return { text: (he ? 'המשך' : 'Continue') + (name ? (he ? ` ב${name}` : ` on ${name}`) : ''), speak: false, icon: 'straight' };
      return { text: dir + onto, speak: true, icon };
    }
  }
}

/** Builds the route model. Step geometries are joined into one line; each step records where it starts on it. */
export function buildRoute(r: OsrmRoute, lang: Lang): Route {
  const geometry: LonLat[] = [];
  const steps: Step[] = [];
  let along = 0;
  for (const leg of r.legs) {
    for (const s of leg.steps) {
      const coords = s.geometry.coordinates;
      const start = along;
      for (let i = 0; i < coords.length; i++) {
        const c = coords[i]!;
        const prev = geometry[geometry.length - 1];
        if (prev && prev[0] === c[0] && prev[1] === c[1]) continue;
        if (prev) along += metres(prev, c);
        geometry.push([round6(c[0]), round6(c[1])]);
      }
      const ins = instruction(s, lang);
      steps.push({
        type: s.maneuver.type, modifier: s.maneuver.modifier, exit: s.maneuver.exit, name: roadName(s, lang),
        distance: along - start, duration: s.duration, start, ...ins,
      });
    }
  }
  // OSRM measures slightly differently; trust the joined line so progress adds up exactly.
  return { geometry, steps, distance: along, duration: r.duration };
}

const round6 = (x: number) => Math.round(x * 1e6) / 1e6;
function metres(a: LonLat, b: LonLat) {
  const rad = Math.PI / 180;
  const x = (b[0] - a[0]) * rad * Math.cos(((a[1] + b[1]) / 2) * rad);
  const y = (b[1] - a[1]) * rad;
  return Math.sqrt(x * x + y * y) * 6371008.8;
}
