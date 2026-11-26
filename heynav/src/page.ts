import { navCore } from './core';
import { dict, type Lang } from './i18n';
import { AREA_A } from './areas.gen';

const TILES = 'https://tiles.openfreemap.org';

const RANGE_HE = 'U+0307-0308,U+0590-05FF,U+200C-2010,U+20AA,U+25CC,U+FB1D-FB4F';
const RANGE_LATIN = 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD';
const face = (family: string, file: string, weight: number, range: string) =>
  `@font-face{font-family:'${family}';src:url(/fonts/${file}.woff2) format('woff2');font-weight:${weight};font-display:swap;unicode-range:${range}}`;
const FONTS = [
  face('Karantina', 'karantina-hebrew-700-normal', 700, RANGE_HE), face('Karantina', 'karantina-latin-700-normal', 700, RANGE_LATIN),
  face('Heebo', 'heebo-hebrew-400-normal', 400, RANGE_HE), face('Heebo', 'heebo-latin-400-normal', 400, RANGE_LATIN),
  face('Heebo', 'heebo-hebrew-700-normal', 700, RANGE_HE), face('Heebo', 'heebo-latin-700-normal', 700, RANGE_LATIN),
  face('JetBrains Mono', 'jetbrains-mono-latin-700-normal', 700, RANGE_LATIN),
].join('');

export const iconSvg = () =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M20 0H96V76L76 96H0V20Z" fill="#ffb020"/><path d="M48 16 74 78 48 64 22 78Z" fill="#07090b"/></svg>`;

export const manifest = (lang: Lang) => ({
  name: 'HeyNav', short_name: 'HeyNav', description: dict(lang).title, start_url: '/', scope: '/', display: 'standalone',
  background_color: '#07090b', theme_color: '#07090b', lang, dir: lang === 'he' ? 'rtl' : 'ltr',
  icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
});

const CSS = `${FONTS}
:root{--bg:#07090b;--card:rgba(14,18,21,.94);--fg:#e6ecef;--muted:#9aa7ae;--line:#1e262c;--line2:#2a343b;--brand:#ffb020;--act:#ffb020;--act2:#e79400;--act-fg:#07090b;--ok:#3fe0d0;--bad:#ff5a4e;
  --font:Heebo,system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;--mono:'JetBrains Mono',ui-monospace,Menlo,Consolas,monospace;--display:Karantina,Heebo,sans-serif;
  --cut:polygon(12px 0,100% 0,100% calc(100% - 12px),calc(100% - 12px) 100%,0 100%,0 12px);color-scheme:dark}
:root[data-theme=light]{--bg:#edefea;--card:rgba(255,255,255,.95);--fg:#0b0f12;--muted:#4c575e;--line:#cbd1d3;--line2:#b5bdc1;--brand:#965700;--act:#f2a20c;--act2:#d98900;--ok:#00796d;--bad:#c62828;color-scheme:light}
*{box-sizing:border-box}html,body{margin:0;height:100%;overflow:hidden;background:var(--bg);color:var(--fg);font:400 18px/1.4 var(--font);-webkit-text-size-adjust:100%}
button,input{font:inherit;color:inherit}button{cursor:pointer;touch-action:manipulation}
#map{position:fixed;inset:0}
.hud{position:fixed;z-index:10;background:var(--card);border:1px solid var(--line2);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
.hud.br::before,.hud.br::after{content:"";position:absolute;width:16px;height:16px;pointer-events:none}
.hud.br::before{top:-1px;inset-inline-end:-1px;border-top:2px solid var(--brand);border-inline-end:2px solid var(--brand)}
.hud.br::after{bottom:-1px;inset-inline-start:-1px;border-bottom:2px solid var(--brand);border-inline-start:2px solid var(--brand)}
.kicker{font:700 .72rem var(--mono);letter-spacing:.16em;color:var(--muted);text-transform:uppercase}
.btn{min-height:56px;padding:0 22px;border:1px solid var(--line2);background:transparent;font-weight:700;font-size:1.05rem;display:inline-flex;align-items:center;justify-content:center;gap:8px}
.btn.primary{border:0;background:linear-gradient(180deg,var(--act),var(--act2));color:var(--act-fg);clip-path:var(--cut)}
.btn.ghost{color:var(--brand)}.btn.danger{border-color:var(--bad);color:var(--bad)}
.btn:disabled{opacity:.5}
/* search */
#search{top:max(14px,env(safe-area-inset-top));inset-inline-start:14px;width:min(560px,calc(100% - 28px));padding:12px;display:grid;gap:10px}
#sf{display:flex;gap:8px}#q{flex:1;min-width:0;min-height:60px;padding:0 16px;border:1px solid var(--line2);background:var(--bg);font-size:max(18px,1.2rem)}
#q:focus{outline:2px solid var(--brand);outline-offset:-2px}
#res{display:grid;max-height:min(52vh,460px);overflow:auto}#res:empty{display:none}
#res button{all:unset;cursor:pointer;display:grid;gap:2px;padding:12px 10px;border-bottom:1px solid var(--line)}
#res button:hover,#res button:focus-visible{background:rgba(255,176,32,.08)}
#res b{font-weight:700}#res span{color:var(--muted);font-size:.9rem}#res .msg{padding:12px 10px;color:var(--muted)}
#chips{display:flex;gap:8px;overflow-x:auto;scrollbar-width:none}#chips::-webkit-scrollbar{display:none}#chips:empty{display:none}
#chips button{flex:none;min-height:46px;padding:0 14px;border:1px solid var(--line2);background:var(--bg);font-weight:700;white-space:nowrap;max-width:260px;overflow:hidden;text-overflow:ellipsis}
#chips button.fav{border-color:var(--brand);color:var(--brand)}#chips button.x{color:var(--muted);font-weight:400}
.od{display:grid;gap:8px}.odrow{display:flex;gap:8px;align-items:center;position:relative}
.odl{flex:none;width:14px;height:14px;border:3px solid var(--ok);border-radius:50%}.odl.to{border:0;border-radius:0;background:var(--brand);clip-path:polygon(50% 100%,0 35%,15% 0,85% 0,100% 35%);width:16px;height:18px}
.odrow:first-child::after{content:"";position:absolute;inset-inline-start:6px;top:calc(50% + 10px);height:22px;border-inline-start:2px dotted var(--muted)}
#from{flex:1;min-width:0;min-height:52px;padding:0 14px;border:1px solid var(--line2);background:var(--bg);font-size:max(17px,1.05rem)}
#from::placeholder{color:var(--ok);opacity:1}#from:focus{outline:2px solid var(--ok);outline-offset:-2px}
#search.picking #from{outline:2px solid var(--ok);outline-offset:-2px}
.mini{flex:none;min-width:44px;min-height:44px;border:1px solid var(--line2);background:var(--bg);color:var(--muted)}
#alts{display:grid;gap:8px}#alts:empty{display:none}
#alts button{all:unset;cursor:pointer;display:grid;grid-template-columns:1fr auto;gap:2px 12px;padding:10px 12px;border:1px solid var(--line2);background:var(--bg)}
#alts button[aria-checked=true]{border-color:var(--brand);box-shadow:inset 3px 0 0 var(--brand)}[dir=rtl] #alts button[aria-checked=true]{box-shadow:inset -3px 0 0 var(--brand)}
#alts .t{font-weight:700}#alts .m{font:700 1.15rem var(--mono);color:var(--ok);text-align:end}#alts .s{color:var(--muted);font-size:.85rem}#alts .j{color:var(--bad);font-size:.85rem;text-align:end}
#bcam{grid-column:1/-1;display:flex;gap:10px;align-items:center;margin-top:8px;padding:8px 12px;background:rgba(255,90,78,.14);border:1px solid var(--bad);font-weight:700}
#bcam .lim{display:grid;place-items:center;width:44px;height:44px;border-radius:50%;border:4px solid #e53935;background:#fff;color:#111;font:700 1.05rem var(--mono)}
.tbtn{min-height:44px;padding:0 12px;font-weight:700;color:var(--muted)}.tbtn[aria-pressed=true]{color:var(--brand);box-shadow:inset 0 -2px 0 var(--brand)}
.inc{font-size:24px;line-height:1;filter:drop-shadow(0 1px 2px #000)}
#gps{font:700 .78rem var(--mono);letter-spacing:.06em;color:var(--ok);direction:ltr;text-align:start}#gps.bad{color:var(--bad);font-family:var(--font);letter-spacing:0;direction:inherit;font-size:.95rem}
/* preview */
#preview{bottom:calc(14px + env(safe-area-inset-bottom));inset-inline-start:14px;width:min(560px,calc(100% - 28px));padding:16px;display:grid;gap:12px}
#pname{font:700 2.1rem/1 var(--display)}#pdetail{color:var(--muted)}
.sum{display:flex;gap:18px;align-items:baseline;flex-wrap:wrap}.sum b{font:700 1.7rem var(--mono);color:var(--ok)}.sum span{color:var(--muted)}
.row{display:flex;gap:10px;flex-wrap:wrap}.row .btn{flex:1 1 auto;white-space:nowrap}
.small{font-size:.85rem;color:var(--muted)}
/* guidance */
#banner{top:max(14px,env(safe-area-inset-top));inset-inline-start:14px;width:min(620px,calc(100% - 28px));display:grid;grid-template-columns:auto 1fr;gap:4px 18px;padding:16px 18px;align-items:center;
  background:linear-gradient(180deg,#0e1215f2,#0b0e11f2);border-color:var(--brand)}
:root[data-theme=light] #banner{background:#fffffff5}
#bi{grid-row:span 2;width:96px;height:96px;display:grid;place-items:center;background:linear-gradient(180deg,var(--act),var(--act2));clip-path:var(--cut)}
#bi svg{width:76px;height:76px}
#bd{font:700 3rem/1 var(--mono);color:var(--brand);direction:ltr;text-align:start}
#bt{font-size:1.45rem;font-weight:700;line-height:1.2}
#bthen{grid-column:1/-1;display:flex;gap:10px;align-items:center;border-top:1px solid var(--line2);padding-top:10px;margin-top:6px;color:var(--muted);font-size:1rem}
#bthen svg{width:30px;height:30px;flex:none}
#navbar{bottom:calc(14px + env(safe-area-inset-bottom));inset-inline-start:14px;width:min(620px,calc(100% - 28px));padding:12px 14px;display:flex;align-items:center;gap:16px}
#eta{flex:1;display:flex;gap:18px;align-items:baseline;flex-wrap:wrap}
#eta b{font:700 2rem var(--mono);color:var(--ok)}#eta span{color:var(--muted);font-size:.95rem}
#navbar .btn{min-height:60px;min-width:60px;padding:0 16px}
#recenter{position:fixed;z-index:11;inset-inline-end:14px;bottom:calc(120px + env(safe-area-inset-bottom))}
#simb{position:fixed;z-index:11;top:calc(max(14px,env(safe-area-inset-top)) + 34px);inset-inline-end:14px;font:700 .8rem var(--mono);letter-spacing:.14em;padding:8px 12px;background:var(--bad);color:#fff}
#arrived{inset:auto;top:50%;left:50%;transform:translate(-50%,-50%);padding:28px 36px;font:700 3rem var(--display);text-align:center}
.car{width:46px;height:46px;filter:drop-shadow(0 0 10px rgba(255,176,32,.6))}
.car.dot{width:24px;height:24px;border-radius:50%;background:var(--ok);border:3px solid #fff;filter:drop-shadow(0 0 8px var(--ok))}
.pin{width:30px;height:30px;background:var(--brand);clip-path:polygon(50% 100%,0 35%,15% 0,85% 0,100% 35%)}
.maplibregl-popup-content{background:var(--card);color:var(--fg);border:1px solid var(--line2);border-radius:0;padding:12px}
.maplibregl-popup-tip{display:none}
.maplibregl-ctrl-attrib{font-size:11px}
.seg{display:inline-flex;border:1px solid var(--line2);background:var(--card)}.seg button{min-height:44px;padding:0 12px;border:0;background:transparent;font-weight:700;color:var(--muted)}
.seg button[aria-pressed=true]{color:var(--brand);box-shadow:inset 0 -2px 0 var(--brand)}
#toast{position:fixed;z-index:30;left:50%;bottom:calc(100px + env(safe-area-inset-bottom));transform:translateX(-50%);padding:12px 18px;background:var(--act);color:var(--act-fg);font-weight:700;clip-path:var(--cut)}
#toast.bad{background:var(--bad);color:#fff}
/* round action buttons, bottom corner */
#fabs{position:fixed;z-index:12;inset-inline-end:14px;bottom:calc(14px + env(safe-area-inset-bottom));display:flex;flex-direction:column;gap:12px;align-items:center}
.fab{width:68px;height:68px;border-radius:50%;border:1px solid var(--line2);background:var(--card);display:grid;place-items:center;font-size:28px;box-shadow:0 6px 20px rgba(0,0,0,.35);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
.fab.rep{width:78px;height:78px;background:linear-gradient(180deg,#ff6b5e,#d93a2f);border:0;color:#fff;font-size:32px}
.fab.small{width:58px;height:58px;font-size:22px}
#recenter{position:static;min-height:0;padding:0;clip-path:none}
/* speedometer */
#speedo{position:fixed;z-index:11;inset-inline-start:14px;width:112px;height:112px;border-radius:50%;background:var(--card);border:4px solid var(--line2);display:grid;place-items:center;align-content:center;gap:0;box-shadow:0 6px 20px rgba(0,0,0,.35);
  bottom:calc(14px + env(safe-area-inset-bottom));transition:border-color .3s}
#speedo b{font:700 2.6rem/1 var(--mono)}#speedo span{font-size:.8rem;color:var(--muted)}
#speedo.over{border-color:var(--bad);background:rgba(255,90,78,.18)}#speedo.over b{color:var(--bad)}
body.preview #speedo{display:none}
body.nav #speedo{bottom:calc(122px + env(safe-area-inset-bottom))}
/* sheets */
.sheet{position:fixed;z-index:25;inset-inline:0;bottom:0;margin-inline:auto;width:min(640px,100%);padding:18px 18px calc(18px + env(safe-area-inset-bottom));background:var(--card);border:1px solid var(--line2);border-bottom:0;
  backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);box-shadow:0 -10px 40px rgba(0,0,0,.45);display:grid;gap:14px;max-height:88vh;overflow:auto}
.sheet h2{margin:0;font:700 1.9rem/1 var(--display)}.sheet .x{position:absolute;inset-inline-end:12px;top:10px;width:48px;height:48px;border:0;background:none;font-size:24px;color:var(--muted)}
#veil{position:fixed;inset:0;z-index:24;background:rgba(0,0,0,.45)}
.repgrid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
.repgrid button{min-height:118px;border:1px solid var(--line2);background:var(--bg);display:grid;place-items:center;align-content:center;gap:6px;font-weight:700;font-size:1.05rem}
.repgrid button i{font-style:normal;font-size:44px;line-height:1}
.opt{display:flex;gap:14px;align-items:center;justify-content:space-between;padding:12px 0;border-bottom:1px solid var(--line)}
.opt b{display:block}.opt small{color:var(--muted)}
.tog{flex:none;width:62px;height:36px;border-radius:18px;border:0;background:var(--line2);position:relative}
.tog::after{content:"";position:absolute;top:4px;inset-inline-start:4px;width:28px;height:28px;border-radius:50%;background:#fff;transition:inset-inline-start .2s}
.tog[aria-checked=true]{background:var(--ok)}.tog[aria-checked=true]::after{inset-inline-start:30px}
.sheet .seg{display:inline-flex;border:1px solid var(--line2)}.sheet .seg button{min-height:48px;padding:0 16px;border:0;background:transparent;font-weight:700;color:var(--muted)}
.sheet .seg button[aria-pressed=true]{color:var(--brand);box-shadow:inset 0 -3px 0 var(--brand)}
.disc{font-size:.75rem;color:var(--muted)}
/* reports on the map */
.rep-m{width:44px;height:44px;border-radius:50%;display:grid;place-items:center;font-size:24px;background:#fff;border:3px solid #d93a2f;box-shadow:0 2px 8px rgba(0,0,0,.4)}
.rep-m.police{border-color:#2563eb}
#ask{position:fixed;z-index:20;left:50%;transform:translateX(-50%);bottom:calc(130px + env(safe-area-inset-bottom));padding:12px;display:flex;gap:10px;align-items:center;font-weight:700}
#ask .btn{min-height:52px}
.warn{color:var(--bad);font-weight:700}
#alertchip{grid-column:1/-1;display:flex;gap:10px;align-items:center;margin-top:8px;padding:8px 12px;background:rgba(37,99,235,.16);border:1px solid #2563eb;font-weight:700}
#alertchip i{font-style:normal;font-size:28px}
/* banner: tap for all turns; lane guidance */
#banner{cursor:pointer}
#bmore{position:absolute;inset-inline-end:10px;bottom:8px;font-size:1.1rem;color:var(--muted)}
#blanes{grid-column:1/-1;margin-top:6px}
.lanes{display:flex;gap:4px;justify-content:center;direction:ltr;background:#000a;padding:6px;border-radius:6px}
:root[data-theme=light] .lanes{background:#0b0f1214}
.ln{width:46px;height:52px;display:grid;place-items:center;border-inline:2px dashed #ffffff30}
.ln svg{width:40px;height:40px}.ln.on{background:rgba(255,176,32,.16)}
.lanes.sm{justify-content:flex-start;padding:3px;background:transparent}.lanes.sm .ln{width:28px;height:30px}.lanes.sm .ln svg{width:24px;height:24px}
/* list sheets (turns, fuel) */
.list{display:grid}
.list>button,.list>div{all:unset;cursor:pointer;display:grid;grid-template-columns:auto 1fr auto;gap:4px 14px;align-items:center;padding:12px 4px;border-bottom:1px solid var(--line)}
.list .ic{width:48px;height:48px;display:grid;place-items:center;background:linear-gradient(180deg,var(--act),var(--act2));clip-path:var(--cut);font-size:26px}
.list .ic svg{width:38px;height:38px}
.list .tx{font-weight:700;line-height:1.25}.list .sub{grid-column:2/-1;color:var(--muted);font-size:.85rem}
.list .d{font:700 1.05rem var(--mono);color:var(--brand);white-space:nowrap;direction:ltr}
.list .msg{padding:14px 4px;color:var(--muted)}
.list .go{min-height:48px;padding:0 14px;font-size:.95rem}
.stopbar{display:flex;gap:10px;align-items:center;justify-content:space-between;padding:8px 12px;border:1px solid var(--ok);color:var(--ok);font-weight:700}
.stopbar .btn{min-height:44px;font-size:.9rem;padding:0 12px}
.fuel-m{width:40px;height:40px;border-radius:50%;display:grid;place-items:center;font-size:22px;background:#fff;border:3px solid #16a34a;box-shadow:0 2px 8px rgba(0,0,0,.4);cursor:pointer}
.fuel-m.stop{border-color:var(--brand);width:46px;height:46px}
.poileg{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px 12px;padding-bottom:6px}
.poileg>span{display:flex;gap:8px;align-items:center;font-size:.9rem}.poileg svg{flex:none}
[hidden]{display:none!important}
@media (max-width:760px){#speedo{width:92px;height:92px}#speedo b{font-size:2.1rem}.fab{width:58px;height:58px}.fab.rep{width:66px;height:66px}body.nav #fabs{bottom:calc(122px + env(safe-area-inset-bottom))}.repgrid button{min-height:100px}#bd{font-size:2.3rem}#bi{width:76px;height:76px}#bi svg{width:60px;height:60px}#bt{font-size:1.2rem}}
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
function icon(key,color){color=color||'#07090b';let d;
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
  for(const l of lanes){const c=l.ok?(dark()?'#ffb020':'#a35f00'):(dark()?'#56626a':'#9aa4a9');const sp=document.createElement('span');sp.className='ln'+(l.ok?' on':'');
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
function labelLang(){const f=LANG==='he'?['coalesce',['get','name:he'],['get','name']]:['coalesce',['get','name:en'],['get','name:latin'],['get','name']];
  for(const l of map.getStyle().layers){if(l.type!=='symbol')continue;const tf=l.layout&&l.layout['text-field'];if(!tf)continue;const s=JSON.stringify(tf);
    if(s.includes('name'))try{map.setLayoutProperty(l.id,'text-field',f);}catch(e){}}}
function addRouteLayers(){
  if(!map.getSource('route'))map.addSource('route',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
  if(!map.getSource('alts'))map.addSource('alts',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
  if(!map.getSource('cams'))map.addSource('cams',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
  const before=map.getStyle().layers.find(l=>l.type==='symbol')?.id;
  if(TRAFFIC&&!map.getSource('traffic'))map.addSource('traffic',{type:'raster',tiles:[location.origin+'/api/traffic/{z}/{x}/{y}.png?dark='+(dark()?1:0)],tileSize:256,maxzoom:18,attribution:'Traffic © TomTom'});
  if(TRAFFIC&&!map.getLayer('traffic'))map.addLayer({id:'traffic',type:'raster',source:'traffic',layout:{visibility:trafficOn?'visible':'none'},paint:{'raster-opacity':.85}},before);
  if(!map.getLayer('alts-line'))map.addLayer({id:'alts-line',type:'line',source:'alts',layout:{'line-join':'round','line-cap':'round'},paint:{'line-color':dark()?'#6b7a82':'#8a969c','line-width':['interpolate',['linear'],['zoom'],10,4,16,9],'line-opacity':.85}},before);
  if(!map.getLayer('route-glow'))map.addLayer({id:'route-glow',type:'line',source:'route',layout:{'line-join':'round','line-cap':'round'},paint:{'line-color':'#ffb020','line-width':['interpolate',['linear'],['zoom'],10,14,16,34,19,60],'line-blur':['interpolate',['linear'],['zoom'],10,8,16,18],'line-opacity':.35}},before);
  if(!map.getLayer('route-casing'))map.addLayer({id:'route-casing',type:'line',source:'route',layout:{'line-join':'round','line-cap':'round'},paint:{'line-color':'#07090b','line-width':['interpolate',['linear'],['zoom'],10,7,16,16,19,30],'line-opacity':.85}},before);
  if(!map.getLayer('route-line'))map.addLayer({id:'route-line',type:'line',source:'route',layout:{'line-join':'round','line-cap':'round'},paint:{'line-color':'#ffb020','line-width':['interpolate',['linear'],['zoom'],10,4,16,10,19,22]}},before);
  if(!map.getLayer('cams-dot'))map.addLayer({id:'cams-dot',type:'circle',source:'cams',minzoom:9,paint:{'circle-radius':['interpolate',['linear'],['zoom'],9,3,14,9],'circle-color':['case',['get','alert'],'#e53935','#7d8a91'],'circle-stroke-color':'#fff','circle-stroke-width':2}});
  if(!map.getLayer('cams-lim'))map.addLayer({id:'cams-lim',type:'symbol',source:'cams',minzoom:13,filter:['all',['get','alert'],['>',['get','limit'],0]],layout:{'text-field':['to-string',['get','limit']],'text-size':12,'text-offset':[0,1.4],'text-font':['Noto Sans Regular'],'text-allow-overlap':true},paint:{'text-color':dark()?'#fff':'#111','text-halo-color':dark()?'#000':'#fff','text-halo-width':1.5}});
  drawRoute();drawAlts();drawCams();}
function drawAlts(){const s=map.getSource('alts');if(!s)return;const f=(mode==='preview'&&routes)?routes.map((r,i)=>i===routeIdx?null:{type:'Feature',properties:{i},geometry:{type:'LineString',coordinates:r.geometry}}).filter(Boolean):[];
  s.setData({type:'FeatureCollection',features:f});}
function drawCams(){const s=map.getSource('cams');if(!s)return;s.setData({type:'FeatureCollection',features:cams.map(c=>({type:'Feature',properties:{id:c.id,alert:!!c.alert,limit:c.limit||0},geometry:{type:'Point',coordinates:[c.lon,c.lat]}}))});}
function drawRoute(){const s=map.getSource('route');if(!s)return;const c=remainData||routeData;
  s.setData({type:'FeatureCollection',features:c&&c.length>1?[{type:'Feature',properties:{},geometry:{type:'LineString',coordinates:c}}]:[]});}
// The stock dark map draws streets nearly black; lift them so the road network reads at a glance.
const DARK_ROADS={highway_minor:'#2b3137',highway_path:'#262b30',highway_major_inner:'#3a434b',highway_major_subtle:'#323a41',highway_major_casing:'rgba(120,132,140,.55)',highway_motorway_inner:'#5c4a22',highway_motorway_subtle:'#3a3220',highway_motorway_casing:'rgba(255,176,32,.35)'};
function tuneDark(){if(!dark())return;for(const [id,c] of Object.entries(DARK_ROADS))if(map.getLayer(id))try{map.setPaintProperty(id,'line-color',c);}catch(e){}}
// A driver's-eye world: buildings in 3D, a horizon, and a glowing route.
function realityView(){
  const st=map.getStyle();
  if(!st.layers.some(l=>l.type==='fill-extrusion')&&st.sources.openmaptiles){
    const before=st.layers.find(l=>l.type==='symbol')?.id;
    try{map.addLayer({id:'hn-3d',type:'fill-extrusion',source:'openmaptiles','source-layer':'building',minzoom:14,
      paint:{'fill-extrusion-color':dark()?'#20272e':'#d9d6cf','fill-extrusion-height':['coalesce',['get','render_height'],8],'fill-extrusion-base':['coalesce',['get','render_min_height'],0],'fill-extrusion-opacity':.9}},before);}catch(e){}}
  try{map.setSky(dark()?{'sky-color':'#070a0e','horizon-color':'#1a2530','fog-color':'#0b0f14','sky-horizon-blend':.6,'horizon-fog-blend':.7,'fog-ground-blend':.35}
    :{'sky-color':'#bcd4ea','horizon-color':'#e9eef2','fog-color':'#eef1ee','sky-horizon-blend':.6,'horizon-fog-blend':.7,'fog-ground-blend':.35});}catch(e){}}
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
  ['food','#f97316',2,'M11 9H9V2H7v7H5V2H3v7c0 2.12 1.66 3.84 3.75 3.97V22h2.5v-9.03C11.34 12.84 13 11.12 13 9V2h-2v7zm5-3v8h2.5v8H21V2c-2.76 0-5 2.24-5 4z'],
  ['health','#dc2626',2,'M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-1 11h-4v4h-4v-4H6v-4h4V6h4v4h4v4z'],
  ['fun','#0d9488',2,'M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z'],
  ['cafe','#b45309',3,'M20 3H4v10c0 2.21 1.79 4 4 4h6c2.21 0 4-1.79 4-4v-3h2c1.11 0 2-.89 2-2V5c0-1.11-.89-2-2-2zm0 5h-2V5h2v3zM4 19h16v2H4z'],
  ['bar','#db2777',3,'M21 5V3H3v2l8 9v5H6v2h12v-2h-5v-5l8-9zM7.43 7L5.66 5h12.69l-1.78 2H7.43z'],
  ['grocery','#65a30d',3,'M7 18c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-.9-2-2-2zM1 2v2h2l3.6 7.59-1.35 2.45c-.16.28-.25.61-.25.96 0 1.1.9 2 2 2h12v-2H7.42c-.14 0-.25-.11-.25-.25l.03-.12.9-1.63h7.45c.75 0 1.41-.41 1.75-1.03l3.58-6.49A1.003 1.003 0 0 0 20 4H5.21l-.94-2H1zm16 16c-1.1 0-1.99.9-1.99 2s.89 2 1.99 2 2-.9 2-2-.9-2-2-2z'],
  ['pharmacy','#059669',3,'M10 3h4v7h7v4h-7v7h-4v-7H3v-4h7z'],
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
  ['==',C,'parking'],'parking',
  ''];
const poiTier=(t)=>['in',POI_CAT,['literal',POI.filter(x=>x[2]===t).map(x=>x[0])]];
const poiIcon=(col,d,size)=>'<svg xmlns="http://www.w3.org/2000/svg" width="'+size+'" height="'+size+'" viewBox="0 0 48 48"><circle cx="24" cy="24" r="21" fill="'+col+'" stroke="#fff" stroke-width="3"/><path transform="translate(11.5 11.5) scale(1.04)" fill="#fff" d="'+d+'"/></svg>';
const poiImgs={};
function poiImages(){return Promise.all(POI.map(([k,col,,d])=>poiImgs[k]||(poiImgs[k]=new Promise(res=>{const im=new Image(96,96);im.onload=()=>res(im);im.onerror=()=>res(null);im.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(poiIcon(col,d,96));}))));}
const POI_LAYERS=['hn-poi-1','hn-poi-2','hn-poi-3'];
async function addPois(){const imgs=await poiImages();
  POI.forEach(([k],i)=>{const id='hn-'+k;if(imgs[i]&&!map.hasImage(id))map.addImage(id,imgs[i],{pixelRatio:2});});
  const st=map.getStyle();if(!st.sources.openmaptiles)return;
  // the style's own POI icons are replaced by ours (the dark style has none at all)
  for(const l of st.layers)if(l['source-layer']==='poi'&&!l.id.startsWith('hn-'))try{map.setLayoutProperty(l.id,'visibility','none');}catch(e){}
  const name=LANG==='he'?['coalesce',['get','name:he'],['get','name']]:['coalesce',['get','name:en'],['get','name:latin'],['get','name']];
    [[1,13.5],[2,15],[3,16.8]].forEach(([t,minz])=>{const id='hn-poi-'+t;if(map.getLayer(id))return;
    map.addLayer({id,type:'symbol',source:'openmaptiles','source-layer':'poi',minzoom:minz,filter:poiTier(t),
      layout:{'icon-image':['concat','hn-',POI_CAT],'icon-size':['interpolate',['linear'],['zoom'],13,.75,16,.9,18,1.15],'icon-allow-overlap':false,'icon-padding':6,
        'symbol-sort-key':['+',t*1000,['coalesce',['get','rank'],50]],
        'text-field':name,'text-font':['Noto Sans Regular'],'text-size':12.5,'text-offset':[0,1.35],'text-anchor':'top','text-optional':true,'text-max-width':8,
        visibility:opts.pois?'visible':'none'},
      paint:{'text-color':dark()?'#dfe6ea':'#1f2a30','text-halo-color':dark()?'#07090b':'#fff','text-halo-width':1.6,'icon-opacity':1}});});
  poiMode();}
// While driving, only what matters from the road (hotels, malls, fuel, chargers, food, hospitals, attractions).
function poiMode(){const on=opts.pois;POI_LAYERS.forEach(id=>{if(!map.getLayer(id))return;const v=on&&!(id==='hn-poi-3'&&mode==='nav');map.setLayoutProperty(id,'visibility',v?'visible':'none');});}
const poiCatOf=(p)=>{const c=p.class,sc=p.subclass;
  if(c==='lodging')return 'hotel';if(c==='shop'&&(sc==='mall'||sc==='department_store'))return 'mall';if(c==='fuel')return sc==='charging_station'?'charge':'fuel';
  if(c==='restaurant'||c==='fast_food')return 'food';if(c==='hospital')return 'health';if(['attraction','museum','cinema','theatre','stadium','zoo','castle','aquarium','theme_park'].includes(c))return 'fun';
  if(['cafe','ice_cream','bakery'].includes(c))return 'cafe';if(c==='bar'||c==='beer')return 'bar';if(c==='grocery')return 'grocery';if(c==='pharmacy')return 'pharmacy';if(c==='parking')return 'parking';return '';};
for(const id of POI_LAYERS)map.on('click',id,(e)=>{const f=e.features&&e.features[0];if(!f)return;window.__poiClick=Date.now();
  const pr=f.properties,cat=poiCatOf(pr),nm=(LANG==='he'?pr['name:he']||pr.name:pr['name:en']||pr.name)||L['poi_'+cat];
  const ll=f.geometry.type==='Point'?f.geometry.coordinates:[e.lngLat.lng,e.lngLat.lat];
  const box=document.createElement('div');box.style.cssText='display:grid;gap:8px;min-width:210px';
  const h=document.createElement('div');h.style.cssText='display:flex;gap:10px;align-items:center';const ic=document.createElement('span');ic.innerHTML=poiIcon(POI_BY[cat]?POI_BY[cat][1]:'#888',POI_BY[cat]?POI_BY[cat][3]:'',36);
  const t=document.createElement('div');const b=document.createElement('b');b.textContent=nm;const k=document.createElement('div');k.className='small';k.textContent=L['poi_'+cat]||'';t.append(b,k);h.append(ic,t);box.appendChild(h);
  const place={name:nm,detail:L['poi_'+cat]||'',lon:ll[0],lat:ll[1],icon:'📍'};
  const pop=new ml.Popup({closeButton:true,offset:14,maxWidth:'320px'}).setLngLat(ll).setDOMContent(box);
  if(mode==='nav'){const s=document.createElement('button');s.className='btn primary';s.textContent=L.fuel_add;s.onclick=()=>{pop.remove();addStop(place);};box.appendChild(s);}
  else if(mode==='browse'){const g=document.createElement('button');g.className='btn primary';g.textContent=L.pin_here;g.onclick=()=>{pop.remove();choose(place);};box.appendChild(g);}
  pop.addTo(map);});
for(const id of POI_LAYERS){map.on('mouseenter',id,()=>map.getCanvas().style.cursor='pointer');map.on('mouseleave',id,()=>map.getCanvas().style.cursor='');}
function poiLegend(){const box=$('#poileg');if(!box||box.childElementCount)return;
  for(const [k,col,,d] of POI){const it=document.createElement('span');it.innerHTML=poiIcon(col,d,30);const tx=document.createElement('span');tx.textContent=L['poi_'+k];it.appendChild(tx);box.appendChild(it);}}
map.on('style.load',()=>{labelLang();tuneDark();realityView();addAreas();addRouteLayers();addPois();});

// car marker
const carEl=document.createElement('div');carEl.className='car dot';
const carSvg='<svg viewBox="0 0 48 48" class="car" style="width:58px;height:58px"><path d="M24 4 42 42 24 33 6 42Z" fill="#ffb020" stroke="#07090b" stroke-width="2.5" stroke-linejoin="round"/></svg>';
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
  for(const p of list){const b=document.createElement('button');b.type='button';const n=document.createElement('b');n.textContent=p.name;b.appendChild(n);
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
    routes=d.routes||[d.route];routeShortest=d.shortest??0;routeBest=d.best??0;pickRoute(routeBest);
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
    routes=d.routes||[d.route];route=routes[d.best??0];routeData=route.geometry;routeFactor=route.traffic&&route.duration>0?route.traffic.seconds/route.duration:1;armRoute();say(trk.intro());}
  catch(e){}finally{rerouting=false;}}
/** Every few minutes: is there now a clearly faster way (traffic changed)? Switch, and say how much it saves. */
async function checkFaster(f,p){checking=true;lastCheck=Date.now();
  try{const d=await api(routeUrl(f.pos,p.bearing));
    const rs=(d.routes||[]).filter(r=>r.traffic);if(!rs.length||mode!=='nav')return;
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
    box.textContent='';
    for(const st of fuel){const r=document.createElement('div');r.setAttribute('role','listitem');
      const ic=document.createElement('span');ic.className='ic';ic.textContent='⛽';
      const tx=document.createElement('span');tx.className='tx';tx.textContent=st.name||L.fuel_station;
      const go=document.createElement('button');go.type='button';go.className='btn primary go';go.textContent=L.fuel_add;go.onclick=(e)=>{e.stopPropagation();addStop(st);};
      const sub=document.createElement('span');sub.className='sub';sub.textContent=[F(L.fuel_in,NAVCORE.shortDistance(st.along-a,LANG)),st.detour>=60?F(L.fuel_detour,Math.round(st.detour/60)):st.side?L['side_'+st.side]:'',st.brand].filter(Boolean).join(' · ');
      r.append(ic,tx,go,sub);r.onclick=()=>{closeSheets();follow=false;lastTouch=Date.now()+7000;if(mode==='nav')show('#recenter',true);map.easeTo({center:[st.lon,st.lat],zoom:16.5,pitch:30,padding:{top:0,bottom:0,left:0,right:0},duration:900});};
      box.appendChild(r);
      const el=document.createElement('div');el.className='fuel-m';el.textContent='⛽';el.title=st.name||L.fuel_station;el.addEventListener('click',(ev)=>{ev.stopPropagation();fuelPopup(st);});
      fuelMarkers.push(new ml.Marker({element:el}).setLngLat([st.lon,st.lat]).addTo(map));}}
  catch(e){if(seq===fuelSeq)msg(L.fuel_failed);}}
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
window.__hnmap=map;window.__hn={choose,sim:()=>startNav(true),pitch:()=>map.getPitch(),state:()=>({stop,fuel:fuel.length,lanes:route?route.steps.filter(s=>s.lanes).length:0,speed:Math.round(kmh),reports:reps.length,opts,mode,follow,dest,steps:route&&route.steps.length,prog:lastProg,sim:!!sim,routes:routes&&routes.length,routeIdx,cams:cams.length,camHits:camHits.length,traffic:TRAFFIC})};
`;

export function appPage(lang: Lang, origin: string) {
  const t = dict(lang);
  const L = JSON.stringify(t).replace(/</g, '\\u003c');
  const simx = 1;
  const app = APP.replace('__CORE__', () => navCore.toString());
  void origin;
  return `<!doctype html><html lang="${lang}" dir="${lang === 'he' ? 'rtl' : 'ltr'}" data-theme="dark"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover,user-scalable=no">
<meta name="referrer" content="no-referrer"><meta name="theme-color" content="#07090b"><meta name="color-scheme" content="dark light">
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
  <div class="kicker">// ROUTE</div>
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
<div id="speedo" hidden aria-live="off"><b id="spd">0</b><span>${t.kmh}</span></div>
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
  <div class="kicker">// ${t.route_opts}</div>
  <div class="opt"><div><b>${t.avoid_tolls}</b><small>${t.avoid_tolls_sub}</small></div><button class="tog" type="button" role="switch" id="o-tolls" aria-checked="false" aria-label="${t.avoid_tolls}"></button></div>
  <div class="opt"><div><b>${t.avoid_areas}</b><small>${t.avoid_areas_sub}</small></div><button class="tog" type="button" role="switch" id="o-areas" aria-checked="true" aria-label="${t.avoid_areas}"></button></div>
  <div class="opt"><div><b>${t.voice}</b></div><button class="tog" type="button" role="switch" id="o-voice" aria-checked="true" aria-label="${t.voice}"></button></div>
  <div class="kicker">// ${t.display}</div>
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
  <div class="list" id="fuellist"></div>
  <div class="disc" id="fsrc"></div>
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
