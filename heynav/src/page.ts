import { navCore } from './core';
import { dict, type Lang } from './i18n';

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
.locrow{display:flex;gap:8px;flex-wrap:wrap}.locrow .btn{min-height:46px;font-size:.95rem;padding:0 14px}
#pickhint{color:var(--brand);letter-spacing:.08em;text-transform:none;font-size:.8rem}
#search.picking{border-color:var(--brand)}
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
#simb{position:fixed;z-index:11;top:max(14px,env(safe-area-inset-top));inset-inline-end:14px;font:700 .8rem var(--mono);letter-spacing:.14em;padding:8px 12px;background:var(--bad);color:#fff}
#arrived{inset:auto;top:50%;left:50%;transform:translate(-50%,-50%);padding:28px 36px;font:700 3rem var(--display);text-align:center}
.car{width:46px;height:46px;filter:drop-shadow(0 0 10px rgba(255,176,32,.6))}
.car.dot{width:24px;height:24px;border-radius:50%;background:var(--ok);border:3px solid #fff;filter:drop-shadow(0 0 8px var(--ok))}
.pin{width:30px;height:30px;background:var(--brand);clip-path:polygon(50% 100%,0 35%,15% 0,85% 0,100% 35%)}
.maplibregl-popup-content{background:var(--card);color:var(--fg);border:1px solid var(--line2);border-radius:0;padding:12px}
.maplibregl-popup-tip{display:none}
.maplibregl-ctrl-attrib{font-size:11px}
/* corner */
#corner{position:fixed;z-index:9;inset-inline-end:14px;top:max(14px,env(safe-area-inset-top));display:flex;gap:8px}
.seg{display:inline-flex;border:1px solid var(--line2);background:var(--card)}.seg button{min-height:44px;padding:0 12px;border:0;background:transparent;font-weight:700;color:var(--muted)}
.seg button[aria-pressed=true]{color:var(--brand);box-shadow:inset 0 -2px 0 var(--brand)}
#foot{position:fixed;z-index:9;bottom:calc(6px + env(safe-area-inset-bottom));inset-inline-start:14px;max-width:min(460px,calc(100% - 28px));font-size:.72rem;color:var(--muted);text-align:start;background:var(--card);padding:6px 10px;border:1px solid var(--line)}
#toast{position:fixed;z-index:30;left:50%;bottom:calc(100px + env(safe-area-inset-bottom));transform:translateX(-50%);padding:12px 18px;background:var(--act);color:var(--act-fg);font-weight:700;clip-path:var(--cut)}
#toast.bad{background:var(--bad);color:#fff}
[hidden]{display:none!important}
@media (max-width:760px){#corner{top:auto;bottom:calc(64px + env(safe-area-inset-bottom))}#foot{display:none}#bd{font-size:2.3rem}#bi{width:76px;height:76px}#bi svg{width:60px;height:60px}#bt{font-size:1.2rem}}
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
  else if(key==='arrive')d='M24 44V8M24 8h16l-5 6 5 6H24';
  else if(key&&key.startsWith('roundabout')){const n=+(key.split('-')[1]||0);const a=[90,90,0,-90,-150][n]??0;const r=a*Math.PI/180;
    const sx=24+8*Math.sin(r),sy=22-8*Math.cos(r),ex=24+20*Math.sin(r),ey=22-20*Math.cos(r);
    return '<svg viewBox="0 0 48 48" fill="none" stroke="'+color+'" stroke-width="4.5" stroke-linecap="square"><circle cx="24" cy="22" r="8"/><path d="M24 44V30M'+sx.toFixed(1)+' '+sy.toFixed(1)+'L'+ex.toFixed(1)+' '+ey.toFixed(1)+'"/></svg>';}
  else d=arrowPath(ANG[key]??0);
  return '<svg viewBox="0 0 48 48" fill="none" stroke="'+color+'" stroke-width="4.5" stroke-linecap="square" stroke-linejoin="miter">'+'<path d="'+d+'"/></svg>';}

// ---------- map
const dark=()=>document.documentElement.getAttribute('data-theme')!=='light';
const styleUrl=()=>TILES+'/styles/'+(dark()?'dark':'liberty');
const map=new ml.Map({container:'map',style:styleUrl(),center:store.get('hn_last',[34.7818,32.0853]),zoom:13,attributionControl:false,
  pitchWithRotate:true,dragRotate:true,maxPitch:65,fadeDuration:0});
map.addControl(new ml.AttributionControl({compact:true,customAttribution:'Routing © <a href="https://project-osrm.org" target="_blank" rel="noopener">OSRM</a> · Search © <a href="https://photon.komoot.io" target="_blank" rel="noopener">Photon</a>'}),LANG==='he'?'bottom-left':'bottom-right');
let routeData=null,remainData=null;
function labelLang(){const f=LANG==='he'?['coalesce',['get','name:he'],['get','name']]:['coalesce',['get','name:en'],['get','name:latin'],['get','name']];
  for(const l of map.getStyle().layers){if(l.type!=='symbol')continue;const tf=l.layout&&l.layout['text-field'];if(!tf)continue;const s=JSON.stringify(tf);
    if(s.includes('name'))try{map.setLayoutProperty(l.id,'text-field',f);}catch(e){}}}
function addRouteLayers(){
  if(!map.getSource('route'))map.addSource('route',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
  const before=map.getStyle().layers.find(l=>l.type==='symbol')?.id;
  if(!map.getLayer('route-casing'))map.addLayer({id:'route-casing',type:'line',source:'route',layout:{'line-join':'round','line-cap':'round'},paint:{'line-color':'#07090b','line-width':['interpolate',['linear'],['zoom'],10,7,16,16,19,30],'line-opacity':.85}},before);
  if(!map.getLayer('route-line'))map.addLayer({id:'route-line',type:'line',source:'route',layout:{'line-join':'round','line-cap':'round'},paint:{'line-color':'#ffb020','line-width':['interpolate',['linear'],['zoom'],10,4,16,10,19,22]}},before);
  drawRoute();}
function drawRoute(){const s=map.getSource('route');if(!s)return;const c=remainData||routeData;
  s.setData({type:'FeatureCollection',features:c&&c.length>1?[{type:'Feature',properties:{},geometry:{type:'LineString',coordinates:c}}]:[]});}
// The stock dark map draws streets nearly black; lift them so the road network reads at a glance.
const DARK_ROADS={highway_minor:'#2b3137',highway_path:'#262b30',highway_major_inner:'#3a434b',highway_major_subtle:'#323a41',highway_major_casing:'rgba(120,132,140,.55)',highway_motorway_inner:'#5c4a22',highway_motorway_subtle:'#3a3220',highway_motorway_casing:'rgba(255,176,32,.35)'};
function tuneDark(){if(!dark())return;for(const [id,c] of Object.entries(DARK_ROADS))if(map.getLayer(id))try{map.setPaintProperty(id,'line-color',c);}catch(e){}}
map.on('style.load',()=>{labelLang();tuneDark();addRouteLayers();});

// car marker
const carEl=document.createElement('div');carEl.className='car dot';
const carSvg='<svg viewBox="0 0 48 48" class="car"><path d="M24 4 42 42 24 33 6 42Z" fill="#ffb020" stroke="#07090b" stroke-width="2.5" stroke-linejoin="round"/></svg>';
const car=new ml.Marker({element:carEl,rotationAlignment:'map',pitchAlignment:'map'});
let carOnMap=false;
function setCar(pos,bearing,arrow){
  // Only toggle our own classes: MapLibre positions markers through its own class on this element.
  if(arrow&&carEl.classList.contains('dot')){carEl.classList.remove('dot');carEl.innerHTML=carSvg;}
  if(!arrow&&!carEl.classList.contains('dot')){carEl.classList.add('dot');carEl.innerHTML='';car.setRotation(0);}
  car.setLngLat(pos);if(arrow)car.setRotation(bearing);if(!carOnMap){car.addTo(map);carOnMap=true;}}

// ---------- state
let mode='browse',fix=null,dest=null,route=null,trk=null,follow=true,muted=store.get('hn_muted',false),sim=null,lastReroute=0,rerouting=false,lastProg=null,firstFix=true,wake=null;
const show=(id,on)=>{$(id).hidden=!on;};
function setMode(m){mode=m;show('#search',m==='browse');show('#corner',m==='browse');show('#foot',m==='browse');show('#preview',m==='preview');
  show('#banner',m==='nav');show('#navbar',m==='nav');show('#simb',m==='nav'&&!!sim);if(m!=='nav')show('#recenter',false);if(m==='browse')show('#arrived',false);}

// ---------- GPS
function gpsLine(f){const g=$('#gps');if(!f){return;}
  $('#usegps').hidden=!f.manual;
  if(f.manual){g.className='';g.textContent='📍 '+L.manual_loc+(f.name?' · '+f.name:'')+' · '+f.pos[1].toFixed(5)+', '+f.pos[0].toFixed(5);return;}
  const weak=f.accuracy>50;g.className=weak?'bad':'';
  g.textContent=(weak?'⚠ '+L.weak_gps+' · ':'')+f.pos[1].toFixed(5)+', '+f.pos[0].toFixed(5)+' · ±'+Math.round(f.accuracy)+' m'+(f.speed>0.5?' · '+Math.round(f.speed*3.6)+' km/h':'');}
function onFix(f){fix=f;gpsLine(f);
  if(firstFix){firstFix=false;store.set('hn_last',f.pos);if(mode==='browse')map.jumpTo({center:f.pos,zoom:16});}
  if(mode==='nav'&&trk)return guide(f);
  const moving=f.heading!=null&&(f.speed||0)>1.5;setCar(f.pos,f.heading||0,moving);
  if(mode==='browse'&&follow&&!firstFix)map.easeTo({center:f.pos,duration:800});}
let watchId=null;
function startGps(){if(!('geolocation' in navigator)){gpsErr();return;}
  watchId=navigator.geolocation.watchPosition(p=>{if(sim)return;const c=p.coords;if(fix&&fix.manual&&!(c.accuracy<=100))return;
    onFix({pos:[c.longitude,c.latitude],accuracy:c.accuracy||999,speed:c.speed,heading:(c.heading!=null&&!isNaN(c.heading))?c.heading:null,time:p.timestamp});},
    e=>{if(!fix||fix.manual)gpsErr();},{enableHighAccuracy:true,maximumAge:2000,timeout:30000});}
function gpsErr(){if(fix&&fix.manual)return;const g=$('#gps');g.className='bad';g.textContent=L.no_geo;}

// ---------- manual location: for when GPS is off, denied or wrong
let picking=false,pendingDest=null;
function startPick(dest){picking=true;pendingDest=dest||null;$('#search').classList.add('picking');$('#pickhint').hidden=false;$('#q').value='';$('#res').textContent='';
  $('#q').placeholder=L.where_now;$('#q').focus();}
function endPick(){picking=false;$('#search').classList.remove('picking');$('#pickhint').hidden=true;$('#q').placeholder=L.where;}
function setManual(p){const f={pos:[p.lon,p.lat],accuracy:0,speed:null,heading:null,time:Date.now(),manual:true,name:p.name&&p.name!==L.pin_name?p.name:''};
  store.set('hn_manual',{lon:p.lon,lat:p.lat,name:f.name});firstFix=false;endPick();onFix(f);map.easeTo({center:f.pos,zoom:16,duration:800});toast(L.manual_set);
  const d=pendingDest;pendingDest=null;if(d)choose(d);}
$('#setloc').onclick=()=>picking?endPick():startPick();
$('#usegps').onclick=()=>{store.set('hn_manual',null);fix=null;firstFix=true;$('#usegps').hidden=true;$('#gps').className='';$('#gps').textContent=L.locating;
  if(watchId!=null)navigator.geolocation.clearWatch(watchId);startGps();};

// ---------- search
let sTimer,sSeq=0;
function renderPlaces(list,msg){const r=$('#res');r.textContent='';
  if(msg){const d=document.createElement('div');d.className='msg';d.textContent=msg;r.appendChild(d);return;}
  for(const p of list){const b=document.createElement('button');b.type='button';const n=document.createElement('b');n.textContent=p.name;b.appendChild(n);
    if(p.detail){const s=document.createElement('span');s.textContent=p.detail;b.appendChild(s);}b.onclick=()=>choose(p);r.appendChild(b);}}
async function doSearch(q){const seq=++sSeq;renderPlaces([],L.searching);
  try{const c=fix?fix.pos:map.getCenter().toArray();const d=await api('/api/search?q='+encodeURIComponent(q)+'&lat='+c[1].toFixed(3)+'&lon='+c[0].toFixed(3));
    if(seq!==sSeq)return;d.places.length?renderPlaces(d.places):renderPlaces([],L.no_results);}
  catch(e){if(seq===sSeq)renderPlaces([],L.search_failed);}}
$('#q').addEventListener('input',()=>{clearTimeout(sTimer);const q=$('#q').value.trim();if(q.length<2){$('#res').textContent='';return;}sTimer=setTimeout(()=>doSearch(q),380);});
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
async function choose(p){$('#res').textContent='';$('#q').blur();
  if(picking)return setManual(p);
  if(!fix){startPick(p);return;}
  $('#pmanual').hidden=!fix.manual;
  dest=p;remember(p);chips();
  const el=document.createElement('div');el.className='pin';
  if(destMarker)destMarker.remove();destMarker=new ml.Marker({element:el,anchor:'bottom'}).setLngLat([p.lon,p.lat]).addTo(map);
  $('#pname').textContent=p.name;$('#pdetail').textContent=p.detail||'';$('#psum').textContent=L.calc;$('#go').disabled=true;$('#sim').disabled=true;setMode('preview');
  try{const d=await api('/api/route?from='+fix.pos[0].toFixed(6)+','+fix.pos[1].toFixed(6)+'&to='+p.lon.toFixed(6)+','+p.lat.toFixed(6));
    route=d.route;routeData=route.geometry;remainData=null;drawRoute();
    const s=$('#psum');s.textContent='';const add=(b,t)=>{const x=document.createElement('b');x.textContent=b;const y=document.createElement('span');y.textContent=t;s.append(x,y);};
    add(fmtTime(route.duration),'');add(fmtKm(route.distance),'');add(fmtClock(route.duration),L.arrive_at);
    $('#go').disabled=false;$('#sim').disabled=false;
    const b=new ml.LngLatBounds();route.geometry.forEach(c=>b.extend(c));map.fitBounds(b,{padding:{top:80,bottom:320,left:60,right:60},duration:900,maxZoom:16});}
  catch(e){$('#psum').textContent=L.route_failed;}}
function cancelRoute(){stopSim();route=null;trk=null;routeData=null;remainData=null;drawRoute();if(destMarker){destMarker.remove();destMarker=null;}releaseWake();
  speechSynthesis&&speechSynthesis.cancel&&speechSynthesis.cancel();setMode('browse');follow=true;if(fix){map.easeTo({center:fix.pos,zoom:16,pitch:0,bearing:0,duration:800});setCar(fix.pos,0,false);}}
$('#cancel').onclick=cancelRoute;
$('#sethome').onclick=()=>{if(dest){store.set('hn_home',{...dest,name:dest.name});chips();toast(L.saved+' · '+L.home);}};
$('#setwork').onclick=()=>{if(dest){store.set('hn_work',{...dest});chips();toast(L.saved+' · '+L.work);}};

// ---------- voice
let voice=null;
function pickVoice(){const vs=(window.speechSynthesis&&speechSynthesis.getVoices())||[];const want=LANG==='he'?['he','iw']:['en'];
  voice=vs.find(v=>want.some(w=>v.lang.toLowerCase().replace('_','-').startsWith(w)))||null;}
if(window.speechSynthesis){pickVoice();speechSynthesis.onvoiceschanged=pickVoice;}
function say(text){if(!text||muted||!window.speechSynthesis)return;try{speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text);u.lang=LANG==='he'?'he-IL':'en-US';if(voice)u.voice=voice;u.rate=1;speechSynthesis.speak(u);}catch(e){}}
function muteBtn(){$('#mute').textContent=muted?'🔇':'🔊';$('#mute').setAttribute('aria-label',muted?L.unmute:L.mute);}
$('#mute').onclick=()=>{muted=!muted;store.set('hn_muted',muted);muteBtn();if(muted)speechSynthesis&&speechSynthesis.cancel();};muteBtn();

// ---------- guidance
async function wakeOn(){try{if(navigator.wakeLock)wake=await navigator.wakeLock.request('screen');}catch(e){}}
function releaseWake(){try{wake&&wake.release();}catch(e){}wake=null;}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&mode==='nav')wakeOn();});
function startNav(simulate){if(!route)return;trk=NAVCORE.tracker(route,LANG);follow=true;lastProg=null;setMode('nav');wakeOn();
  if(simulate)startSim();show('#simb',!!sim);say(trk.intro());
  if(fix&&!sim)guide(fix);else if(sim)simTick();}
$('#go').onclick=()=>startNav(false);$('#sim').onclick=()=>startNav(true);
$('#end').onclick=cancelRoute;
function zoomFor(speed){const s=speed||0;return s>25?15:s>15?16:17;}
function guide(f){const p=trk.update(f);lastProg=p;setCar(p.snapped,p.bearing,true);
  // trim the drawn route to what is still ahead
  const seg=Math.max(0,routeIndex(p));remainData=[p.snapped].concat(route.geometry.slice(seg+1));drawRoute();
  const n=p.next>=0?route.steps[p.next]:null;
  if(n){$('#bi').innerHTML=icon(n.icon);$('#bd').textContent=NAVCORE.shortDistance(p.toNext,LANG);$('#bt').textContent=rerouting?L.rerouting:n.text;
    const n2=route.steps[p.next+1];if(n2&&n2.start-n.start<300&&n2.type!=='arrive'){$('#bthen').hidden=false;$('#bti').innerHTML=icon(n2.icon,dark()?'#9aa7ae':'#4c575e');$('#btt').textContent=n2.text;}else $('#bthen').hidden=true;}
  $('#etaA').textContent=fmtClock(p.remainingTime);$('#etaT').textContent=fmtTime(p.remainingTime);$('#etaD').textContent=fmtKm(p.remaining);
  if(p.say)say(p.say);
  if(follow)map.easeTo({center:p.snapped,bearing:p.bearing,pitch:55,zoom:zoomFor(f.speed),duration:950,easing:(t)=>t,padding:padding()});
  if(p.arrived)return arrive();
  if(p.reroute)reroute(f);}
let segHint=0;function routeIndex(p){const g=route.geometry,cum=trk.cum;let i=Math.min(segHint,g.length-2);while(i>0&&cum[i]>p.along)i--;while(i<g.length-2&&cum[i+1]<=p.along)i++;segHint=i;return i;}
function padding(){const h=window.innerHeight,w=window.innerWidth;const side=w>900?Math.min(560,w*0.38):0;return LANG==='he'?{top:h*0.32,bottom:h*0.08,left:0,right:side}:{top:h*0.32,bottom:h*0.08,left:side,right:0};}
async function reroute(f){const now=Date.now();if(rerouting||now-lastReroute<8000||!dest)return;rerouting=true;lastReroute=now;$('#bt').textContent=L.rerouting;
  try{const d=await api('/api/route?from='+f.pos[0].toFixed(6)+','+f.pos[1].toFixed(6)+'&to='+dest.lon.toFixed(6)+','+dest.lat.toFixed(6)+(lastProg?'&bearing='+Math.round(f.heading??lastProg.bearing):''));
    route=d.route;routeData=route.geometry;segHint=0;trk=NAVCORE.tracker(route,LANG);say(trk.intro());}
  catch(e){}finally{rerouting=false;}}
function arrive(){stopSim();show('#arrived',true);releaseWake();setTimeout(()=>{if(mode==='nav')cancelRoute();},9000);}
map.on('dragstart',()=>{if(mode==='nav'||mode==='browse'){follow=false;if(mode==='nav')show('#recenter',true);}});
$('#recenter').onclick=()=>{follow=true;show('#recenter',false);if(lastProg)map.easeTo({center:lastProg.snapped,bearing:lastProg.bearing,pitch:55,zoom:17,padding:padding(),duration:600});};
$('#overview').onclick=()=>{if(!route)return;follow=false;show('#recenter',true);const b=new ml.LngLatBounds();(remainData||route.geometry).forEach(c=>b.extend(c));map.fitBounds(b,{padding:80,pitch:0,bearing:0,duration:900});};
map.on('click',(e)=>{if(mode!=='browse')return;const p={name:L.pin_name,detail:e.lngLat.lat.toFixed(5)+', '+e.lngLat.lng.toFixed(5),lon:e.lngLat.lng,lat:e.lngLat.lat};
  if(picking)return setManual(p);
  const box=document.createElement('div');box.style.cssText='display:grid;gap:8px';
  const b=document.createElement('button');b.className='btn primary';b.textContent=L.pin_here;
  const h=document.createElement('button');h.className='btn ghost';h.textContent=L.im_here;box.append(b,h);
  const pop=new ml.Popup({closeButton:false,offset:12}).setLngLat(e.lngLat).setDOMContent(box).addTo(map);
  b.onclick=()=>{pop.remove();choose(p);};h.onclick=()=>{pop.remove();setManual(p);};});

// ---------- test drive: moves along the route as if driving, through the same guidance code
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
startGps();
window.__hn={state:()=>({mode,follow,dest,steps:route&&route.steps.length,prog:lastProg,sim:!!sim})};
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
  <form id="sf" role="search"><input id="q" type="search" enterkeyhint="search" autocomplete="off" spellcheck="false" placeholder="${t.where}" aria-label="${t.where}" maxlength="120"><button class="btn primary" type="submit" aria-label="${t.where}"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21"/></svg></button></form>
  <div id="res" role="listbox"></div>
  <div id="chips"></div>
  <div id="gps" role="status" aria-live="polite">${t.locating}</div>
  <div id="pickhint" class="kicker" hidden>// ${t.where_now}</div>
  <div class="locrow"><button class="btn ghost" id="setloc" type="button">${t.set_my_loc}</button><button class="btn" id="usegps" type="button" hidden>${t.use_gps}</button></div>
</section>
<section id="preview" class="hud br" hidden>
  <div class="kicker">// ROUTE</div>
  <div id="pname"></div><div id="pdetail" class="small"></div>
  <div class="sum" id="psum"></div>
  <div class="row"><button class="btn primary" id="go" type="button">▶ ${t.start}</button><button class="btn ghost" id="sim" type="button">${t.simulate}</button></div>
  <div class="row"><button class="btn" id="sethome" type="button">🏠 ${t.set_home}</button><button class="btn" id="setwork" type="button">💼 ${t.set_work}</button><button class="btn danger" id="cancel" type="button">${t.cancel}</button></div>
  <div class="small" id="pmanual" hidden>${t.manual_note}</div>
  <div class="small">${t.safety}</div>
</section>
<section id="banner" class="hud" hidden aria-live="polite">
  <div id="bi"></div><div id="bd"></div><div id="bt"></div>
  <div id="bthen" hidden><span id="bti"></span><span id="btt"></span></div>
</section>
<section id="navbar" class="hud br" hidden>
  <div id="eta"><b id="etaA">--:--</b><span>${t.arrive_at}</span><b id="etaT" style="font-size:1.4rem;color:var(--fg)"></b><b id="etaD" style="font-size:1.4rem;color:var(--fg)"></b></div>
  <button class="btn" id="mute" type="button"></button><button class="btn" id="overview" type="button" aria-label="${t.overview}">⤢</button><button class="btn danger" id="end" type="button">${t.end}</button>
</section>
<button class="btn primary" id="recenter" type="button" hidden>◎ ${t.recenter}</button>
<div id="simb" hidden>${t.sim_badge}</div>
<div id="arrived" class="hud br" hidden>${t.arrived}</div>
<div id="corner"><div class="seg" role="group" aria-label="${t.theme}"><button type="button" data-theme-opt="light">☀️ ${t.day}</button><button type="button" data-theme-opt="dark">🌙 ${t.night}</button></div>
<div class="seg" role="group" aria-label="${t.language}"><button type="button" data-lang="he" aria-pressed="${lang === 'he'}">עב</button><button type="button" data-lang="en" aria-pressed="${lang === 'en'}">EN</button></div></div>
<div id="foot">${t.disclaimer}</div>
<div id="toast" role="status" hidden></div>
<script type="module" nonce="{{NONCE}}">
import * as ml from '/vendor/maplibre-gl.mjs';
const L=${L};const LANG=${JSON.stringify(lang)};const TILES=${JSON.stringify(TILES)};const SIMX=${simx};
${app}
</script></body></html>`;
}
