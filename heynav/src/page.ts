import { navCore } from './core';
import { dict, type Lang } from './i18n';
import { AREA_A } from './areas.gen';

const TILES = 'https://tiles.openfreemap.org';

const RANGE_HE = 'U+0307-0308,U+0590-05FF,U+200C-2010,U+20AA,U+25CC,U+FB1D-FB4F';
const RANGE_LATIN = 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD';
const face = (family: string, file: string, weight: number, range: string) =>
  `@font-face{font-family:'${family}';src:url(/fonts/${file}.woff2) format('woff2');font-weight:${weight};font-display:swap;unicode-range:${range}}`;
const FONTS = [
  face('Rubik', 'rubik-hebrew-400-normal', 400, RANGE_HE), face('Rubik', 'rubik-latin-400-normal', 400, RANGE_LATIN),
  face('Rubik', 'rubik-hebrew-500-normal', 500, RANGE_HE), face('Rubik', 'rubik-latin-500-normal', 500, RANGE_LATIN),
  face('Rubik', 'rubik-hebrew-700-normal', 700, RANGE_HE), face('Rubik', 'rubik-latin-700-normal', 700, RANGE_LATIN),
  face('Orbitron', 'orbitron-latin-700-normal', 700, RANGE_LATIN), face('Orbitron', 'orbitron-latin-900-normal', 900, RANGE_LATIN),
].join('');

export const iconSvg = () =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#22e4ff"/><stop offset=".6" stop-color="#7a5cff"/><stop offset="1" stop-color="#ff2bd6"/></linearGradient></defs><rect width="96" height="96" rx="26" fill="#050b16"/><rect x="3" y="3" width="90" height="90" rx="23" fill="none" stroke="url(#g)" stroke-width="3"/><path d="M48 16 74 78 48 64 22 78Z" fill="url(#g)"/></svg>`;

export const manifest = (lang: Lang) => ({
  name: 'HeyNav', short_name: 'HeyNav', description: dict(lang).title, start_url: '/', scope: '/', display: 'standalone',
  background_color: '#03060c', theme_color: '#03060c', lang, dir: lang === 'he' ? 'rtl' : 'ltr',
  icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
});

/*
 * Look: holographic glass. Deep navy space, translucent panels with a soft neon edge,
 * one cyan→violet→magenta gradient for everything that matters, Orbitron for numbers.
 */
const CSS = `${FONTS}
:root{--bg:#03060c;--glass:rgba(7,14,28,.64);--glass2:rgba(9,18,36,.82);--fg:#e8f4ff;--muted:#86a0ba;--line:rgba(120,200,255,.10);--line2:rgba(120,200,255,.22);
  --brand:#22e4ff;--brand2:#9b6bff;--hot:#ff2bd6;--act-fg:#020a14;--ok:#3dffa8;--bad:#ff3d6e;--field:rgba(0,0,0,.28);
  --grad:linear-gradient(120deg,#22e4ff 0%,#6f7dff 55%,#c04bff 100%);--grad-hot:linear-gradient(135deg,#ff3d6e,#ff2bd6);
  --glow:0 0 0 1px rgba(34,228,255,.10),0 12px 40px rgba(0,0,0,.55),0 0 32px rgba(34,228,255,.10);--neon:0 0 18px rgba(34,228,255,.55);
  --r:20px;--font:Rubik,system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;--mono:Orbitron,Rubik,ui-monospace,monospace;--display:Rubik,sans-serif;color-scheme:dark}
:root[data-theme=light]{--bg:#e8f0f7;--glass:rgba(255,255,255,.72);--glass2:rgba(255,255,255,.9);--fg:#081423;--muted:#4b6178;--line:rgba(10,60,110,.10);--line2:rgba(10,60,110,.20);
  --brand:#0086c0;--brand2:#6a3cf0;--act-fg:#fff;--ok:#00a46a;--bad:#e0244f;--field:rgba(255,255,255,.7);
  --grad:linear-gradient(120deg,#00b6e8 0%,#5468ff 55%,#9a3cf5 100%);--glow:0 0 0 1px rgba(0,120,190,.08),0 12px 34px rgba(20,50,90,.16);--neon:0 0 14px rgba(0,150,210,.35);color-scheme:light}
*{box-sizing:border-box}html,body{margin:0;height:100%;overflow:hidden;background:var(--bg);color:var(--fg);font:400 18px/1.4 var(--font);-webkit-text-size-adjust:100%}
button,input{font:inherit;color:inherit}button{cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
#map{position:fixed;inset:0}
/* a soft vignette: the map fades into space at the edges */
body::after{content:"";position:fixed;inset:0;pointer-events:none;z-index:5;background:radial-gradient(ellipse at 50% 60%,transparent 55%,rgba(2,5,12,.55) 100%)}
:root[data-theme=light] body::after{background:radial-gradient(ellipse at 50% 60%,transparent 60%,rgba(120,150,180,.25) 100%)}
.hud{position:fixed;z-index:10;background:var(--glass);border:1px solid var(--line2);border-radius:var(--r);box-shadow:var(--glow);backdrop-filter:blur(18px) saturate(150%);-webkit-backdrop-filter:blur(18px) saturate(150%)}
.hud.br::before{content:"";position:absolute;inset-inline:22px;top:-1px;height:2px;border-radius:2px;background:var(--grad);box-shadow:var(--neon);pointer-events:none}
.kicker{font:700 .62rem var(--mono);letter-spacing:.32em;color:var(--brand);text-transform:uppercase;opacity:.9}
.btn{min-height:56px;padding:0 22px;border:1px solid var(--line2);border-radius:16px;background:rgba(255,255,255,.03);font-weight:500;font-size:1.05rem;display:inline-flex;align-items:center;justify-content:center;gap:8px;transition:transform .12s,box-shadow .2s,background .2s}
.btn:active{transform:scale(.97)}
.btn.primary{border:0;background:var(--grad);color:var(--act-fg);font-weight:700;box-shadow:0 8px 28px rgba(80,120,255,.35),var(--neon)}
.btn.ghost{color:var(--brand);border-color:rgba(34,228,255,.3)}.btn.danger{border-color:rgba(255,61,110,.55);color:var(--bad)}
.btn:disabled{opacity:.45;box-shadow:none}
/* search */
#search{top:max(14px,env(safe-area-inset-top));inset-inline-start:14px;width:min(560px,calc(100% - 28px));padding:14px;display:grid;gap:10px}
#sf{display:flex;gap:8px}
#q,#from{flex:1;min-width:0;padding:0 18px;border:1px solid var(--line2);border-radius:16px;background:var(--field);transition:border-color .2s,box-shadow .2s}
#q{min-height:60px;font-size:max(18px,1.2rem)}#from{min-height:52px;font-size:max(17px,1.05rem)}
#q:focus,#from:focus,#search.picking #from{outline:0;border-color:var(--brand);box-shadow:0 0 0 3px rgba(34,228,255,.15),var(--neon)}
#sf .btn{min-width:60px;padding:0 16px;border-radius:16px}
#res{display:grid;max-height:min(52vh,460px);overflow:auto;border-radius:14px}#res:empty{display:none}
#res button{all:unset;cursor:pointer;display:grid;gap:2px;padding:12px 14px;border-bottom:1px solid var(--line);border-radius:12px}
#res button:hover,#res button:focus-visible{background:rgba(34,228,255,.08)}
#res b{font-weight:500}#res span{color:var(--muted);font-size:.9rem}#res .msg{padding:12px 10px;color:var(--muted)}
#chips{display:flex;gap:8px;overflow-x:auto;scrollbar-width:none}#chips::-webkit-scrollbar{display:none}#chips:empty{display:none}
#chips button{flex:none;min-height:46px;padding:0 16px;border:1px solid var(--line2);border-radius:999px;background:var(--field);font-weight:500;white-space:nowrap;max-width:260px;overflow:hidden;text-overflow:ellipsis}
#chips button.fav{border-color:rgba(34,228,255,.45);color:var(--brand);box-shadow:inset 0 0 12px rgba(34,228,255,.12)}#chips button.x{color:var(--muted);font-weight:400}
.od{display:grid;gap:8px}.odrow{display:flex;gap:10px;align-items:center;position:relative}
.odl{flex:none;width:14px;height:14px;border-radius:50%;background:var(--ok);box-shadow:0 0 12px var(--ok)}
.odl.to{background:var(--grad);box-shadow:0 0 12px rgba(155,107,255,.8);border-radius:4px;transform:rotate(45deg);width:13px;height:13px}
.odrow:first-child::after{content:"";position:absolute;inset-inline-start:6px;top:calc(50% + 11px);height:22px;width:2px;background:linear-gradient(var(--ok),var(--brand2));opacity:.6}
#from::placeholder{color:var(--ok);opacity:1}
.mini{flex:none;min-width:44px;min-height:44px;border:1px solid var(--line2);border-radius:12px;background:var(--field);color:var(--muted)}
#gps{font:700 .68rem var(--mono);letter-spacing:.14em;color:var(--ok);direction:ltr;text-align:start;text-shadow:0 0 10px rgba(61,255,168,.4)}
#gps.bad{color:var(--bad);font-family:var(--font);letter-spacing:0;direction:inherit;font-size:.95rem;text-shadow:none}
/* preview */
#preview{bottom:calc(14px + env(safe-area-inset-bottom));inset-inline-start:14px;width:min(560px,calc(100% - 28px));padding:18px;display:grid;gap:12px;max-height:calc(100vh - 28px);overflow:auto}
#pname{font:700 2rem/1.05 var(--display)}#pdetail{color:var(--muted)}
.sum{display:flex;gap:18px;align-items:baseline;flex-wrap:wrap}.sum b{font:700 1.55rem var(--mono);background:var(--grad);-webkit-background-clip:text;background-clip:text;color:transparent}.sum span{color:var(--muted)}
.row{display:flex;gap:10px;flex-wrap:wrap}.row .btn{flex:1 1 auto;white-space:nowrap}
.small{font-size:.85rem;color:var(--muted)}
#alts{display:grid;gap:8px}#alts:empty{display:none}
#alts button{all:unset;cursor:pointer;display:grid;grid-template-columns:1fr auto;gap:2px 12px;padding:12px 14px;border:1px solid var(--line2);border-radius:16px;background:var(--field);transition:border-color .2s,box-shadow .2s}
#alts button[aria-checked=true]{border-color:var(--brand);box-shadow:inset 0 0 18px rgba(34,228,255,.12),var(--neon)}
#alts .t{font-weight:700}#alts .m{font:700 1.05rem var(--mono);color:var(--brand);text-align:end}#alts .s{color:var(--muted);font-size:.85rem}#alts .j{color:var(--bad);font-size:.85rem;text-align:end}
/* guidance */
#banner{top:max(14px,env(safe-area-inset-top));inset-inline-start:14px;width:min(620px,calc(100% - 28px));display:grid;grid-template-columns:auto 1fr;gap:4px 18px;padding:16px 18px;align-items:center;cursor:pointer;
  background:linear-gradient(160deg,rgba(10,22,44,.9),rgba(6,12,26,.86));border-color:rgba(34,228,255,.35);box-shadow:var(--glow),0 0 40px rgba(34,228,255,.12)}
:root[data-theme=light] #banner{background:linear-gradient(160deg,rgba(255,255,255,.95),rgba(240,247,255,.92))}
#banner::before{content:"";position:absolute;inset-inline-start:-1px;top:18px;bottom:18px;width:3px;border-radius:3px;background:var(--grad);box-shadow:var(--neon)}
#bi{grid-row:span 2;width:96px;height:96px;display:grid;place-items:center;border-radius:26px;background:var(--grad);box-shadow:0 10px 30px rgba(90,110,255,.45),var(--neon)}
#bi svg{width:70px;height:70px;filter:drop-shadow(0 2px 4px rgba(0,0,0,.25))}
#bd{font:900 2.9rem/1 var(--mono);direction:ltr;text-align:start;background:linear-gradient(90deg,#fff,#9fefff);-webkit-background-clip:text;background-clip:text;color:transparent;letter-spacing:.02em}
:root[data-theme=light] #bd{background:var(--grad);-webkit-background-clip:text;background-clip:text}
#bt{font-size:1.4rem;font-weight:700;line-height:1.2}
#bthen{grid-column:1/-1;display:flex;gap:10px;align-items:center;border-top:1px solid var(--line2);padding-top:10px;margin-top:6px;color:var(--muted);font-size:1rem}
#bthen svg{width:28px;height:28px;flex:none}
#bmore{position:absolute;inset-inline-end:12px;bottom:8px;font-size:1rem;color:var(--muted);opacity:.7}
#bcam{grid-column:1/-1;display:flex;gap:10px;align-items:center;margin-top:8px;padding:8px 12px;border-radius:14px;background:rgba(255,61,110,.12);border:1px solid rgba(255,61,110,.6);font-weight:700;box-shadow:0 0 18px rgba(255,61,110,.25)}
#bcam .lim{display:grid;place-items:center;width:44px;height:44px;border-radius:50%;border:4px solid #e53935;background:#fff;color:#111;font:700 1rem var(--mono)}
#alertchip{grid-column:1/-1;display:flex;gap:10px;align-items:center;margin-top:8px;padding:8px 12px;border-radius:14px;background:rgba(80,120,255,.14);border:1px solid rgba(110,140,255,.6);font-weight:700}
#alertchip i{font-style:normal;font-size:28px}
#blanes{grid-column:1/-1;margin-top:6px}
.lanes{display:flex;gap:6px;justify-content:center;direction:ltr;padding:6px;border-radius:14px;background:rgba(0,0,0,.35);border:1px solid var(--line)}
:root[data-theme=light] .lanes{background:rgba(10,40,80,.06)}
.ln{width:46px;height:52px;display:grid;place-items:center;border-radius:10px;border:1px solid var(--line)}
.ln svg{width:38px;height:38px}.ln.on{background:rgba(34,228,255,.14);border-color:rgba(34,228,255,.6);box-shadow:inset 0 0 14px rgba(34,228,255,.25),0 0 12px rgba(34,228,255,.35)}
.lanes.sm{justify-content:flex-start;padding:3px;background:transparent;border:0}.lanes.sm .ln{width:28px;height:30px;border-radius:7px}.lanes.sm .ln svg{width:22px;height:22px}
#navbar{bottom:calc(14px + env(safe-area-inset-bottom));inset-inline-start:14px;width:min(620px,calc(100% - 28px));padding:12px 14px;display:flex;align-items:center;gap:14px}
#eta{flex:1;display:flex;gap:16px;align-items:baseline;flex-wrap:wrap}
#eta b{font:700 1.9rem var(--mono);color:var(--ok);text-shadow:0 0 14px rgba(61,255,168,.35)}#eta span{color:var(--muted);font-size:.9rem}
#etaT,#etaD{font-size:1.2rem!important;color:var(--fg)!important;text-shadow:none!important}
#navbar .btn{min-height:58px;min-width:58px;padding:0 16px;border-radius:18px}
#simb{position:fixed;z-index:11;top:calc(max(14px,env(safe-area-inset-top)) + 34px);inset-inline-end:14px;font:700 .7rem var(--mono);letter-spacing:.2em;padding:8px 14px;border-radius:999px;background:var(--grad-hot);color:#fff}
#arrived{inset:auto;top:50%;left:50%;transform:translate(-50%,-50%);padding:30px 40px;font:700 2.6rem var(--display);text-align:center;border-color:rgba(61,255,168,.5);box-shadow:var(--glow),0 0 50px rgba(61,255,168,.25)}
/* car */
.car{width:46px;height:46px;filter:drop-shadow(0 0 10px rgba(34,228,255,.85)) drop-shadow(0 0 22px rgba(122,92,255,.5))}
.car.dot{width:22px;height:22px;border-radius:50%;background:var(--brand);border:3px solid #fff;box-shadow:0 0 0 0 rgba(34,228,255,.6);animation:pulse 2s infinite}
@keyframes pulse{0%{box-shadow:0 0 0 0 rgba(34,228,255,.55)}70%{box-shadow:0 0 0 22px rgba(34,228,255,0)}100%{box-shadow:0 0 0 0 rgba(34,228,255,0)}}
.pin{width:30px;height:30px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:var(--grad);border:3px solid #fff;box-shadow:0 0 16px rgba(155,107,255,.8)}
/* map chrome */
.maplibregl-popup-content{background:var(--glass2);color:var(--fg);border:1px solid var(--line2);border-radius:18px;padding:14px;box-shadow:var(--glow);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px)}
.maplibregl-popup-content .btn{min-height:48px}
.maplibregl-popup-close-button{color:var(--muted);font-size:20px;padding:2px 8px}
.maplibregl-popup-tip{display:none}
.maplibregl-ctrl-attrib{font-size:10px;opacity:.7}
.inc{font-size:24px;line-height:1;filter:drop-shadow(0 0 6px rgba(0,0,0,.9))}
#toast{position:fixed;z-index:30;left:50%;bottom:calc(100px + env(safe-area-inset-bottom));transform:translateX(-50%);padding:13px 22px;border-radius:999px;background:var(--grad);color:var(--act-fg);font-weight:700;box-shadow:0 10px 30px rgba(80,110,255,.4),var(--neon)}
#toast.bad{background:var(--grad-hot);color:#fff}
/* round action buttons */
#fabs{position:fixed;z-index:12;inset-inline-end:14px;bottom:calc(14px + env(safe-area-inset-bottom));display:flex;flex-direction:column;gap:12px;align-items:center}
.fab{width:66px;height:66px;border-radius:50%;border:1px solid rgba(34,228,255,.35);background:var(--glass2);display:grid;place-items:center;font-size:26px;color:var(--fg);
  box-shadow:0 8px 26px rgba(0,0,0,.45),inset 0 0 16px rgba(34,228,255,.10);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);transition:transform .12s}
.fab:active{transform:scale(.94)}
.fab.rep{width:78px;height:78px;background:var(--grad-hot);border:0;color:#fff;font-size:32px;box-shadow:0 10px 30px rgba(255,43,150,.45),0 0 24px rgba(255,61,110,.5)}
.fab.small{width:58px;height:58px;font-size:22px}
#recenter{position:static;min-height:0;padding:0}
/* speedometer: a glowing ring that fills with speed */
#speedo{position:fixed;z-index:11;inset-inline-start:14px;bottom:calc(14px + env(safe-area-inset-bottom));width:124px;height:124px;border-radius:50%;background:var(--glass2);border:1px solid var(--line2);
  display:grid;place-items:center;align-content:center;box-shadow:0 10px 30px rgba(0,0,0,.45),inset 0 0 24px rgba(34,228,255,.08);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px)}
#speedo .ring{position:absolute;inset:6px;width:calc(100% - 12px);height:calc(100% - 12px);transform:rotate(135deg);overflow:visible}
#speedo .trk{fill:none;stroke:var(--line2);stroke-width:7;stroke-linecap:round;stroke-dasharray:235.6 314.2}
#speedo .arc{fill:none;stroke:url(#spdg);stroke-width:7;stroke-linecap:round;stroke-dasharray:0 314.2;transition:stroke-dasharray .6s;filter:drop-shadow(0 0 5px rgba(34,228,255,.8))}
#speedo b{position:relative;font:700 2.6rem/1 var(--font);font-variant-numeric:tabular-nums;letter-spacing:-.02em}#speedo span{position:relative;font-size:.72rem;color:var(--muted);margin-top:2px}
#speedo.over{border-color:var(--bad);box-shadow:0 0 30px rgba(255,61,110,.5),inset 0 0 24px rgba(255,61,110,.2)}#speedo.over b{color:var(--bad)}#speedo.over .arc{stroke:var(--bad)}
body.preview #speedo{display:none}
body.nav #speedo{bottom:calc(122px + env(safe-area-inset-bottom))}
/* sheets */
.sheet{position:fixed;z-index:25;inset-inline:0;bottom:0;margin-inline:auto;width:min(660px,100%);padding:26px 20px calc(20px + env(safe-area-inset-bottom));background:var(--glass2);border:1px solid var(--line2);border-bottom:0;border-radius:28px 28px 0 0;
  backdrop-filter:blur(22px) saturate(150%);-webkit-backdrop-filter:blur(22px) saturate(150%);box-shadow:0 -14px 50px rgba(0,0,0,.5),0 -1px 30px rgba(34,228,255,.12);display:grid;gap:14px;max-height:88vh;overflow:auto;animation:up .28s ease-out}
.sheet::before{content:"";position:absolute;top:10px;left:50%;transform:translateX(-50%);width:54px;height:5px;border-radius:5px;background:var(--grad);box-shadow:var(--neon)}
@keyframes up{from{transform:translateY(30px);opacity:0}to{transform:none;opacity:1}}
.sheet h2{margin:0;font:700 1.7rem/1.1 var(--display)}.sheet .x{position:absolute;inset-inline-end:14px;top:14px;width:46px;height:46px;border-radius:50%;border:1px solid var(--line2);background:var(--field);font-size:20px;color:var(--muted)}
#veil{position:fixed;inset:0;z-index:24;background:rgba(2,6,14,.55);backdrop-filter:blur(2px);-webkit-backdrop-filter:blur(2px)}
.repgrid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
.repgrid button{min-height:118px;border:1px solid var(--line2);border-radius:20px;background:var(--field);display:grid;place-items:center;align-content:center;gap:8px;font-weight:500;font-size:1.02rem;transition:border-color .2s,box-shadow .2s}
.repgrid button:hover,.repgrid button:focus-visible{border-color:var(--brand);box-shadow:var(--neon)}
.repgrid button i{font-style:normal;font-size:44px;line-height:1;filter:drop-shadow(0 0 10px rgba(34,228,255,.35))}
.opt{display:flex;gap:14px;align-items:center;justify-content:space-between;padding:12px 0;border-bottom:1px solid var(--line)}
.opt b{display:block;font-weight:500}.opt small{color:var(--muted)}
.tog{flex:none;width:62px;height:36px;border-radius:18px;border:1px solid var(--line2);background:var(--field);position:relative;transition:background .2s}
.tog::after{content:"";position:absolute;top:3px;inset-inline-start:4px;width:28px;height:28px;border-radius:50%;background:#cfe3f3;transition:inset-inline-start .2s}
.tog[aria-checked=true]{background:var(--grad);border-color:transparent;box-shadow:var(--neon)}.tog[aria-checked=true]::after{inset-inline-start:30px;background:#fff}
.seg{display:inline-flex;border:1px solid var(--line2);border-radius:14px;overflow:hidden;background:var(--field)}
.seg button{min-height:48px;padding:0 16px;border:0;background:transparent;font-weight:500;color:var(--muted)}
.seg button[aria-pressed=true]{color:var(--act-fg);background:var(--grad);font-weight:700}
.disc{font-size:.75rem;color:var(--muted)}
.warn{color:var(--bad);font-weight:700}
/* reports and stations on the map */
.rep-m{width:44px;height:44px;border-radius:50%;display:grid;place-items:center;font-size:23px;background:#0b1322;border:2px solid var(--bad);box-shadow:0 0 14px rgba(255,61,110,.6)}
.rep-m.police{border-color:#4d7cff;box-shadow:0 0 14px rgba(77,124,255,.7)}
.fuel-m{width:40px;height:40px;border-radius:50%;display:grid;place-items:center;font-size:20px;background:#0b1322;border:2px solid var(--ok);box-shadow:0 0 14px rgba(61,255,168,.55);cursor:pointer}
.fuel-m.stop{border-color:var(--brand);width:46px;height:46px;box-shadow:var(--neon)}
#ask{position:fixed;z-index:20;left:50%;transform:translateX(-50%);bottom:calc(130px + env(safe-area-inset-bottom));padding:12px;display:flex;gap:10px;align-items:center;font-weight:700}
#ask .btn{min-height:52px}
/* list sheets (turns, fuel) */
.list{display:grid;gap:6px}
.list>button,.list>div{all:unset;cursor:pointer;display:grid;grid-template-columns:auto 1fr auto;gap:4px 14px;align-items:center;padding:10px 12px;border:1px solid var(--line);border-radius:16px;background:var(--field)}
.list>button:hover,.list>div:hover{border-color:rgba(34,228,255,.4)}
.list .ic{width:48px;height:48px;display:grid;place-items:center;border-radius:15px;background:var(--grad);box-shadow:0 0 14px rgba(90,120,255,.35);font-size:24px}
.list .ic svg{width:36px;height:36px}
.list .tx{font-weight:500;line-height:1.25}.list .sub{grid-column:2/-1;color:var(--muted);font-size:.85rem}
.list .d{font:700 .95rem var(--mono);color:var(--brand);white-space:nowrap;direction:ltr}
.list .msg{padding:14px 4px;color:var(--muted);border:0;background:none}
.list .go{min-height:46px;padding:0 14px;font-size:.92rem}
.stopbar{display:flex;gap:10px;align-items:center;justify-content:space-between;padding:8px 8px 8px 14px;border-radius:16px;border:1px solid rgba(61,255,168,.5);color:var(--ok);font-weight:500;box-shadow:inset 0 0 16px rgba(61,255,168,.1)}
.stopbar .btn{min-height:42px;font-size:.88rem;padding:0 12px}
.poileg{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px 12px;padding-bottom:6px}
.poileg>span{display:flex;gap:8px;align-items:center;font-size:.9rem}.poileg svg{flex:none}
.prices{grid-column:2/-1;display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.pc{display:inline-flex;gap:6px;align-items:baseline;padding:4px 10px;border-radius:999px;border:1px solid var(--line2);background:rgba(34,228,255,.06);font-size:.8rem;color:var(--muted)}
.pc b{font:700 .95rem var(--mono);color:var(--fg);direction:ltr}.pc.best{border-color:var(--ok);box-shadow:0 0 10px rgba(61,255,168,.3)}.pc.best b{color:var(--ok)}
.pc.max{background:transparent;border-style:dashed}
.pc i{font-style:normal;font-size:.7rem;opacity:.8}
.prices .upd{all:unset;cursor:pointer;padding:4px 10px;border-radius:999px;color:var(--brand);font-size:.82rem;border:1px solid rgba(34,228,255,.35)}
.official{padding:10px 14px;border-radius:16px;border:1px solid var(--line2);background:var(--field);font-size:.85rem;color:var(--muted);line-height:1.5}
.official b{color:var(--fg);font-family:var(--mono)}
.fsort{display:flex;gap:8px;flex-wrap:wrap}
.pform{display:grid;gap:10px}.pform label{display:flex;gap:12px;align-items:center;justify-content:space-between;font-weight:500}
.pform input{width:150px;min-height:52px;padding:0 14px;border:1px solid var(--line2);border-radius:14px;background:var(--field);font:700 1.2rem var(--mono);direction:ltr;text-align:center}
.pform input:focus{outline:0;border-color:var(--brand);box-shadow:var(--neon)}
.sheet.place{padding-top:0;gap:12px}
.plhero{--pc:#22e4ff;margin:0 -20px;height:170px;display:grid;place-items:center;border-radius:28px 28px 0 0;overflow:hidden;
  background:radial-gradient(circle at 50% 120%,color-mix(in srgb,var(--pc) 45%,transparent),transparent 65%),linear-gradient(160deg,rgba(10,22,44,.95),rgba(4,10,20,.95))}
:root[data-theme=light] .plhero{background:radial-gradient(circle at 50% 120%,color-mix(in srgb,var(--pc) 35%,transparent),transparent 65%),linear-gradient(160deg,#f4f9ff,#e3edf7)}
.plhero svg{filter:drop-shadow(0 0 18px var(--pc))}
.plhero.photo{height:220px}.plhero img{width:100%;height:100%;object-fit:cover;display:block}
.sheet.place::before{z-index:2}.sheet.place .x{z-index:2;background:rgba(0,0,0,.45);color:#fff;border-color:rgba(255,255,255,.25)}
.plhead{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.plhead h2{font-size:1.8rem}
.plcat{--pc:#22e4ff;padding:4px 12px;border-radius:999px;border:1px solid var(--pc);color:var(--pc);font-size:.85rem;font-weight:500;box-shadow:0 0 10px color-mix(in srgb,var(--pc) 35%,transparent)}
.plmeta{display:flex;gap:14px;flex-wrap:wrap;align-items:center;color:var(--muted);font-size:.95rem}
#plrate{color:#ffc93c;font-weight:700}#plopen.ok{color:var(--ok);font-weight:700}#plopen.closed{color:var(--bad);font-weight:700}
.place a.btn{text-decoration:none;color:var(--fg);flex:1 1 auto}
[hidden]{display:none!important}
@media (max-width:760px){#speedo{width:100px;height:100px}#speedo b{font-size:2rem}.fab{width:56px;height:56px}.fab.rep{width:66px;height:66px}body.nav #fabs{bottom:calc(122px + env(safe-area-inset-bottom))}.repgrid button{min-height:100px}#bd{font-size:2.2rem}#bi{width:76px;height:76px;border-radius:22px}#bi svg{width:56px;height:56px}#bt{font-size:1.2rem}}
@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}`;

/** Client app. Runs as a module after MapLibre loads. */
const APP = String.raw`
const NAVCORE=(function(){var __name=(f)=>f;return (${'__CORE__'})();})();
const $=(s)=>document.querySelector(s);
const F=(s,...a)=>String(s).replace(/\{(\d)\}/g,(_,i)=>a[i]??'');
const store={get(k,d){try{const v=localStorage.getItem(k);return v?JSON.parse(v):d}catch(e){return d}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}};
let toastT;function toast(m,bad){const t=$('#toast');t.textContent=m;t.className=bad?'bad':'';t.hidden=false;clearTimeout(toastT);toastT=setTimeout(()=>t.hidden=true,3200);}
async function api(path){const r=await fetch(path,{headers:{'x-hn':'1'}});const d=await r.json().catch(()=>({ok:false}));if(!r.ok||!d.ok){const e=new Error(d.error||'error');e.status=r.status;throw e;}return d;}

// ---------- icons (never mirrored: left is always left)
function arrowPath(deg){const r=deg*Math.PI/180,ex=24+17*Math.sin(r),ey=24-17*Math.cos(r);
  const h=(a)=>{const q=(deg+180+a)*Math.PI/180;return (ex+9*Math.sin(q)).toFixed(1)+' '+(ey-9*Math.cos(q)).toFixed(1);};
  return 'M24 44V24L'+ex.toFixed(1)+' '+ey.toFixed(1)+'M'+h(-35)+'L'+ex.toFixed(1)+' '+ey.toFixed(1)+'L'+h(35);}
const ANG={straight:0,'slight-right':45,right:90,'sharp-right':135,'slight-left':-45,left:-90,'sharp-left':-135,'fork-right':35,'fork-left':-35};
function icon(key,color){color=color||'#ffffff';let d;
  if(key==='uturn')d='M30 44V20a8 8 0 0 0-16 0v16M8 30l6 7 6-7';
  else if(key==='uturn-right')d='M18 44V20a8 8 0 0 1 16 0v16M40 30l-6 7-6-7';
  else if(key==='arrive')d='M24 44V8M24 8h16l-5 6 5 6H24';
  else if(key&&key.startsWith('roundabout')){const n=+(key.split('-')[1]||0);const a=[90,90,0,-90,-150][n]??0;const r=a*Math.PI/180;
    const sx=24+8*Math.sin(r),sy=22-8*Math.cos(r),ex=24+20*Math.sin(r),ey=22-20*Math.cos(r);
    return '<svg viewBox="0 0 48 48" fill="none" stroke="'+color+'" stroke-width="4.5" stroke-linecap="square"><circle cx="24" cy="22" r="8"/><path d="M24 44V30M'+sx.toFixed(1)+' '+sy.toFixed(1)+'L'+ex.toFixed(1)+' '+ey.toFixed(1)+'"/></svg>';}
  else d=arrowPath(ANG[key]??0);
  return '<svg viewBox="0 0 48 48" fill="none" stroke="'+color+'" stroke-width="4.5" stroke-linecap="square" stroke-linejoin="miter">'+'<path d="'+d+'"/></svg>';}

// Lanes, left to right as the driver sees them (never mirrored); the ones to take are lit.
function lanePaths(dirs){return dirs.map(k=>k==='uturn'?'M30 44V20a8 8 0 0 0-16 0v16M8 30l6 7 6-7':k==='uturn-right'?'M18 44V20a8 8 0 0 1 16 0v16M40 30l-6 7-6-7':arrowPath(ANG[k]??0));}
function lanesEl(lanes,small){const box=document.createElement('div');box.className='lanes'+(small?' sm':'');box.setAttribute('aria-label',L.lanes);
  for(const l of lanes){const c=l.ok?(dark()?'#5ff0ff':'#0077b3'):(dark()?'#3d5266':'#a3b3c2');const sp=document.createElement('span');sp.className='ln'+(l.ok?' on':'');
    sp.innerHTML='<svg viewBox="0 0 48 48" fill="none" stroke="'+c+'" stroke-width="5" stroke-linecap="square">'+lanePaths(l.d.length?l.d:['straight']).map(d=>'<path d="'+d+'"/>').join('')+'</svg>';box.appendChild(sp);}
  return box;}

// ---------- map
const dark=()=>document.documentElement.getAttribute('data-theme')!=='light';
const styleUrl=()=>TILES+'/styles/'+(dark()?'dark':'liberty');
let TRAFFIC=false,trafficOn=store.get('hn_traffic',true),cams=[],routes=null,routeIdx=0,routeFactor=1;
const map=new ml.Map({container:'map',style:styleUrl(),center:store.get('hn_last',[34.7818,32.0853]),zoom:13,attributionControl:false,
  pitchWithRotate:true,dragRotate:true,maxPitch:80,fadeDuration:0,
  // our own API needs the app header (it keeps other sites from using it)
  transformRequest:(url)=>url.startsWith(location.origin+'/api/')?{url,headers:{'x-hn':'1'}}:{url}});
map.addControl(new ml.AttributionControl({compact:true,customAttribution:'Routing © <a href="https://project-osrm.org" target="_blank" rel="noopener">OSRM</a> · Search © <a href="https://photon.komoot.io" target="_blank" rel="noopener">Photon</a>'}),LANG==='he'?'top-left':'top-right');
let routeData=null,remainData=null;
// Labels: Hebrew: name:he; else the local name if it's Hebrew or Latin; else English / Latin letters (never Armenian etc.)
function nameExpr(){const first=['slice',['coalesce',['get','name'],''],0,1];
  const readableLocal=['any',['all',['>=',first,'\u0590'],['<=',first,'\u05FF']],['<',first,'\u0250']];
  const latin=['coalesce',['get','name:en'],['get','name:latin'],['get','name_int'],['get','name']];
  return LANG==='he'?['coalesce',['get','name:he'],['case',readableLocal,['get','name'],latin]]:['case',['<',first,'\u0250'],['coalesce',['get','name:en'],['get','name']],latin];}
function labelLang(){const f=nameExpr();
  for(const l of map.getStyle().layers){if(l.type!=='symbol')continue;const tf=l.layout&&l.layout['text-field'];if(!tf)continue;const s=JSON.stringify(tf);
    if(s.includes('name'))try{map.setLayoutProperty(l.id,'text-field',f);}catch(e){}}}
function addRouteLayers(){
  if(!map.getSource('route'))map.addSource('route',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
  if(!map.getSource('alts'))map.addSource('alts',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
  if(!map.getSource('cams'))map.addSource('cams',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
  const before=map.getStyle().layers.find(l=>l.type==='symbol')?.id;
  if(TRAFFIC&&!map.getSource('traffic'))map.addSource('traffic',{type:'raster',tiles:[location.origin+'/api/traffic/{z}/{x}/{y}.png?dark='+(dark()?1:0)],tileSize:256,maxzoom:18,attribution:'Traffic © TomTom'});
  if(TRAFFIC&&!map.getLayer('traffic'))map.addLayer({id:'traffic',type:'raster',source:'traffic',layout:{visibility:trafficOn?'visible':'none'},paint:{'raster-opacity':.85}},before);
  if(!map.getLayer('alts-line'))map.addLayer({id:'alts-line',type:'line',source:'alts',layout:{'line-join':'round','line-cap':'round'},paint:{'line-color':dark()?'#4b5f86':'#8fa3c4','line-width':['interpolate',['linear'],['zoom'],10,4,16,9],'line-opacity':.85}},before);
  if(!map.getLayer('route-glow'))map.addLayer({id:'route-glow',type:'line',source:'route',layout:{'line-join':'round','line-cap':'round'},paint:{'line-color':dark()?'#22e4ff':'#3f7bff','line-width':['interpolate',['linear'],['zoom'],10,16,16,40,19,70],'line-blur':['interpolate',['linear'],['zoom'],10,10,16,22],'line-opacity':dark()?.45:.3}},before);
  if(!map.getLayer('route-casing'))map.addLayer({id:'route-casing',type:'line',source:'route',layout:{'line-join':'round','line-cap':'round'},paint:{'line-color':dark()?'#06203a':'#1d3f8f','line-width':['interpolate',['linear'],['zoom'],10,7,16,16,19,30],'line-opacity':.9}},before);
  if(!map.getLayer('route-line'))map.addLayer({id:'route-line',type:'line',source:'route',layout:{'line-join':'round','line-cap':'round'},paint:{'line-color':dark()?'#22e4ff':'#1f8bff','line-width':['interpolate',['linear'],['zoom'],10,4,16,10,19,22]}},before);
  if(!map.getLayer('route-core'))map.addLayer({id:'route-core',type:'line',source:'route',layout:{'line-join':'round','line-cap':'round'},paint:{'line-color':'#ffffff','line-width':['interpolate',['linear'],['zoom'],10,1,16,3,19,6],'line-opacity':dark()?.75:.6}},before);
  if(!map.getLayer('cams-dot'))map.addLayer({id:'cams-dot',type:'circle',source:'cams',minzoom:9,paint:{'circle-radius':['interpolate',['linear'],['zoom'],9,3,14,9],'circle-color':['case',['get','alert'],'#e53935','#7d8a91'],'circle-stroke-color':'#fff','circle-stroke-width':2}});
  if(!map.getLayer('cams-lim'))map.addLayer({id:'cams-lim',type:'symbol',source:'cams',minzoom:13,filter:['all',['get','alert'],['>',['get','limit'],0]],layout:{'text-field':['to-string',['get','limit']],'text-size':12,'text-offset':[0,1.4],'text-font':['Noto Sans Regular'],'text-allow-overlap':true},paint:{'text-color':dark()?'#fff':'#111','text-halo-color':dark()?'#000':'#fff','text-halo-width':1.5}});
  drawRoute();drawAlts();drawCams();}
function drawAlts(){const s=map.getSource('alts');if(!s)return;const f=(mode==='preview'&&routes)?routes.map((r,i)=>i===routeIdx?null:{type:'Feature',properties:{i},geometry:{type:'LineString',coordinates:r.geometry}}).filter(Boolean):[];
  s.setData({type:'FeatureCollection',features:f});}
function drawCams(){const s=map.getSource('cams');if(!s)return;s.setData({type:'FeatureCollection',features:cams.map(c=>({type:'Feature',properties:{id:c.id,alert:!!c.alert,limit:c.limit||0},geometry:{type:'Point',coordinates:[c.lon,c.lat]}}))});}
function drawRoute(){const s=map.getSource('route');if(!s)return;const c=remainData||routeData;
  s.setData({type:'FeatureCollection',features:c&&c.length>1?[{type:'Feature',properties:{},geometry:{type:'LineString',coordinates:c}}]:[]});}
// The stock dark map draws streets nearly black; lift them so the road network reads at a glance.
const DARK_ROADS={highway_minor:'#14243a',highway_path:'#111d2e',highway_major_inner:'#1c3555',highway_major_subtle:'#172b45',highway_major_casing:'rgba(34,228,255,.18)',highway_motorway_inner:'#1f4a78',highway_motorway_subtle:'#1a3858',highway_motorway_casing:'rgba(34,228,255,.35)'};
function tuneDark(){if(!dark())return;
  for(const l of map.getStyle().layers){try{
    if(l.type==='background')map.setPaintProperty(l.id,'background-color','#040a14');
    else if(l.type==='fill'&&/water/.test(l.id))map.setPaintProperty(l.id,'fill-color','#061a30');
    else if(l.type==='fill'&&/building/.test(l.id))map.setPaintProperty(l.id,'fill-color','#0b1628');
    else if(l.type==='fill'&&/park|landcover|landuse|wood|grass/.test(l.id))map.setPaintProperty(l.id,'fill-color','#06121c');
    else if(l.type==='symbol'&&/place|label/.test(l.id)&&l.paint&&l.paint['text-color']!=null)map.setPaintProperty(l.id,'text-color','#8fb2cf');
  }catch(e){}}
  for(const [id,c] of Object.entries(DARK_ROADS))if(map.getLayer(id))try{map.setPaintProperty(id,'line-color',c);}catch(e){}}
// A driver's-eye world: buildings in 3D, a horizon, and a glowing route.
function realityView(){
  const st=map.getStyle();
  if(!st.layers.some(l=>l.type==='fill-extrusion')&&st.sources.openmaptiles){
    const before=st.layers.find(l=>l.type==='symbol')?.id;
    try{map.addLayer({id:'hn-3d',type:'fill-extrusion',source:'openmaptiles','source-layer':'building',minzoom:14,
      paint:{'fill-extrusion-color':dark()?'#0e1d33':'#dde6ef','fill-extrusion-height':['coalesce',['get','render_height'],8],'fill-extrusion-base':['coalesce',['get','render_min_height'],0],'fill-extrusion-opacity':.9}},before);}catch(e){}}
  try{map.setSky(dark()?{'sky-color':'#02050c','horizon-color':'#0b3352','fog-color':'#061224','sky-horizon-blend':.6,'horizon-fog-blend':.7,'fog-ground-blend':.35}
    :{'sky-color':'#bfe2f7','horizon-color':'#eaf4fb','fog-color':'#eef4f9','sky-horizon-blend':.6,'horizon-fog-blend':.7,'fog-ground-blend':.35});}catch(e){}}
function addAreas(){
  if(!map.getSource('areas'))map.addSource('areas',{type:'geojson',data:{type:'FeatureCollection',features:AREAS.map(a=>({type:'Feature',properties:{name:a.name},geometry:{type:'Polygon',coordinates:[a.ring]}}))}});
  const before=map.getStyle().layers.find(l=>l.type==='symbol')?.id;
  if(!map.getLayer('areas-fill'))map.addLayer({id:'areas-fill',type:'fill',source:'areas',paint:{'fill-color':'#e53935','fill-opacity':.12}},before);
  if(!map.getLayer('areas-line'))map.addLayer({id:'areas-line',type:'line',source:'areas',paint:{'line-color':'#e53935','line-width':2,'line-dasharray':[2,2],'line-opacity':.8}},before);}

// ---------- places around: hotels, food, malls, fuel, chargers… as clear coloured badges
// [category, colour, tier (1 shows from far, 3 only up close), glyph (24×24 path)]
const POI=[
  ['hotel','#3b82f6',1,'M7 13c1.66 0 3-1.34 3-3S8.66 7 7 7s-3 1.34-3 3 1.34 3 3 3zm12-6h-8v7H3V5H1v15h2v-3h18v3h2v-9c0-2.21-1.79-4-4-4z'],
  ['mall','#a855f7',1,'M18 6h-2c0-2.21-1.79-4-4-4S8 3.79 8 6H6c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-6-2c1.1 0 2 .9 2 2h-4c0-1.1.9-2 2-2zm6 16H6V8h2v2c0 .55.45 1 1 1s1-.45 1-1V8h4v2c0 .55.45 1 1 1s1-.45 1-1V8h2v12z'],
  ['fuel','#16a34a',1,'M19.77 7.23l.01-.01-3.72-3.72L15 4.56l2.11 2.11c-.94.36-1.61 1.26-1.61 2.33 0 1.38 1.12 2.5 2.5 2.5.36 0 .69-.08 1-.21v7.21c0 .55-.45 1-1 1s-1-.45-1-1V14c0-1.1-.9-2-2-2h-1V5c0-1.1-.9-2-2-2H6c-1.1 0-2 .9-2 2v16h10v-7.5h1.5v5c0 1.38 1.12 2.5 2.5 2.5s2.5-1.12 2.5-2.5V9c0-.69-.28-1.32-.73-1.77zM12 10H6V5h6v5zm6 0c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1z'],
  ['charge','#0ea5e9',1,'M7 2v11h3v9l7-12h-4l4-8z'],
  ['food','#f97316',1,'M11 9H9V2H7v7H5V2H3v7c0 2.12 1.66 3.84 3.75 3.97V22h2.5v-9.03C11.34 12.84 13 11.12 13 9V2h-2v7zm5-3v8h2.5v8H21V2c-2.76 0-5 2.24-5 4z'],
  ['health','#dc2626',2,'M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-1 11h-4v4h-4v-4H6v-4h4V6h4v4h4v4z'],
  ['fun','#0d9488',2,'M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z'],
  ['cafe','#b45309',3,'M20 3H4v10c0 2.21 1.79 4 4 4h6c2.21 0 4-1.79 4-4v-3h2c1.11 0 2-.89 2-2V5c0-1.11-.89-2-2-2zm0 5h-2V5h2v3zM4 19h16v2H4z'],
  ['bar','#db2777',3,'M21 5V3H3v2l8 9v5H6v2h12v-2h-5v-5l8-9zM7.43 7L5.66 5h12.69l-1.78 2H7.43z'],
  ['grocery','#65a30d',3,'M7 18c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-.9-2-2-2zM1 2v2h2l3.6 7.59-1.35 2.45c-.16.28-.25.61-.25.96 0 1.1.9 2 2 2h12v-2H7.42c-.14 0-.25-.11-.25-.25l.03-.12.9-1.63h7.45c.75 0 1.41-.41 1.75-1.03l3.58-6.49A1.003 1.003 0 0 0 20 4H5.21l-.94-2H1zm16 16c-1.1 0-1.99.9-1.99 2s.89 2 1.99 2 2-.9 2-2-.9-2-2-2z'],
  ['pharmacy','#059669',3,'M10 3h4v7h7v4h-7v7h-4v-7H3v-4h7z'],
  ['bank','#ca8a04',3,'M4 10h3v7H4zm6.5 0h3v7h-3zM2 19h20v3H2zm15-9h3v7h-3zM12 1 2 6v2h20V6z'],
  ['atm','#15803d',3,'M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.310 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.830V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z'],
  ['school','#7c3aed',3,'M5 13.18v4L12 21l7-3.82v-4L12 17l-7-3.82zM12 3 1 9l11 6 9-4.91V17h2V9L12 3z'],
  ['worship','#0891b2',3,'M12 1.5 14.6 6H20l-2.7 4.5L20 15h-5.4L12 19.5 9.4 15H4l2.7-4.5L4 6h5.4zm0 3-1.3 2.2h2.6zm-3.6 3.7 1.3 2.3-1.3 2.3-1.3-2.3zm7.2 0 1.3 2.3-1.3 2.3-1.3-2.3zM10.5 8.3h3l1.4 2.2-1.4 2.3h-3l-1.4-2.3zm.2 5.9h2.6L12 16.5z'],
  ['parking','#2563eb',3,'M13 3H6v18h4v-6h3c3.31 0 6-2.69 6-6s-2.69-6-6-6zm.2 8H10V7h3.2c1.1 0 2 .9 2 2s-.9 2-2 2z'],
];
const POI_BY=Object.fromEntries(POI.map(x=>[x[0],x]));
const C=['get','class'],SC=['get','subclass'];
const POI_CAT=['case',
  ['==',C,'lodging'],'hotel',
  ['all',['==',C,'shop'],['in',SC,['literal',['mall','department_store']]]],'mall',
  ['all',['==',C,'fuel'],['==',SC,'charging_station']],'charge',
  ['==',C,'fuel'],'fuel',
  ['in',C,['literal',['restaurant','fast_food']]],'food',
  ['==',C,'hospital'],'health',
  ['in',C,['literal',['attraction','museum','cinema','theatre','stadium','zoo','castle','aquarium','theme_park']]],'fun',
  ['in',C,['literal',['cafe','ice_cream','bakery']]],'cafe',
  ['in',C,['literal',['bar','beer']]],'bar',
  ['all',['==',C,'grocery'],['==',SC,'supermarket']],'grocery',
  ['==',C,'pharmacy'],'pharmacy',
  ['==',C,'bank'],'bank',
  ['==',C,'atm'],'atm',
  ['all',['in',C,['literal',['school','college']]],['!=',SC,'kindergarten']],'school',
  ['==',C,'place_of_worship'],'worship',
  ['==',C,'parking'],'parking',
  ''];
const poiTier=(t)=>['in',POI_CAT,['literal',POI.filter(x=>x[2]===t).map(x=>x[0])]];
const poiIcon=(col,d,size)=>dark()
  ?'<svg xmlns="http://www.w3.org/2000/svg" width="'+size+'" height="'+size+'" viewBox="0 0 48 48"><circle cx="24" cy="24" r="22" fill="'+col+'" opacity=".22"/><circle cx="24" cy="24" r="19" fill="#081222" stroke="'+col+'" stroke-width="3"/><path transform="translate(12.5 12.5) scale(.96)" fill="'+col+'" d="'+d+'"/></svg>'
  :'<svg xmlns="http://www.w3.org/2000/svg" width="'+size+'" height="'+size+'" viewBox="0 0 48 48"><circle cx="24" cy="24" r="21" fill="'+col+'" stroke="#fff" stroke-width="3"/><path transform="translate(11.5 11.5) scale(1.04)" fill="#fff" d="'+d+'"/></svg>';
const poiImgs={};
function poiImages(){return Promise.all(POI.map(([k,col,,d])=>poiImgs[(dark()?'d':'l')+k]||(poiImgs[(dark()?'d':'l')+k]=new Promise(res=>{const im=new Image(96,96);im.onload=()=>res(im);im.onerror=()=>res(null);im.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(poiIcon(col,d,96));}))));}
const POI_LAYERS=['hn-poi-1','hn-poi-2','hn-poi-3'];
async function addPois(){const imgs=await poiImages();
  POI.forEach(([k],i)=>{const id='hn-'+k;if(!imgs[i])return;if(map.hasImage(id))map.removeImage(id);map.addImage(id,imgs[i],{pixelRatio:2});});
  const st=map.getStyle();if(!st.sources.openmaptiles)return;
  // the style's own POI icons are replaced by ours (the dark style has none at all)
  for(const l of st.layers)if(l['source-layer']==='poi'&&!l.id.startsWith('hn-'))try{map.setLayoutProperty(l.id,'visibility','none');}catch(e){}
  const name=nameExpr();
    [[1,13.5],[2,15],[3,16.8]].forEach(([t,minz])=>{const id='hn-poi-'+t;if(map.getLayer(id))return;
    map.addLayer({id,type:'symbol',source:'openmaptiles','source-layer':'poi',minzoom:minz,filter:poiTier(t),
      layout:{'icon-image':['concat','hn-',POI_CAT],'icon-size':['interpolate',['linear'],['zoom'],13,.75,16,.9,18,1.15],'icon-allow-overlap':false,'icon-padding':6,
        'symbol-sort-key':['+',t*1000,['coalesce',['get','rank'],50]],
        'text-field':name,'text-font':['Noto Sans Regular'],'text-size':12.5,'text-offset':[0,1.35],'text-anchor':'top','text-optional':true,'text-max-width':8,
        visibility:opts.pois?'visible':'none'},
      paint:{'text-color':dark()?'#dfe6ea':'#1f2a30','text-halo-color':dark()?'#040a14':'#fff','text-halo-width':1.6,'icon-opacity':1}});});
  poiMode();}
// While driving, only what matters from the road (hotels, malls, fuel, chargers, food, hospitals, attractions).
function poiMode(){const on=opts.pois;POI_LAYERS.forEach(id=>{if(!map.getLayer(id))return;const v=on&&!(id==='hn-poi-3'&&mode==='nav');map.setLayoutProperty(id,'visibility',v?'visible':'none');});
  // while driving, restaurants would crowd the road ahead: keep them for browsing
  if(map.getLayer('hn-poi-1'))map.setFilter('hn-poi-1',mode==='nav'?['all',poiTier(1),['!=',POI_CAT,'food']]:poiTier(1));}
const poiCatOf=(p)=>{const c=p.class,sc=p.subclass;
  if(c==='lodging')return 'hotel';if(c==='shop'&&(sc==='mall'||sc==='department_store'))return 'mall';if(c==='fuel')return sc==='charging_station'?'charge':'fuel';
  if(c==='restaurant'||c==='fast_food')return 'food';if(c==='hospital')return 'health';if(['attraction','museum','cinema','theatre','stadium','zoo','castle','aquarium','theme_park'].includes(c))return 'fun';
  if(['cafe','ice_cream','bakery'].includes(c))return 'cafe';if(c==='bar'||c==='beer')return 'bar';if(c==='grocery')return 'grocery';if(c==='pharmacy')return 'pharmacy';if(c==='bank')return 'bank';if(c==='atm')return 'atm';if((c==='school'||c==='college')&&sc!=='kindergarten')return 'school';if(c==='place_of_worship')return 'worship';if(c==='parking')return 'parking';return '';};
for(const id of POI_LAYERS)map.on('click',id,(e)=>{const f=e.features&&e.features[0];if(!f)return;window.__poiClick=Date.now();
  const pr=f.properties,cat=poiCatOf(pr),nm=readable((LANG==='he'?pr['name:he']||(/^[\u0590-\u05FF\u0000-\u024F]/.test(pr.name||'')?pr.name:pr['name:en']||pr['name:latin']||pr.name):pr['name:en']||pr['name:latin']||pr.name)||'');
  const ll=f.geometry.type==='Point'?f.geometry.coordinates:[e.lngLat.lng,e.lngLat.lat];
  openPlace({cat,name:nm,lon:ll[0],lat:ll[1]});});
// ---------- place card: photo, name, rating, open now, address, call, website, navigate
let placeSeq=0;
function openPlace(pl){const seq=++placeSeq;const col=POI_BY[pl.cat]?POI_BY[pl.cat][1]:'#22e4ff',glyph=POI_BY[pl.cat]?POI_BY[pl.cat][3]:'';
  const hero=$('#plhero');hero.style.setProperty('--pc',col);hero.innerHTML=poiIcon(col,glyph,84);hero.classList.remove('photo');
  $('#plname').textContent=pl.name||L['poi_'+pl.cat]||L.pin_name;$('#plcat').textContent=L['poi_'+pl.cat]||'';$('#plcat').hidden=!pl.name;$('#plcat').style.setProperty('--pc',col);
  const here=fix?fix.pos:null;$('#pldist').textContent=here?F(L.pl_from_you,NAVCORE.shortDistance(NAVCORE.dist(here,[pl.lon,pl.lat]),LANG)):'';
  for(const id of ['#plrate','#plopen','#pladdr','#plcall','#plweb','#plprices'])$(id).hidden=true;
  $('#plload').hidden=false;
  const place={name:pl.name||L['poi_'+pl.cat]||L.pin_name,detail:L['poi_'+pl.cat]||'',lon:pl.lon,lat:pl.lat,icon:pl.cat==='fuel'?'⛽':'📍'};
  const go=$('#plgo'),stopB=$('#plstop');
  go.textContent=mode==='nav'?L.pl_go_instead:'▶ '+L.pl_go;go.onclick=()=>{closeSheets();if(mode==='nav')cancelRoute();choose(place);};
  stopB.hidden=mode!=='nav';stopB.onclick=()=>{closeSheets();addStop(place);};
  if(pl.cat==='fuel'){const st={name:place.name,lon:pl.lon,lat:pl.lat};loadPrices([st]).then(()=>{if(seq!==placeSeq)return;const saved=fuel;fuel=[st];const b=$('#plprices');b.textContent='';b.appendChild(priceRow(st));b.hidden=false;fuel=saved;});}
  openSheet('#placesheet');
  api('/api/place?at='+pl.lon.toFixed(6)+','+pl.lat.toFixed(6)+'&name='+encodeURIComponent(pl.name||'')).then(d=>{if(seq!==placeSeq)return;$('#plload').hidden=true;const x=d.place;if(!x)return;
    if(x.name&&!pl.name)$('#plname').textContent=x.name;
    if(x.photos&&x.photos.length){const im=new Image();im.alt=x.name;im.onload=()=>{if(seq!==placeSeq)return;hero.textContent='';hero.appendChild(im);hero.classList.add('photo');};im.src='/api/place/photo?id='+encodeURIComponent(x.photos[0]);}
    if(x.rating!=null){const r=$('#plrate');r.hidden=false;r.textContent='★ '+(Math.round(x.rating*10)/10)+(x.ratings?' ('+x.ratings+')':'')+(x.price?' · '+'₪'.repeat(Math.min(4,x.price)):'');}
    if(x.hours){const o=$('#plopen');o.hidden=false;o.className=x.hours.open?'ok':'closed';o.textContent=x.hours.open?F(L.pl_open,x.hours.until||''):(x.hours.opens?F(L.pl_closed_opens,x.hours.opens):L.pl_closed);}
    if(x.address){$('#pladdr').hidden=false;$('#pladdr').textContent='📍 '+x.address;}
    if(x.phone){const c=$('#plcall');c.hidden=false;c.href='tel:'+x.phone.replace(/[^\d+]/g,'');c.textContent='📞 '+L.pl_call;}
    if(x.url&&/^https?:\/\//.test(x.url)){const w=$('#plweb');w.hidden=false;w.href=x.url;w.textContent='🌐 '+L.pl_web;}
    if(x.lon&&!pl.name){place.lon=x.lon;place.lat=x.lat;}}).catch(()=>{if(seq===placeSeq)$('#plload').hidden=true;});}
for(const id of POI_LAYERS){map.on('mouseenter',id,()=>map.getCanvas().style.cursor='pointer');map.on('mouseleave',id,()=>map.getCanvas().style.cursor='');}
function poiLegend(){const box=$('#poileg');if(!box)return;box.textContent='';
  for(const [k,col,,d] of POI){const it=document.createElement('span');it.innerHTML=poiIcon(col,d,30);const tx=document.createElement('span');tx.textContent=L['poi_'+k];it.appendChild(tx);box.appendChild(it);}}
map.on('style.load',()=>{labelLang();tuneDark();realityView();addAreas();addRouteLayers();addPois();});

// car marker
const carEl=document.createElement('div');carEl.className='car dot';
const carSvg='<svg viewBox="0 0 48 48" class="car" style="width:60px;height:60px"><defs><linearGradient id="cg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7ff6ff"/><stop offset=".55" stop-color="#22e4ff"/><stop offset="1" stop-color="#7a5cff"/></linearGradient></defs><path d="M24 4 42 42 24 33 6 42Z" fill="url(#cg)" stroke="#fff" stroke-width="2.2" stroke-linejoin="round"/></svg>';
const car=new ml.Marker({element:carEl,rotationAlignment:'map',pitchAlignment:'map'});
let carOnMap=false;
function setCar(pos,bearing,arrow){
  // Only toggle our own classes: MapLibre positions markers through its own class on this element.
  if(arrow&&carEl.classList.contains('dot')){carEl.classList.remove('dot');carEl.innerHTML=carSvg;}
  if(!arrow&&!carEl.classList.contains('dot')){carEl.classList.add('dot');carEl.innerHTML='';car.setRotation(0);}
  car.setLngLat(pos);if(arrow)car.setRotation(bearing);if(!carOnMap){car.addTo(map);carOnMap=true;}}

// ---------- state
let stop=null,stopMarker=null,mode='browse',fix=null,dest=null,route=null,trk=null,follow=true,muted=store.get('hn_muted',false),sim=null,lastReroute=0,rerouting=false,lastProg=null,firstFix=true,wake=null;
const show=(id,on)=>{$(id).hidden=!on;};
function setMode(m){mode=m;if(typeof poiMode==='function'&&map.isStyleLoaded())poiMode();document.body.classList.toggle('nav',m==='nav');document.body.classList.toggle('preview',m==='preview');show('#search',m==='browse');show('#preview',m==='preview');show('#fabs',m!=='preview');
  show('#banner',m==='nav');show('#navbar',m==='nav');show('#openfuel',m==='nav');show('#simb',m==='nav'&&!!sim);if(m!=='nav')show('#recenter',false);if(m==='browse')show('#arrived',false);}

// ---------- GPS
function gpsLine(f){const g=$('#gps');if(!f){return;}speedo(f);
  $('#fromx').hidden=!f.manual;
  if(f.manual){g.className='';g.textContent='📍 '+L.manual_loc+' · '+f.pos[1].toFixed(5)+', '+f.pos[0].toFixed(5);if(document.activeElement!==$('#from'))$('#from').value=f.name||L.pin_name;return;}
  if(document.activeElement!==$('#from'))$('#from').value='';
  const weak=f.accuracy>50;g.className=weak?'bad':'';
  g.textContent=weak?'⚠ '+L.weak_gps+' · ±'+Math.round(f.accuracy)+' m':'● '+L.gps_ok+' ±'+Math.round(f.accuracy)+' m';}
// Speedometer: GPS speed, or worked out from the last two fixes when the GPS doesn't give one.
let prevFix=null,kmh=0,limitNow=null;
function speedo(f){if(f.manual){$('#speedo').hidden=true;return;}
  let v=f.speed!=null&&!isNaN(f.speed)?f.speed:null;
  if(v==null&&prevFix&&f.time>prevFix.time){const dt=(f.time-prevFix.time)/1000;if(dt>0.5&&dt<10)v=NAVCORE.dist(prevFix.pos,f.pos)/dt;}
  prevFix=f;if(v==null)v=0;kmh=kmh*0.4+v*3.6*0.6;if(kmh<2)kmh=0;
  $('#speedo').hidden=false;$('#spd').textContent=String(Math.round(kmh));
  $('#spdarc').style.strokeDasharray=(235.6*Math.min(1,kmh/160)).toFixed(1)+' 314.2';
  $('#speedo').classList.toggle('over',limitNow!=null&&kmh>limitNow+3);}
// The view always comes back to the car a few seconds after the driver moves the map.
let lastTouch=0;
function autoFollow(){if(!follow&&fix&&!fix.manual&&Date.now()-lastTouch>8000){follow=true;show('#recenter',false);}}
function onFix(f){fix=f;gpsLine(f);
  if(firstFix){firstFix=false;store.set('hn_last',f.pos);if(mode==='browse')map.jumpTo({center:f.pos,zoom:16});}
  if(mode==='nav'&&trk)return guide(f);
  const moving=f.heading!=null&&(f.speed||0)>1.5;setCar(f.pos,f.heading||0,moving);
  autoFollow();
  if(mode==='browse'&&follow&&!firstFix){
    if(moving)map.easeTo({center:f.pos,bearing:f.heading,pitch:62,zoom:17,padding:{top:window.innerHeight*0.38,bottom:0,left:0,right:0},duration:900,easing:(t)=>t});
    else map.easeTo({center:f.pos,duration:800});}}
let watchId=null;
function startGps(){if(!('geolocation' in navigator)){gpsErr();return;}
  watchId=navigator.geolocation.watchPosition(p=>{if(sim)return;const c=p.coords;if(fix&&fix.manual&&!(c.accuracy<=100))return;
    gpsDenied=false;onFix({pos:[c.longitude,c.latitude],accuracy:c.accuracy||999,speed:c.speed,heading:(c.heading!=null&&!isNaN(c.heading))?c.heading:null,time:p.timestamp});},
    e=>{if(!fix||fix.manual)gpsErr();},{enableHighAccuracy:true,maximumAge:2000,timeout:30000});}
let gpsDenied=false;
function gpsErr(){gpsDenied=true;if(fix&&fix.manual)return;const g=$('#gps');g.className='bad';g.textContent=L.no_geo;}

// ---------- manual location: for when GPS is off, denied or wrong
let picking=false,pendingDest=null;
// The origin row: empty means "my location" (GPS); a chosen place is used as a manual starting point.
function startPick(dest){picking=true;pendingDest=dest||pendingDest;$('#search').classList.add('picking');$('#from').placeholder=L.from_none;$('#from').focus();}
function endPick(){picking=false;$('#search').classList.remove('picking');$('#from').placeholder=L.from_gps;}
$('#from').addEventListener('focus',()=>{picking=true;$('#search').classList.add('picking');$('#from').select();});
$('#q').addEventListener('focus',()=>{if(picking&&!$('#from').value)endPick();picking=false;$('#search').classList.remove('picking');});
function setManual(p){const f={pos:[p.lon,p.lat],accuracy:0,speed:null,heading:null,time:Date.now(),manual:true,name:p.name&&p.name!==L.pin_name?p.name:''};
  store.set('hn_manual',{lon:p.lon,lat:p.lat,name:f.name});firstFix=false;endPick();$('#from').blur();onFix(f);$('#from').value=f.name||L.pin_name;
  const d=pendingDest;pendingDest=null;if(d)return choose(d);
  map.easeTo({center:f.pos,zoom:16,duration:800});if(!$('#q').value)$('#q').focus();}
function useGps(){store.set('hn_manual',null);fix=null;firstFix=true;$('#fromx').hidden=true;$('#from').value='';$('#gps').className='';$('#gps').textContent=L.locating;
  if(watchId!=null)navigator.geolocation.clearWatch(watchId);startGps();}
$('#fromx').onclick=useGps;

// ---------- search
let sTimer,sSeq=0;
function renderPlaces(list,msg){const r=$('#res');r.textContent='';
  if(picking&&!msg&&!gpsDenied){const b=document.createElement('button');b.type='button';const n=document.createElement('b');n.textContent=L.from_gps;b.appendChild(n);b.onclick=()=>{$('#res').textContent='';useGps();endPick();$('#q').focus();};r.appendChild(b);}
  if(msg){const d=document.createElement('div');d.className='msg';d.textContent=msg;r.appendChild(d);return;}
  for(const p of list){p.name=readable(p.name);p.detail=readable(p.detail||'');const b=document.createElement('button');b.type='button';const n=document.createElement('b');n.textContent=p.name;b.appendChild(n);
    if(p.detail){const s=document.createElement('span');s.textContent=p.detail;b.appendChild(s);}b.onclick=()=>choose(p);r.appendChild(b);}}
async function doSearch(q){const seq=++sSeq;renderPlaces([],L.searching);
  try{const c=fix?fix.pos:map.getCenter().toArray();const d=await api('/api/search?q='+encodeURIComponent(q)+'&lat='+c[1].toFixed(3)+'&lon='+c[0].toFixed(3));
    if(seq!==sSeq)return;d.places.length?renderPlaces(d.places):renderPlaces([],L.no_results);}
  catch(e){if(seq===sSeq)renderPlaces([],L.search_failed);}}
for(const id of ['#q','#from'])$(id).addEventListener('input',()=>{clearTimeout(sTimer);const q=$(id).value.trim();if(q.length<2){$('#res').textContent='';return;}sTimer=setTimeout(()=>doSearch(q),380);});
$('#from').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();const q=$('#from').value.trim();if(q.length>=2){clearTimeout(sTimer);doSearch(q);}}});
$('#sf').addEventListener('submit',e=>{e.preventDefault();const q=$('#q').value.trim();if(q.length>=2){clearTimeout(sTimer);doSearch(q);}});
function chips(){const c=$('#chips');c.textContent='';const add=(txt,cls,fn)=>{const b=document.createElement('button');b.type='button';b.textContent=txt;if(cls)b.className=cls;b.onclick=fn;c.appendChild(b);};
  const h=store.get('hn_home',null),w=store.get('hn_work',null),rec=store.get('hn_recent',[]);
  if(h)add('🏠 '+L.home,'fav',()=>choose(h));if(w)add('💼 '+L.work,'fav',()=>choose(w));
  rec.forEach(p=>add('↺ '+p.name,'',()=>choose(p)));if(rec.length)add('✕ '+L.clear,'x',()=>{store.set('hn_recent',[]);chips();});}
function remember(p){const rec=store.get('hn_recent',[]).filter(x=>!(x.name===p.name&&Math.abs(x.lat-p.lat)<1e-4));rec.unshift({name:p.name,detail:p.detail||'',lon:p.lon,lat:p.lat});store.set('hn_recent',rec.slice(0,8));}

// ---------- street names in the driver's language
// Routers give local names (Armenian in Yerevan). Prefer the map's own name in our language;
// otherwise write it in Latin letters, so directions never show a script the driver can't read.
const FOREIGN_RUN=/[Ͱ-ϿЀ-ӿ԰-֏؀-ۿႠ-ჿ฀-๿぀-ヿ一-鿿가-힯][Ͱ-ϿЀ-ӿ԰-֏؀-ۿႠ-ჿ฀-๿぀-ヿ一-鿿가-힯\s.'’\-\d]*/g;
const TR={};
'ա a բ b գ g դ d ե e զ z է e ը y թ t ժ zh ի i լ l խ kh ծ ts կ k հ h ձ dz ղ gh ճ ch մ m յ y ն n շ sh ո o չ ch պ p ջ j ռ r ս s վ v տ t ր r ց ts ւ v փ p ք k օ o ֆ f և ev'
 .concat(' а a б b в v г g д d е e ё yo ж zh з z и i й y к k л l м m н n о o п p р r с s т t у u ф f х kh ц ts ч ch ш sh щ shch ъ  ы y ь  э e ю yu я ya і i ї yi є ye ґ g')
 .concat(' ა a ბ b გ g დ d ე e ვ v ზ z თ t ი i კ k ლ l მ m ნ n ო o პ p ჟ zh რ r ს s ტ t უ u ფ p ქ k ღ gh ყ q შ sh ჩ ch ც ts ძ dz წ ts ჭ ch ხ kh ჯ j ჰ h')
 .concat(' α a β v γ g δ d ε e ζ z η i θ th ι i κ k λ l μ m ν n ξ x ο o π p ρ r σ s ς s τ t υ y φ f χ ch ψ ps ω o ά a έ e ή i ί i ό o ύ y ώ o')
 .split(' ').reduce((k,v,i,a)=>{if(i%2===0)TR[v]=a[i+1]||'';return k;},0);
function translit(s){let t=s.toLowerCase().replace(/ու/g,'u');let out='';for(const ch of t)out+=ch in TR?TR[ch]:ch;
  if(FOREIGN_RUN.test(out)){FOREIGN_RUN.lastIndex=0;return null;}FOREIGN_RUN.lastIndex=0;
  return out.replace(/(^|[\s\-])([a-z])/g,(m,a,b)=>a+b.toUpperCase());}
function mapName(local){if(!map.isStyleLoaded())return null;try{
  const fs=map.querySourceFeatures('openmaptiles',{sourceLayer:'transportation_name',filter:['==',['get','name'],local]});
  for(const f of fs){const p=f.properties;const n=LANG==='he'?(p['name:he']||p['name:en']||p.name_en):(p['name:en']||p.name_en);if(n&&!FOREIGN_RUN.test(n)){FOREIGN_RUN.lastIndex=0;return n;}FOREIGN_RUN.lastIndex=0;}}catch(e){}return null;}
function readable(txt){if(!txt)return txt;return txt.replace(FOREIGN_RUN,(run,at,all)=>{const r=run.trim();if(!r)return run;const tail=run.slice(run.trimEnd().length);const n=mapName(r)||translit(r)||r;
  const glued=at>0&&/[\u05D0-\u05EA]/.test(all[at-1])&&/^[A-Za-z]/.test(n)&&(at<2||/[\s(]/.test(all[at-2]));return (glued?'-':'')+n+tail;});}
// Rewrites a route's names and directions in place (also what the voice will say).
function localizeRoute(r){if(!r||!r.steps)return r;for(const s of r.steps){s.text=readable(s.text);if(s.name)s.name=readable(s.name);}return r;}

// ---------- route preview
let destMarker=null;
const fmtTime=(s)=>{const m=Math.max(1,Math.round(s/60));return m<60?m+' '+L.min:Math.floor(m/60)+':'+String(m%60).padStart(2,'0')+' '+L.hr;};
const fmtClock=(s)=>{const d=new Date(Date.now()+s*1000);return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');};
const fmtKm=(m)=>(m/1000).toFixed(m>=10000?0:1)+' '+L.km;
let opts=Object.assign({tolls:false,areas:true,voice:true,pois:true},store.get('hn_opts',{}));
const avoidQ=()=>{const a=[];if(opts.tolls)a.push('tolls');if(opts.areas)a.push('areas');return a.length?'&avoid='+a.join(','):'';};
const ll=(lon,lat)=>lon.toFixed(6)+','+lat.toFixed(6);
function routeUrl(from,bearing){return '/api/route?from='+ll(from[0],from[1])+'&to='+ll(dest.lon,dest.lat)+(stop?'&via='+ll(stop.lon,stop.lat):'')+(bearing!=null?'&bearing='+Math.round(bearing):'')+avoidQ();}
async function choose(p){$('#res').textContent='';$('#q').blur();
  if(picking)return setManual(p);
  if(!fix){startPick(p);return;}
  $('#pmanual').hidden=!fix.manual;
  dest=p;remember(p);chips();
  const el=document.createElement('div');el.className='pin';
  if(destMarker)destMarker.remove();destMarker=new ml.Marker({element:el,anchor:'bottom'}).setLngLat([p.lon,p.lat]).addTo(map);
  setStop(null);
  $('#pname').textContent=p.name;$('#pdetail').textContent=p.detail||'';await planRoute();}
// Asks for routes from here to the destination (through the stop, if any) and shows them.
async function planRoute(){$('#psum').textContent=L.calc;$('#go').disabled=true;setMode('preview');
  $('#alts').textContent='';$('#pextra').textContent='';stopBar();
  try{const d=await api(routeUrl(fix.pos,null));
    routes=(d.routes||[d.route]).map(localizeRoute);routeShortest=d.shortest??0;routeBest=d.best??0;pickRoute(routeBest);
    $('#go').disabled=false;
    const b=new ml.LngLatBounds();routes.forEach(r=>r.geometry.forEach(c=>b.extend(c)));map.fitBounds(b,{padding:{top:80,bottom:80,left:LANG==='he'?60:600,right:LANG==='he'?600:60},duration:900,maxZoom:16});}
  catch(e){$('#psum').textContent=L.route_failed;}}
let routeBest=0,routeShortest=0;
const rTime=(r)=>r.traffic?r.traffic.seconds:r.duration;
/** The longest-driven road on a route: what people call it ("via Ayalon"). */
function viaName(r){const by={};for(const s of r.steps){if(s.name)by[s.name]=(by[s.name]||0)+s.distance;}let best='',m=0;for(const k in by)if(by[k]>m){m=by[k];best=k;}return best;}
function pickRoute(i){routeIdx=i;route=routes[i];routeData=route.geometry;remainData=null;routeFactor=route.traffic&&route.duration>0?route.traffic.seconds/route.duration:1;
  drawRoute();drawAlts();
  const s=$('#psum');s.textContent='';const add=(b,t)=>{const x=document.createElement('b');x.textContent=b;const y=document.createElement('span');y.textContent=t;s.append(x,y);};
  add(fmtTime(rTime(route)),'');add(fmtKm(route.distance),'');add(fmtClock(rTime(route)),L.arrive_at);
  const box=$('#alts');box.textContent='';
  if(routes.length>1)routes.forEach((r,j)=>{const b=document.createElement('button');b.type='button';b.setAttribute('role','radio');b.setAttribute('aria-checked',String(j===i));
    const t=document.createElement('span');t.className='t';t.textContent=j===routeBest&&j===routeShortest?L.fast_short:j===routeBest?L.fastest:j===routeShortest?L.shortest:L.alt_route;
    const m=document.createElement('span');m.className='m';m.textContent=fmtTime(rTime(r));
    const v=document.createElement('span');v.className='s';const vn=viaName(r);v.textContent=(vn?F(L.via,vn)+' · ':'')+fmtKm(r.distance);
    const jm=document.createElement('span');jm.className='j';jm.textContent=r.traffic&&r.traffic.delay>=60?F(L.jam,fmtTime(r.traffic.delay)):'';
    b.append(t,m,v,jm);b.onclick=()=>pickRoute(j);box.appendChild(b);});
  const hits=NAVCORE.camerasOnRoute(route.geometry,NAVCORE.cumulative(route.geometry),cams);
  const px=$('#pextra');px.textContent='';
  const tl=route.traffic?(route.traffic.live?'🚦 '+L.live_traffic:L.typical_traffic):L.no_traffic_data;
  px.append([tl,route.tolls?L.tolls_on_route:'',hits.length?F(L.cams_on_route,hits.length):''].filter(Boolean).join(' · '));
  if(route.areas&&route.areas.length){const w=document.createElement('div');w.className='warn';w.textContent=F(L.area_warn,route.areas.map(areaName).join(', '));px.appendChild(w);}}
const AREA_HE={Jenin:'ג׳נין',Tubas:'טובאס',Nablus:'שכם',Tulkarm:'טולכרם',Qalqilya:'קלקיליה',Salfit:'סלפית',Ramallah:'רמאללה','Al-Bireh':'אל-בירה',Jericho:'יריחו',Bethlehem:'בית לחם','Beit Sahour':'בית סאחור',Hebron:'חברון',Halhul:'חלחול',Dura:'דורא'};
const areaName=(n)=>LANG==='he'?(AREA_HE[n]||n):n;
map.on('click','alts-line',(e)=>{const f=e.features&&e.features[0];if(f&&mode==='preview'){pickRoute(f.properties.i);}});
$('#reverse').onclick=()=>{if(!dest||!fix)return;const here=fix.manual?{name:fix.name||L.pin_name,lon:fix.pos[0],lat:fix.pos[1]}:{name:L.my_location,lon:fix.pos[0],lat:fix.pos[1]};
  const there=dest;pendingDest=here;setManual(there);};
function cancelRoute(){stopSim();setStop(null);clearFuel();route=null;routes=null;trk=null;camW=null;camHits=[];routeData=null;remainData=null;drawRoute();drawAlts();clearIncidents();show('#bcam',false);if(destMarker){destMarker.remove();destMarker=null;}releaseWake();
  speechSynthesis&&speechSynthesis.cancel&&speechSynthesis.cancel();limitNow=null;show('#alertchip',false);setMode('browse');follow=true;if(fix){map.easeTo({center:fix.pos,zoom:16,pitch:0,bearing:0,padding:{top:0,bottom:0,left:0,right:0},duration:800});setCar(fix.pos,0,false);}}
$('#cancel').onclick=cancelRoute;
$('#sethome').onclick=()=>{if(dest){store.set('hn_home',{...dest,name:dest.name});chips();toast(L.saved+' · '+L.home);}};
$('#setwork').onclick=()=>{if(dest){store.set('hn_work',{...dest});chips();toast(L.saved+' · '+L.work);}};

// ---------- voice
let voice=null;
function pickVoice(){const vs=(window.speechSynthesis&&speechSynthesis.getVoices())||[];const want=LANG==='he'?['he','iw']:['en'];
  voice=vs.find(v=>want.some(w=>v.lang.toLowerCase().replace('_','-').startsWith(w)))||null;}
if(window.speechSynthesis){pickVoice();speechSynthesis.onvoiceschanged=pickVoice;}
function say(text){if(!text||muted||!window.speechSynthesis)return;try{const u=new SpeechSynthesisUtterance(text);u.lang=LANG==='he'?'he-IL':'en-US';if(voice)u.voice=voice;u.rate=1;speechSynthesis.speak(u);}catch(e){}}
function muteBtn(){if(muted&&window.speechSynthesis)speechSynthesis.cancel();$('#mute').textContent=muted?'🔇':'🔊';$('#mute').setAttribute('aria-label',muted?L.unmute:L.mute);}
$('#mute').onclick=()=>{muted=!muted;store.set('hn_muted',muted);muteBtn();if(muted)speechSynthesis&&speechSynthesis.cancel();};muteBtn();

// ---------- guidance
async function wakeOn(){try{if(navigator.wakeLock)wake=await navigator.wakeLock.request('screen');}catch(e){}}
function releaseWake(){try{wake&&wake.release();}catch(e){}wake=null;}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&mode==='nav')wakeOn();});
let camW=null,camHits=[],incs=[],incMarkers=[],incSaid=new Set(),lastCheck=0,checking=false;
function armRoute(){trk=NAVCORE.tracker(route,LANG);segHint=0;camHits=NAVCORE.camerasOnRoute(route.geometry,trk.cum,cams);camW=NAVCORE.cameraWatch(camHits,LANG);loadIncidents();placeReports();}
function startNav(simulate){if(!route)return;armRoute();follow=true;lastProg=null;lastCheck=Date.now();drawAlts();setMode('nav');wakeOn();
  if(simulate)startSim();show('#simb',!!sim);say(trk.intro());
  if(fix&&!sim)guide(fix);else if(sim)simTick();}
$('#go').onclick=()=>startNav(false);
$('#end').onclick=cancelRoute;
function zoomFor(speed){const s=speed||0;return s>25?16.6:s>14?17.3:18;}
function guide(f){const p=trk.update(f);lastProg=p;setCar(p.snapped,p.bearing,true);
  // trim the drawn route to what is still ahead
  const seg=Math.max(0,routeIndex(p));remainData=[p.snapped].concat(route.geometry.slice(seg+1));drawRoute();
  const n=p.next>=0?route.steps[p.next]:null;
  if(n){$('#bi').innerHTML=icon(n.icon);$('#bd').textContent=NAVCORE.shortDistance(p.toNext,LANG);$('#bt').textContent=rerouting?L.rerouting:n.text;
    const n2=route.steps[p.next+1];if(n2&&n2.start-n.start<300&&n2.type!=='arrive'){$('#bthen').hidden=false;$('#bti').innerHTML=icon(n2.icon,dark()?'#9aa7ae':'#4c575e');$('#btt').textContent=n2.text;}else $('#bthen').hidden=true;
    const bl=$('#blanes');const lk=n.lanes&&p.toNext<2000?p.next:-1;const lkey=lk+':'+Math.round(route.distance);if(bl.dataset.k!==lkey){bl.dataset.k=lkey;bl.textContent='';if(lk>=0)bl.appendChild(lanesEl(n.lanes));}bl.hidden=lk<0;}
  // past the stop: from here on, routes go straight to the destination
  if(stop&&route.steps.some((s,i)=>s.type==='waypoint'&&i<=p.step))setStop(null);
  const rt=p.remainingTime*routeFactor;
  $('#etaA').textContent=fmtClock(rt);$('#etaT').textContent=fmtTime(rt);$('#etaD').textContent=fmtKm(p.remaining);
  if(p.say)say(p.say);
  // cameras ahead
  if(camW){const c=camW.update(p.along,f.speed);const bc=$('#bcam');
    if(c.next&&c.dist<=1000){bc.hidden=false;bc.textContent='';const lim=document.createElement('span');lim.className='lim';lim.textContent=c.next.cam.limit||'📷';
      const tx=document.createElement('span');tx.textContent=NAVCORE.cameraName(c.next.cam.kind,LANG)+' · '+NAVCORE.shortDistance(c.dist,LANG);bc.append(lim,tx);limitNow=c.next.cam.limit||null;}else{bc.hidden=true;limitNow=null;}
    if(c.say)say(c.say);}
  // accidents and closures on the road ahead
  for(const it of incs){if(it.along==null||incSaid.has(it))continue;const d=it.along-p.along;if(d>0&&d<1500){incSaid.add(it);say(F(L.inc_ahead,incName(it.kind),NAVCORE.spokenDistance(d,LANG)));}}
  reportAlerts(p);
  if(TRAFFIC_TIMES&&!sim&&!checking&&Date.now()-lastCheck>240000)checkFaster(f,p);
  autoFollow();
  if(follow)map.easeTo({center:p.snapped,bearing:p.bearing,pitch:70,zoom:zoomFor(f.speed),duration:950,easing:(t)=>t,padding:padding()});
  if(p.arrived)return arrive();
  if(p.reroute)reroute(f);}
let segHint=0;function routeIndex(p){const g=route.geometry,cum=trk.cum;let i=Math.min(segHint,g.length-2);while(i>0&&cum[i]>p.along)i--;while(i<g.length-2&&cum[i+1]<=p.along)i++;segHint=i;return i;}
// Car low on the screen, the road ahead filling the view (like the car's own display).
function padding(){const h=window.innerHeight;return {top:h*0.5,bottom:h*0.04,left:0,right:0};}
async function reroute(f,force){const now=Date.now();if(rerouting||(!force&&now-lastReroute<8000)||!dest)return;rerouting=true;lastReroute=now;$('#bt').textContent=L.rerouting;
  try{const d=await api(routeUrl(f.pos,lastProg?(f.heading??lastProg.bearing):null));
    routes=(d.routes||[d.route]).map(localizeRoute);route=routes[d.best??0];routeData=route.geometry;routeFactor=route.traffic&&route.duration>0?route.traffic.seconds/route.duration:1;armRoute();say(trk.intro());}
  catch(e){}finally{rerouting=false;}}
/** Every few minutes: is there now a clearly faster way (traffic changed)? Switch, and say how much it saves. */
async function checkFaster(f,p){checking=true;lastCheck=Date.now();
  try{const d=await api(routeUrl(f.pos,p.bearing));
    const rs=(d.routes||[]).filter(r=>r.traffic).map(localizeRoute);if(!rs.length||mode!=='nav')return;
    const ahead=remainData||route.geometry;let same=null,sameOv=0;for(const r of rs){const ov=NAVCORE.overlap(r.geometry,ahead);if(ov>sameOv){sameOv=ov;same=r;}}
    const current=same&&sameOv>=0.8?same.traffic.seconds:p.remainingTime*routeFactor;
    const best=rs.reduce((a,b)=>a.traffic.seconds<=b.traffic.seconds?a:b);
    const saves=current-best.traffic.seconds;
    if(best!==same&&saves>=180&&saves>=current*0.08){routes=rs;route=best;routeData=route.geometry;remainData=null;routeFactor=route.traffic.seconds/route.duration;armRoute();drawRoute();
      const m=Math.round(saves/60);say(F(L.faster_found,m));toast(F(L.faster_found,m));}
    else if(same&&same.traffic&&same.duration>0)routeFactor=same.traffic.seconds/same.duration;}
  catch(e){}finally{checking=false;}}
function arrive(){stopSim();show('#arrived',true);releaseWake();setTimeout(()=>{if(mode==='nav')cancelRoute();},9000);}
for(const ev of ['dragstart','rotatestart','pitchstart'])map.on(ev,(e)=>{if(!e.originalEvent)return;lastTouch=Date.now();if(mode!=='preview'){follow=false;show('#recenter',true);}});
map.on('zoomstart',(e)=>{if(e.originalEvent)lastTouch=Date.now();});
$('#recenter').onclick=()=>{follow=true;show('#recenter',false);if(lastProg)map.easeTo({center:lastProg.snapped,bearing:lastProg.bearing,pitch:70,zoom:17.5,padding:padding(),duration:600});else if(fix)map.easeTo({center:fix.pos,zoom:16,duration:600});};
$('#overview').onclick=()=>{if(!route)return;follow=false;lastTouch=Date.now()+7000;show('#recenter',true);const b=new ml.LngLatBounds();(remainData||route.geometry).forEach(c=>b.extend(c));map.fitBounds(b,{padding:80,pitch:0,bearing:0,duration:900});};
map.on('click',(e)=>{if(mode!=='browse'||Date.now()-(window.__camClick||0)<300||Date.now()-(window.__poiClick||0)<300)return;if(map.queryRenderedFeatures(e.point,{layers:map.getLayer('cams-dot')?['cams-dot']:[]}).length)return;const p={name:L.pin_name,detail:e.lngLat.lat.toFixed(5)+', '+e.lngLat.lng.toFixed(5),lon:e.lngLat.lng,lat:e.lngLat.lat};
  if(picking)return setManual(p);
  const box=document.createElement('div');box.style.cssText='display:grid;gap:8px';
  const b=document.createElement('button');b.className='btn primary';b.textContent=L.pin_here;
  const h=document.createElement('button');h.className='btn ghost';h.textContent=L.im_here;box.append(b,h);
  const pop=new ml.Popup({closeButton:false,offset:12}).setLngLat(e.lngLat).setDOMContent(box).addTo(map);
  b.onclick=()=>{pop.remove();choose(p);};h.onclick=()=>{pop.remove();setManual(p);};});

// ---------- live data
const INC_ICON={accident:'💥',closed:'⛔',works:'🚧',lane:'⚠️',danger:'⚠️',broken:'🚗',weather:'🌧️'};
function incName(k){return L['inc_'+k]||L.inc_danger;}
function clearIncidents(){incMarkers.forEach(m=>m.remove());incMarkers=[];incs=[];incSaid=new Set();}
async function loadIncidents(){clearIncidents();if(!TRAFFIC_TIMES||!route)return;
  // look at the first ~60 km ahead (the service caps the area per request)
  const cum=trk?trk.cum:NAVCORE.cumulative(route.geometry);let w=180,s=90,e=-180,n=-90;
  for(let i=0;i<route.geometry.length&&cum[i]<60000;i++){const [x,y]=route.geometry[i];if(x<w)w=x;if(x>e)e=x;if(y<s)s=y;if(y>n)n=y;}
  w-=.01;s-=.01;e+=.01;n+=.01;if((e-w)*(n-s)>0.8){const cx=(w+e)/2,cy=(s+n)/2;w=cx-.45;e=cx+.45;s=cy-.44;n=cy+.44;}
  try{const d=await api('/api/incidents?bbox='+[w,s,e,n].map(v=>v.toFixed(4)).join(','));
    for(const it of d.incidents){if(!INC_ICON[it.kind])continue;const pr=NAVCORE.project(route.geometry,cum,[it.lon,it.lat]);if(pr.offset>60)continue;
      it.along=(it.kind==='accident'||it.kind==='closed')?pr.along:null;incs.push(it);
      const el=document.createElement('div');el.className='inc';el.textContent=INC_ICON[it.kind];el.title=incName(it.kind);
      incMarkers.push(new ml.Marker({element:el}).setLngLat([it.lon,it.lat]).addTo(map));if(incMarkers.length>=40)break;}}catch(e){}}
async function loadConfig(){try{const d=await api('/api/config');TRAFFIC=!!d.traffic&&d.trafficLayer!==false;REPORTS=d.reports!==false;TRAFFIC_TIMES=!!d.traffic;if(TRAFFIC&&map.isStyleLoaded())addRouteLayers();loadReports(true);}catch(e){}}
let TRAFFIC_TIMES=false;
async function loadCams(){const c=store.get('hn_cams',null);if(c&&Array.isArray(c.cams)){cams=c.cams;drawCams();}
  if(c&&Date.now()-c.at<6*3600e3)return;
  try{const d=await api('/api/cameras');cams=d.cameras;store.set('hn_cams',{cams,at:Date.now()});drawCams();}catch(e){}}
map.on('click','cams-dot',(e)=>{const f=e.features&&e.features[0];if(!f)return;const c=cams.find(x=>x.id===f.properties.id);if(!c)return;
  const box=document.createElement('div');const t=document.createElement('b');
  t.textContent=c.alert?NAVCORE.cameraName(c.kind,LANG):(L['cam_'+c.kind]||NAVCORE.cameraName(c.kind,LANG))+(c.active?'':' · '+L.cam_inactive);
  const l=document.createElement('div');l.textContent=c.limit?F(L.cam_limit,c.limit):'';const d=document.createElement('div');d.className='small';d.textContent=c.desc||'';
  const cr=document.createElement('div');cr.className='small';cr.textContent=L.cams_credit;box.append(t,l,d,cr);
  new ml.Popup({closeButton:true,offset:10,maxWidth:'300px'}).setLngLat(e.lngLat).setDOMContent(box).addTo(map);e.preventDefault&&e.preventDefault();window.__camClick=Date.now();});

// ---------- sheets
function openSheet(id){$('#veil').hidden=false;$(id).hidden=false;}
function closeSheets(){$('#veil').hidden=true;document.querySelectorAll('.sheet').forEach(x=>x.hidden=true);}
$('#veil').onclick=closeSheets;document.querySelectorAll('[data-close]').forEach(b=>b.onclick=closeSheets);
$('#openset').onclick=()=>{optBtns();themeBtns();openSheet('#setsheet');};
function optBtns(){poiLegend();$('#o-pois').setAttribute('aria-checked',String(opts.pois));$('#o-tolls').setAttribute('aria-checked',String(opts.tolls));$('#o-areas').setAttribute('aria-checked',String(opts.areas));$('#o-voice').setAttribute('aria-checked',String(!muted));}
for(const [id,k] of [['#o-tolls','tolls'],['#o-areas','areas']])$(id).onclick=()=>{opts[k]=!opts[k];store.set('hn_opts',opts);optBtns();if(map.getLayer('areas-fill'))map.setLayoutProperty('areas-fill','visibility','visible');};
$('#o-pois').onclick=()=>{opts.pois=!opts.pois;store.set('hn_opts',opts);optBtns();poiMode();};
$('#o-voice').onclick=()=>{muted=!muted;store.set('hn_muted',muted);muteBtn();optBtns();};

// ---------- driver reports
const REP_ICON={police:'🚓',accident:'💥',closure:'⛔',hazard:'⚠️',jam:'🐢',camera:'📷'};
const DIRECTIONAL=new Set(['police','jam','camera']);
let reps=[],repMarkers=new Map(),repSaid=new Set(),repAsked=new Set(),REPORTS=true;
async function apiPost(path,body){const r=await fetch(path,{method:'POST',headers:{'x-hn':'1','content-type':'application/json'},body:JSON.stringify(body)});const d=await r.json().catch(()=>({ok:false}));if(!r.ok||!d.ok)throw new Error(d.error||'error');return d;}
$('#openrep').onclick=()=>{if(!fix){toast(L.need_fix,true);return;}openSheet('#repsheet');};
document.querySelectorAll('[data-rep]').forEach(b=>b.onclick=async()=>{closeSheets();const h=lastProg?lastProg.bearing:(fix&&fix.heading);
  try{const d=await apiPost('/api/report',{kind:b.dataset.rep,lon:fix.pos[0],lat:fix.pos[1],h:h==null?null:Math.round(h)});toast(L.rep_thanks);repAsked.add(d.report.id);repSaid.add(d.report.id);loadReports(true);}
  catch(e){toast(L.rep_failed,true);}});
const ago=(t)=>{const m=Math.round((Date.now()-t)/60000);return m<1?L.rep_now:F(L.rep_age,m);};
function drawReports(){const keep=new Set(reps.map(r=>r.id));
  for(const [id,m] of repMarkers)if(!keep.has(id)){m.remove();repMarkers.delete(id);}
  for(const r of reps){if(repMarkers.has(r.id))continue;const el=document.createElement('div');el.className='rep-m '+r.kind;el.textContent=REP_ICON[r.kind]||'⚠️';el.title=L['rep_'+r.kind];
    el.addEventListener('click',(ev)=>{ev.stopPropagation();repPopup(r);});
    repMarkers.set(r.id,new ml.Marker({element:el}).setLngLat([r.lon,r.lat]).addTo(map));}}
function repPopup(r){const box=document.createElement('div');box.style.cssText='display:grid;gap:8px;min-width:200px';
  const t=document.createElement('b');t.textContent=(REP_ICON[r.kind]||'')+' '+L['rep_'+r.kind];const a=document.createElement('div');a.className='small';a.textContent=ago(r.t)+(r.up>1?' · 👍 '+r.up:'');
  const y=document.createElement('button');y.className='btn';y.textContent=L.rep_yes;const n=document.createElement('button');n.className='btn';n.textContent=L.rep_no;box.append(t,a,y,n);
  const pop=new ml.Popup({closeButton:true,offset:16}).setLngLat([r.lon,r.lat]).setDOMContent(box).addTo(map);
  y.onclick=()=>{pop.remove();voteRep(r,true);};n.onclick=()=>{pop.remove();voteRep(r,false);};}
async function voteRep(r,up){try{await apiPost('/api/report/vote',{id:r.id,lon:r.lon,lat:r.lat,up});toast(L.rep_voted);loadReports(true);}catch(e){}}
let repT=0,repBusy=false;
async function loadReports(force){if(!REPORTS||repBusy||(!force&&Date.now()-repT<15000))return;repBusy=true;repT=Date.now();
  try{const c=map.getCenter(),b=map.getBounds();const half=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
    const w=half(b.getWest(),c.lng-0.3,c.lng),e=half(b.getEast(),c.lng,c.lng+0.3),s=half(b.getSouth(),c.lat-0.3,c.lat),n=half(b.getNorth(),c.lat,c.lat+0.3);
    const d=await api('/api/reports?bbox='+[w,s,e,n].map(v=>v.toFixed(4)).join(','));reps=d.reports;drawReports();placeReports();}
  catch(e){}finally{repBusy=false;}}
map.on('moveend',()=>loadReports(false));setInterval(()=>loadReports(true),60000);
// Where each report sits on the current route (and whether it faces our way).
function placeReports(){if(!route||!trk)return;for(const r of reps){const pr=NAVCORE.project(route.geometry,trk.cum,[r.lon,r.lat]);
  r.along=null;if(pr.offset>60)continue;
  if(DIRECTIONAL.has(r.kind)&&r.h!=null&&NAVCORE.angleDiff(r.h,NAVCORE.pointAt(route.geometry,trk.cum,pr.along).bearing)>70)continue;r.along=pr.along;}}
function reportAlerts(p){const chip=$('#alertchip');let near=null;
  for(const r of reps){if(r.along==null)continue;const d=r.along-p.along;
    if(d>0&&d<1200&&(!near||d<near.d))near={r,d};
    if(d>0&&d<900&&!repSaid.has(r.id)){repSaid.add(r.id);say(F(L.rep_ahead,L['rep_'+r.kind],NAVCORE.spokenDistance(d,LANG)));}
    if(d<-30&&d>-200&&!repAsked.has(r.id)){repAsked.add(r.id);askStill(r);}}
  if(near){chip.hidden=false;chip.textContent='';const i=document.createElement('i');i.textContent=REP_ICON[near.r.kind];const s=document.createElement('span');s.textContent=L['rep_'+near.r.kind]+' · '+NAVCORE.shortDistance(near.d,LANG)+' · '+ago(near.r.t);chip.append(i,s);}
  else chip.hidden=true;}
let askT;function askStill(r){$('#asktx').textContent=(REP_ICON[r.kind]||'')+' '+L['rep_'+r.kind]+' · '+L.rep_still;$('#ask').hidden=false;clearTimeout(askT);askT=setTimeout(()=>$('#ask').hidden=true,10000);
  $('#askyes').onclick=()=>{$('#ask').hidden=true;voteRep(r,true);};$('#askno').onclick=()=>{$('#ask').hidden=true;voteRep(r,false);};}

// ---------- all turns: tap the banner (or the button in the preview)
function openSteps(){if(!route)return;const box=$('#steplist');box.textContent='';
  const cum=trk?trk.cum:NAVCORE.cumulative(route.geometry);const nav=mode==='nav'&&lastProg;const along=nav?lastProg.along:0;const from=nav?Math.max(0,lastProg.next):0;
  let n=0;
  route.steps.forEach((s,i)=>{if(i<from)return;if(!(s.speak||s.type==='arrive'||s.type==='waypoint'))return;if(s.type==='depart'&&nav)return;n++;
    const b=document.createElement('button');b.type='button';
    const ic=document.createElement('span');ic.className='ic';ic.innerHTML=icon(s.icon);
    const tx=document.createElement('span');tx.className='tx';tx.textContent=s.text;
    const d=document.createElement('span');d.className='d';d.textContent=NAVCORE.shortDistance(Math.max(0,s.start-along),LANG);
    b.append(ic,tx,d);
    if(s.lanes){const sub=document.createElement('span');sub.className='sub';sub.appendChild(lanesEl(s.lanes,true));b.appendChild(sub);}
    b.onclick=()=>{closeSheets();const pt=NAVCORE.pointAt(route.geometry,cum,s.start);follow=false;lastTouch=Date.now()+7000;if(mode==='nav')show('#recenter',true);
      map.easeTo({center:pt.point,zoom:17.2,bearing:pt.bearing,pitch:45,padding:{top:0,bottom:0,left:0,right:0},duration:900});};
    box.appendChild(b);});
  $('#stepsum').textContent=F(L.steps_count,n,fmtKm(nav?lastProg.remaining:route.distance));
  openSheet('#stepsheet');}
$('#banner').addEventListener('click',openSteps);$('#banner').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openSteps();}});
$('#psteps').onclick=openSteps;

// ---------- fuel stations along the route, and a stop on the way
let fuel=[],fuelMarkers=[],fuelSeq=0;
function clearFuel(){fuelMarkers.forEach(m=>m.remove());fuelMarkers=[];fuel=[];}
function setStop(s){stop=s;if(stopMarker){stopMarker.remove();stopMarker=null;}
  if(s){const el=document.createElement('div');el.className='fuel-m stop';el.textContent=s.icon||'⛽';stopMarker=new ml.Marker({element:el}).setLngLat([s.lon,s.lat]).addTo(map);}
  stopBar();}
function stopBar(){for(const id of ['#pstop','#fstop']){const box=$(id);if(!box)continue;box.textContent='';if(!stop)continue;
  const d=document.createElement('div');d.className='stopbar';const t=document.createElement('span');t.textContent=(stop.icon||'⛽')+' '+F(L.stop_now,stop.name);
  const x=document.createElement('button');x.type='button';x.className='btn';x.textContent=L.stop_remove;x.onclick=()=>{setStop(null);closeSheets();rePlan();};d.append(t,x);box.appendChild(d);}}
// New route after the stop changed: in the preview show it again, while driving switch now.
function rePlan(){if(!dest||!fix)return;if(mode==='preview')planRoute();else if(mode==='nav'){remainData=null;reroute(fix,true);}}
// The route ahead as at most ~150 points spaced along it (keeps the request small).
function lineAhead(){const cum=trk?trk.cum:NAVCORE.cumulative(route.geometry);const a=mode==='nav'&&lastProg?lastProg.along:0;const end=Math.min(cum[cum.length-1],a+200000);
  const n=Math.min(150,Math.max(2,Math.ceil((end-a)/150)));const out=[];for(let i=0;i<n;i++){out.push(NAVCORE.pointAt(route.geometry,cum,a+(end-a)*i/(n-1)).point);}return {line:out,cum,a};}
async function openFuel(){if(!route)return;const box=$('#fuellist');box.textContent='';stopBar();
  const msg=(t)=>{box.textContent='';const m=document.createElement('div');m.className='msg';m.textContent=t;box.appendChild(m);};
  msg(L.fuel_loading);openSheet('#fuelsheet');const seq=++fuelSeq;
  try{const {line,cum,a}=lineAhead();const d=await api('/api/fuel?line='+line.map(p=>p[0].toFixed(5)+','+p[1].toFixed(5)).join(';'));if(seq!==fuelSeq)return;
    clearFuel();$('#fsrc').textContent=d.source?'© '+d.source:'';
    for(const st of d.stations){const pr=NAVCORE.project(route.geometry,cum,[st.lon,st.lat]);if(pr.offset>(st.detour!=null?3000:500)||pr.along<a)continue;
      const rb=NAVCORE.pointAt(route.geometry,cum,pr.along).bearing,sb=NAVCORE.bearing(pr.point,[st.lon,st.lat]);const rel=((sb-rb)%360+360)%360;
      fuel.push({...st,along:pr.along,off:pr.offset,side:pr.offset<15?'':rel<180?'right':'left'});}
    fuel.sort((x,y)=>x.along-y.along);fuel=fuel.slice(0,25);
    if(!fuel.length)return msg(L.fuel_none);
    await loadPrices(fuel);if(seq!==fuelSeq)return;
    if(fsort!=='route')fuel.sort((x,y)=>(pv(x,fsort)??99)-(pv(y,fsort)??99)||x.along-y.along);
    box.textContent='';
    for(const st of fuel){const r=document.createElement('div');r.setAttribute('role','listitem');
      const ic=document.createElement('span');ic.className='ic';ic.textContent='⛽';
      const tx=document.createElement('span');tx.className='tx';tx.textContent=st.name||L.fuel_station;
      const go=document.createElement('button');go.type='button';go.className='btn primary go';go.textContent=L.fuel_add;go.onclick=(e)=>{e.stopPropagation();addStop(st);};
      const sub=document.createElement('span');sub.className='sub';sub.textContent=[F(L.fuel_in,NAVCORE.shortDistance(st.along-a,LANG)),st.detour>=60?F(L.fuel_detour,Math.round(st.detour/60)):st.side?L['side_'+st.side]:'',st.brand].filter(Boolean).join(' · ');
      r.append(ic,tx,go,sub,priceRow(st));r.onclick=()=>{closeSheets();follow=false;lastTouch=Date.now()+7000;if(mode==='nav')show('#recenter',true);map.easeTo({center:[st.lon,st.lat],zoom:16.5,pitch:30,padding:{top:0,bottom:0,left:0,right:0},duration:900});};
      box.appendChild(r);
      const el=document.createElement('div');el.className='fuel-m';el.textContent='⛽';el.title=st.name||L.fuel_station;el.addEventListener('click',(ev)=>{ev.stopPropagation();fuelPopup(st);});
      fuelMarkers.push(new ml.Marker({element:el}).setLngLat([st.lon,st.lat]).addTo(map));}}
  catch(e){if(seq===fuelSeq)msg(L.fuel_failed);}}
// ---------- fuel prices: reported by drivers, plus the regulated maximum for 95
let fsort=store.get('hn_fsort','route'),OFFICIAL=null;
const pv=(st,f)=>st.prices&&st.prices[f]?st.prices[f].v:null;
const ageTxt=(t)=>{const h=(Date.now()-t)/36e5;return h<1?L.rep_now:h<24?F(L.fp_age_h,Math.round(h)):F(L.fp_age_d,Math.round(h/24));};
const shekel=(v)=>'₪'+v.toFixed(2);
async function loadPrices(list){if(!list.length)return;
  try{const d=await api('/api/prices?pts='+list.map(x=>x.lon.toFixed(5)+','+x.lat.toFixed(5)).join(';'));OFFICIAL=d.official||null;list.forEach((x,i)=>x.prices=d.prices[i]||null);}catch(e){}
  const o=$('#foff');if(o){o.hidden=!OFFICIAL;if(OFFICIAL){const [y,m,dd]=OFFICIAL.from.split('-');o.innerHTML='';o.append(...fmtOfficial(dd+'.'+m));}}}
function fmtOfficial(date){const parts=F(L.fp_official,'\u0001','\u0002',date).split(/(\u0001|\u0002)/);
  return parts.map(x=>{if(x==='\u0001'||x==='\u0002'){const b=document.createElement('b');b.textContent=shekel(x==='\u0001'?OFFICIAL.self95:OFFICIAL.full95);return b;}return document.createTextNode(x);});}
function priceRow(st){const row=document.createElement('span');row.className='prices';
  const best=(f)=>{const vs=fuel.map(x=>pv(x,f)).filter(v=>v!=null);return vs.length>1?Math.min(...vs):null;};
  let any=false;
  for(const f of ['s95','f95','dsl']){const v=pv(st,f);if(v==null)continue;any=true;const c=document.createElement('span');c.className='pc'+(v===best(f)?' best':'');
    const l=document.createElement('span');l.textContent=L['fp_'+f];const b=document.createElement('b');b.textContent=shekel(v);const a=document.createElement('i');a.textContent=ageTxt(st.prices[f].t);c.append(l,b,a);row.appendChild(c);}
  if(!any&&OFFICIAL){const c=document.createElement('span');c.className='pc max';c.textContent=F(L.fp_max,OFFICIAL.self95.toFixed(2));row.appendChild(c);}
  const u=document.createElement('button');u.type='button';u.className='upd';u.textContent=L.fp_update;u.onclick=(e)=>{e.stopPropagation();openPrice(st);};row.appendChild(u);
  return row;}
document.querySelectorAll('[data-fsort]').forEach(b=>{b.setAttribute('aria-pressed',String(b.dataset.fsort===fsort));b.onclick=()=>{fsort=b.dataset.fsort;store.set('hn_fsort',fsort);
  document.querySelectorAll('[data-fsort]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));if(route)openFuel();};});
let priceSt=null;
function openPrice(st){if(kmh>10){toast(L.fp_stopped,true);return;}priceSt=st;closeSheets();$('#pstname').textContent='⛽ '+(st.name||L.fuel_station);
  for(const f of ['s95','f95','dsl']){const i=$('#pf-'+f);i.value='';i.placeholder=pv(st,f)!=null?pv(st,f).toFixed(2):f==='s95'&&OFFICIAL?OFFICIAL.self95.toFixed(2):f==='f95'&&OFFICIAL?OFFICIAL.full95.toFixed(2):'0.00';}
  openSheet('#pricesheet');setTimeout(()=>$('#pf-s95').focus(),300);}
$('#pform').addEventListener('submit',async(e)=>{e.preventDefault();if(!priceSt)return;const body={lon:priceSt.lon,lat:priceSt.lat};let n=0;
  for(const f of ['s95','f95','dsl']){const raw=$('#pf-'+f).value.trim().replace(',','.');if(!raw)continue;const v=Number(raw);if(!(v>=4&&v<=15)){toast(L.fp_bad,true);return;}body[f]=v;n++;}
  if(!n){closeSheets();return;}
  try{await apiPost('/api/price',body);closeSheets();toast(L.fp_saved);if(route&&mode!=='browse')openFuel();}catch(err){toast(L.rep_failed,true);}});

function fuelPopup(st){const box=document.createElement('div');box.style.cssText='display:grid;gap:8px;min-width:200px';const t=document.createElement('b');t.textContent='⛽ '+(st.name||L.fuel_station);
  const b=document.createElement('button');b.className='btn primary';b.textContent=L.fuel_add;box.append(t,b);
  const pop=new ml.Popup({closeButton:true,offset:16}).setLngLat([st.lon,st.lat]).setDOMContent(box).addTo(map);b.onclick=()=>{pop.remove();addStop(st);};}
function addStop(st){closeSheets();setStop({name:st.name||L.fuel_station,lon:st.lon,lat:st.lat,icon:st.icon});clearFuel();toast(F(L.stop_added,stop.name));rePlan();}
$('#pfuel').onclick=openFuel;$('#openfuel').onclick=openFuel;

// ---------- test drive (kept for automated checks only; no button): moves along the route as if driving, through the same guidance code
function startSim(){const cum=NAVCORE.cumulative(route.geometry);sim={along:0,cum,timer:setInterval(simTick,1000)};}
function stopSim(){if(sim){clearInterval(sim.timer);sim=null;show('#simb',false);}}
function simTick(){if(!sim||!route)return;const st=route.steps.find((s,i)=>s.start<=sim.along&&(i===route.steps.length-1||route.steps[i+1].start>sim.along));
  const v=st&&st.duration>0?Math.max(6,Math.min(30,st.distance/st.duration)):12;sim.along+=v*SIMX;
  const pt=NAVCORE.pointAt(route.geometry,sim.cum,sim.along);onFix({pos:pt.point,accuracy:5,speed:v,heading:pt.bearing,time:Date.now()});}

// ---------- theme & language
function themeBtns(){document.querySelectorAll('[data-theme-opt]').forEach(b=>b.setAttribute('aria-pressed',String((b.dataset.themeOpt==='dark')===dark())));}
document.querySelectorAll('[data-theme-opt]').forEach(b=>b.onclick=()=>{document.documentElement.setAttribute('data-theme',b.dataset.themeOpt);store.set('hn_theme',b.dataset.themeOpt);themeBtns();map.setStyle(styleUrl());});
document.querySelectorAll('[data-lang]').forEach(b=>b.onclick=()=>{document.cookie='hn_lang='+b.dataset.lang+'; path=/; max-age=31536000; samesite=lax; secure';location.reload();});
themeBtns();chips();setMode('browse');
{const m=store.get('hn_manual',null);if(m&&typeof m.lon==='number'){firstFix=false;onFix({pos:[m.lon,m.lat],accuracy:0,speed:null,heading:null,time:Date.now(),manual:true,name:m.name||''});map.jumpTo({center:[m.lon,m.lat],zoom:15});}}
startGps();loadConfig();loadCams();
window.__hnmap=map;window.__hn={readable,choose,sim:()=>startNav(true),pitch:()=>map.getPitch(),state:()=>({stop,fuel:fuel.length,lanes:route?route.steps.filter(s=>s.lanes).length:0,speed:Math.round(kmh),reports:reps.length,opts,mode,follow,dest,steps:route&&route.steps.length,prog:lastProg,sim:!!sim,routes:routes&&routes.length,routeIdx,cams:cams.length,camHits:camHits.length,traffic:TRAFFIC})};
`;

export function appPage(lang: Lang, origin: string) {
  const t = dict(lang);
  const L = JSON.stringify(t).replace(/</g, '\\u003c');
  const simx = 1;
  const app = APP.replace('__CORE__', () => navCore.toString());
  void origin;
  return `<!doctype html><html lang="${lang}" dir="${lang === 'he' ? 'rtl' : 'ltr'}" data-theme="dark"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover,user-scalable=no">
<meta name="referrer" content="no-referrer"><meta name="theme-color" content="#03060c"><meta name="color-scheme" content="dark light">
<title>${t.title}</title><link rel="icon" href="/icon.svg"><link rel="manifest" href="/manifest.webmanifest">
<script nonce="{{NONCE}}">try{var s=JSON.parse(localStorage.getItem('hn_theme')||'null');if(s==='light'||s==='dark')document.documentElement.setAttribute('data-theme',s)}catch(e){}</script>
<link rel="stylesheet" href="/vendor/maplibre-gl.css"><style>${CSS}</style></head><body>
<div id="map" role="application" aria-label="Map"></div>
<section id="search" class="hud br" aria-label="${t.where}">
  <div class="od">
    <div class="odrow"><span class="odl" aria-hidden="true"></span><input id="from" type="search" enterkeyhint="search" autocomplete="off" spellcheck="false" placeholder="${t.from_gps}" aria-label="${t.from_label}" maxlength="120"><button class="mini" id="fromx" type="button" aria-label="${t.use_gps}" hidden>✕</button></div>
    <form id="sf" role="search" class="odrow"><span class="odl to" aria-hidden="true"></span><input id="q" type="search" enterkeyhint="search" autocomplete="off" spellcheck="false" placeholder="${t.where}" aria-label="${t.to_label}" maxlength="120"><button class="btn primary" type="submit" aria-label="${t.where}"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21"/></svg></button></form>
  </div>
  <div id="res" role="listbox"></div>
  <div id="chips"></div>
  <div id="gps" role="status" aria-live="polite">${t.locating}</div>
</section>
<section id="preview" class="hud br" hidden>
  <div class="kicker">◆ ROUTE</div>
  <div id="pname"></div><div id="pdetail" class="small"></div>
  <div class="sum" id="psum"></div>
  <div id="alts" role="radiogroup"></div>
  <div class="small" id="pextra"></div>
  <div id="pstop"></div>
  <div class="row"><button class="btn primary" id="go" type="button">▶ ${t.start}</button></div>
  <div class="row"><button class="btn ghost" id="psteps" type="button">${t.steps_btn}</button><button class="btn ghost" id="pfuel" type="button">${t.fuel_btn}</button></div>
  <div class="row"><button class="btn" id="sethome" type="button">🏠 ${t.set_home}</button><button class="btn" id="setwork" type="button">💼 ${t.set_work}</button><button class="btn" id="reverse" type="button">${t.reverse}</button><button class="btn danger" id="cancel" type="button">${t.cancel}</button></div>
  <div class="small" id="pmanual" hidden>${t.manual_note}</div>
  <div class="small">${t.safety}</div>
</section>
<section id="banner" class="hud" hidden aria-live="polite" role="button" tabindex="0" title="${t.steps_hint}">
  <div id="bi"></div><div id="bd"></div><div id="bt"></div>
  <div id="blanes" hidden></div>
  <span id="bmore" aria-hidden="true">☰</span>
  <div id="bthen" hidden><span id="bti"></span><span id="btt"></span></div>
  <div id="bcam" hidden></div>
  <div id="alertchip" hidden></div>
</section>
<section id="navbar" class="hud br" hidden>
  <div id="eta"><b id="etaA">--:--</b><span>${t.arrive_at}</span><b id="etaT" style="font-size:1.4rem;color:var(--fg)"></b><b id="etaD" style="font-size:1.4rem;color:var(--fg)"></b></div>
  <button class="btn" id="mute" type="button"></button><button class="btn" id="overview" type="button" aria-label="${t.overview}">⤢</button><button class="btn danger" id="end" type="button">${t.end}</button>
</section>
<div id="fabs">
  <button class="fab small" id="recenter" type="button" aria-label="${t.recenter}" hidden>◎</button>
  <button class="fab small" id="openfuel" type="button" aria-label="${t.fuel_title}" hidden>⛽</button>
  <button class="fab small" id="openset" type="button" aria-label="${t.settings}">⚙</button>
  <button class="fab rep" id="openrep" type="button" aria-label="${t.report}">⚠</button>
</div>
<div id="speedo" hidden aria-live="off"><svg class="ring" viewBox="0 0 120 120" aria-hidden="true"><defs><linearGradient id="spdg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#22e4ff"/><stop offset=".6" stop-color="#7a5cff"/><stop offset="1" stop-color="#ff2bd6"/></linearGradient></defs><circle class="trk" cx="60" cy="60" r="50"/><circle class="arc" id="spdarc" cx="60" cy="60" r="50"/></svg><b id="spd">0</b><span>${t.kmh}</span></div>
<div id="veil" hidden></div>
<section id="repsheet" class="sheet" hidden role="dialog" aria-label="${t.report_title}">
  <h2>${t.report_title}</h2><button class="x" type="button" data-close aria-label="${t.close}">✕</button>
  <div class="repgrid">
    <button type="button" data-rep="police"><i>🚓</i>${t.rep_police}</button>
    <button type="button" data-rep="accident"><i>💥</i>${t.rep_accident}</button>
    <button type="button" data-rep="closure"><i>⛔</i>${t.rep_closure}</button>
    <button type="button" data-rep="hazard"><i>⚠️</i>${t.rep_hazard}</button>
    <button type="button" data-rep="jam"><i>🐢</i>${t.rep_jam}</button>
    <button type="button" data-rep="camera"><i>📷</i>${t.rep_camera}</button>
  </div>
</section>
<section id="setsheet" class="sheet" hidden role="dialog" aria-label="${t.settings}">
  <h2>${t.settings}</h2><button class="x" type="button" data-close aria-label="${t.close}">✕</button>
  <div class="kicker">◆ ${t.route_opts}</div>
  <div class="opt"><div><b>${t.avoid_tolls}</b><small>${t.avoid_tolls_sub}</small></div><button class="tog" type="button" role="switch" id="o-tolls" aria-checked="false" aria-label="${t.avoid_tolls}"></button></div>
  <div class="opt"><div><b>${t.avoid_areas}</b><small>${t.avoid_areas_sub}</small></div><button class="tog" type="button" role="switch" id="o-areas" aria-checked="true" aria-label="${t.avoid_areas}"></button></div>
  <div class="opt"><div><b>${t.voice}</b></div><button class="tog" type="button" role="switch" id="o-voice" aria-checked="true" aria-label="${t.voice}"></button></div>
  <div class="kicker">◆ ${t.display}</div>
  <div class="opt"><div><b>${t.pois}</b><small>${t.pois_sub}</small></div><button class="tog" type="button" role="switch" id="o-pois" aria-checked="true" aria-label="${t.pois}"></button></div>
  <div id="poileg" class="poileg"></div>
  <div class="opt"><div class="seg" role="group" aria-label="${t.theme}"><button type="button" data-theme-opt="light">☀️ ${t.day}</button><button type="button" data-theme-opt="dark">🌙 ${t.night}</button></div>
  <div class="seg" role="group" aria-label="${t.language}"><button type="button" data-lang="he" aria-pressed="${lang === 'he'}">עברית</button><button type="button" data-lang="en" aria-pressed="${lang === 'en'}">English</button></div></div>
  <div class="disc">${t.safety}<br>${t.disclaimer}<br>${t.cams_credit}</div>
</section>
<section id="stepsheet" class="sheet" hidden role="dialog" aria-label="${t.steps_title}">
  <h2>${t.steps_title}</h2><button class="x" type="button" data-close aria-label="${t.close}">✕</button>
  <div class="small" id="stepsum"></div>
  <div class="list" id="steplist"></div>
</section>
<section id="fuelsheet" class="sheet" hidden role="dialog" aria-label="${t.fuel_title}">
  <h2>${t.fuel_title}</h2><button class="x" type="button" data-close aria-label="${t.close}">✕</button>
  <div id="fstop"></div>
  <div class="official" id="foff" hidden></div>
  <div class="seg fsort" role="group" aria-label="${t.fp_sort}"><button type="button" data-fsort="route" aria-pressed="true">${t.fp_sort_route}</button><button type="button" data-fsort="s95" aria-pressed="false">${t.fp_sort_95}</button><button type="button" data-fsort="dsl" aria-pressed="false">${t.fp_sort_dsl}</button></div>
  <div class="list" id="fuellist"></div>
  <div class="disc" id="fsrc"></div>
</section>
<section id="placesheet" class="sheet place" hidden role="dialog" aria-label="${t.pl_title}">
  <div id="plhero" class="plhero"></div><button class="x" type="button" data-close aria-label="${t.close}">✕</button>
  <div class="plhead"><h2 id="plname"></h2><span id="plcat" class="plcat"></span></div>
  <div class="plmeta"><span id="plrate" hidden></span><span id="plopen" hidden></span><span id="pldist"></span><span id="plload" class="small">${t.pl_loading}</span></div>
  <div id="pladdr" class="small" hidden></div>
  <div id="plprices" hidden></div>
  <div class="row"><button class="btn primary" id="plgo" type="button"></button><button class="btn ghost" id="plstop" type="button" hidden>${t.fuel_add}</button></div>
  <div class="row"><a class="btn" id="plcall" hidden></a><a class="btn" id="plweb" target="_blank" rel="noopener noreferrer" hidden></a></div>
</section>
<section id="pricesheet" class="sheet" hidden role="dialog" aria-label="${t.fp_title}">
  <h2 id="pstname">${t.fp_title}</h2><button class="x" type="button" data-close aria-label="${t.close}">✕</button>
  <div class="small">${t.fp_hint}</div>
  <form class="pform" id="pform">
    <label>${t.fp_s95}<input id="pf-s95" inputmode="decimal" autocomplete="off" placeholder="0.00" maxlength="5"></label>
    <label>${t.fp_f95}<input id="pf-f95" inputmode="decimal" autocomplete="off" placeholder="0.00" maxlength="5"></label>
    <label>${t.fp_dsl}<input id="pf-dsl" inputmode="decimal" autocomplete="off" placeholder="0.00" maxlength="5"></label>
    <button class="btn primary" type="submit">${t.fp_save}</button>
  </form>
</section>
<div id="ask" class="hud br" hidden><span id="asktx"></span><button class="btn" id="askyes" type="button">${t.rep_yes}</button><button class="btn" id="askno" type="button">${t.rep_no}</button></div>
<div id="simb" hidden>${t.sim_badge}</div>
<div id="arrived" class="hud br" hidden>${t.arrived}</div>
<div id="toast" role="status" hidden></div>
<script type="module" nonce="{{NONCE}}">
import * as ml from '/vendor/maplibre-gl.mjs';
const L=${L};const LANG=${JSON.stringify(lang)};const TILES=${JSON.stringify(TILES)};const SIMX=${simx};const AREAS=${JSON.stringify(AREA_A)};
${app}
</script></body></html>`;
}
