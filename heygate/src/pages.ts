import { NONCE } from './http';
import { dirOf, LOG, type Lang } from './i18n';
import type { Gate } from './store';
import { UI, type UIKey } from './ui-strings';

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

type T = Record<UIKey, string>;
const tr = (lang: Lang): T => UI[lang];

// ------------------------------------------------------------ design system

const LIGHT = `--bg:#f3f5f8;--bg2:#e9edf2;--card:#ffffff;--fg:#0f1720;--muted:#5b6675;--line:#dfe4ea;
  --brand:#2563eb;--brand-fg:#fff;--brand-soft:#e7efff;
  --ok:#0f9d58;--ok-soft:#e3f6ec;--bad:#d93025;--bad-soft:#fdecea;--warn:#b26a00;--warn-soft:#fff4e0;
  --shadow:0 1px 2px #0000000d,0 8px 24px #0000000f;color-scheme:light;`;
const DARK = `--bg:#0b1016;--bg2:#121922;--card:#141c26;--fg:#e9eef4;--muted:#93a0b0;--line:#243040;
  --brand:#4f8cff;--brand-fg:#fff;--brand-soft:#16243d;
  --ok:#3ccf83;--ok-soft:#10291d;--bad:#ff6b5e;--bad-soft:#2d1513;--warn:#f5b041;--warn-soft:#2b2110;
  --shadow:0 1px 2px #0006,0 8px 24px #0005;color-scheme:dark;`;

const CSS = `
:root{${LIGHT}--radius:16px;--font:system-ui,-apple-system,"Segoe UI",Rubik,Roboto,Arial,sans-serif}
:root[data-theme=dark]{${DARK}}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){${DARK}}}
html{font-size:clamp(16px,calc(14.6px + .2vw),18px);-webkit-text-size-adjust:100%;text-size-adjust:100%}
html,body{max-width:100%;overflow-x:hidden;overflow-x:clip}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:1rem/1.55 var(--font);-webkit-font-smoothing:antialiased;transition:background-color .2s,color .2s;min-height:100vh;min-height:100dvh;display:flex;flex-direction:column}
body>.page{flex:1}
h1,h2,h3{line-height:1.25;margin:0}h1{font-size:1.4rem}h2{font-size:1.15rem}h3{font-size:1rem}
p{margin:.4em 0}a{color:var(--brand)}
.muted{color:var(--muted)}.small{font-size:.875rem}.ok{color:var(--ok)}.bad{color:var(--bad)}.warn{color:var(--warn)}.center{text-align:center}
.card{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);padding:18px;box-shadow:var(--shadow)}
.stack>*+*{margin-top:14px}.row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.grow{flex:1;min-width:0}
.between{justify-content:space-between}
button,.btn{font:inherit;cursor:pointer;border:0;border-radius:12px;padding:11px 18px;min-height:46px;display:inline-flex;align-items:center;justify-content:center;gap:8px;font-weight:600;text-decoration:none;transition:filter .15s,transform .05s;-webkit-tap-highlight-color:transparent}
button:active{transform:scale(.98)}button:focus-visible,input:focus-visible,select:focus-visible,a:focus-visible{outline:3px solid var(--brand);outline-offset:2px}
.btn-primary{background:var(--brand);color:var(--brand-fg)}.btn-primary:hover{filter:brightness(1.08)}
.btn-ghost{background:transparent;color:var(--brand);border:1px solid var(--line)}
.btn-soft{background:var(--brand-soft);color:var(--brand)}
.btn-danger{background:var(--bad);color:#fff}.btn-ok{background:var(--ok);color:#fff}
.btn-block{width:100%}.btn-sm{min-height:38px;padding:7px 12px;font-size:.875rem}
button[disabled]{opacity:.55;cursor:default}
input,select,textarea{font:inherit;font-size:max(16px,1rem);width:100%;min-height:48px;padding:10px 12px;border:1px solid var(--line);border-radius:12px;background:var(--bg);color:var(--fg)}
label{display:block;font-weight:600;font-size:.94rem}label>input,label>select{margin-top:6px;font-weight:400;font-size:max(16px,1rem)}
input[type=checkbox],input[type=radio]{width:auto;min-height:0}
input.mono,input.ltr{font-size:max(16px,1rem)}
.hint{font-size:.8125rem;color:var(--muted);font-weight:400;margin-top:4px}
.mono,code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.8125rem;direction:ltr;unicode-bidi:isolate;word-break:break-all}
.ltr{direction:ltr;text-align:start}
.pill{display:inline-flex;align-items:center;gap:6px;padding:3px 10px;border-radius:99px;font-size:.8125rem;font-weight:600;background:var(--bg2);color:var(--muted)}
.pill.ok{background:var(--ok-soft);color:var(--ok)}.pill.bad{background:var(--bad-soft);color:var(--bad)}.pill.warn{background:var(--warn-soft);color:var(--warn)}
.dot{width:9px;height:9px;border-radius:50%;background:currentColor;display:inline-block}
.qr svg{width:220px;height:220px;max-width:100%;background:#fff;border-radius:14px;padding:4px}
.switch{position:relative;width:52px;height:30px;flex:none}.switch input{opacity:0;width:0;height:0;position:absolute}
.switch span{position:absolute;inset:0;background:var(--line);border-radius:99px;transition:.2s;cursor:pointer}
.switch span:before{content:"";position:absolute;width:24px;height:24px;top:3px;inset-inline-start:3px;background:#fff;border-radius:50%;transition:.2s;box-shadow:0 1px 3px #0004}
.switch input:checked+span{background:var(--ok)}
[dir=rtl] .switch input:checked+span:before{transform:translateX(-22px)}[dir=ltr] .switch input:checked+span:before{transform:translateX(22px)}
.switch input:focus-visible+span{outline:3px solid var(--brand);outline-offset:2px}
#toasts{position:fixed;inset-inline:0;bottom:84px;display:flex;flex-direction:column;align-items:center;gap:8px;z-index:50;pointer-events:none;padding:0 16px}
.toast{background:var(--fg);color:var(--bg);padding:12px 18px;border-radius:12px;box-shadow:var(--shadow);font-weight:600;max-width:520px;animation:up .2s ease-out}
.toast.bad{background:var(--bad);color:#fff}.toast.ok{background:var(--ok);color:#fff}
@keyframes up{from{transform:translateY(10px);opacity:0}}
dialog{border:0;border-radius:20px;padding:22px;max-width:min(440px,calc(100vw - 32px));width:100%;background:var(--card);color:var(--fg);box-shadow:0 20px 60px #0007}
dialog::backdrop{background:#0008;backdrop-filter:blur(2px)}
.copy{display:flex;gap:8px;align-items:center;background:var(--bg);border:1px solid var(--line);border-radius:12px;padding:6px}
.copy code{flex:1;min-width:0;padding:6px}
.reccode{font:600 clamp(.9rem,4.4vw,1.2rem)/1.3 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;letter-spacing:.02em;text-align:center;white-space:nowrap;overflow-x:auto;background:var(--bg);border:1px solid var(--line);border-radius:12px;padding:14px 8px;user-select:all;-webkit-user-select:all}
pre{white-space:pre-wrap;word-break:break-word;background:var(--bg);border:1px solid var(--line);border-radius:12px;padding:12px;font:.875rem/1.6 var(--font);margin:0;max-height:260px;overflow:auto}
details>summary{cursor:pointer;font-weight:600;color:var(--brand);list-style:none;padding:6px 0}details>summary::-webkit-details-marker{display:none}
details>summary:before{content:"▸ ";display:inline-block;transition:.15s}details[open]>summary:before{transform:rotate(90deg)}
[dir=rtl] details>summary:before{content:"◂ "}[dir=rtl] details[open]>summary:before{transform:rotate(-90deg)}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
.ctl{display:inline-flex;gap:8px;align-items:center;flex-wrap:wrap}
.seg{display:inline-flex;background:var(--bg2);border:1px solid var(--line);border-radius:99px;padding:3px;gap:2px;flex:none}
.seg button{min-height:34px;padding:4px 12px;border-radius:99px;background:transparent;color:var(--muted);font-size:.875rem;gap:6px;font-weight:600}
.seg button[aria-pressed=true]{background:var(--card);color:var(--fg);box-shadow:0 1px 3px #0003}
.ctl-float{position:fixed;top:max(12px,env(safe-area-inset-top));inset-inline-end:max(12px,env(safe-area-inset-left));z-index:30}
@media (max-width:480px){.seg .tl{display:none}.seg button{padding:4px 10px}}
.or{display:flex;gap:12px;align-items:center;color:var(--muted)}.or:before,.or:after{content:"";flex:1;border-top:1px solid var(--line)}
footer.disc{text-align:center;color:var(--muted);font-size:.75rem;padding:14px 16px calc(14px + env(safe-area-inset-bottom))}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}`;

/** Day / night and Hebrew / English switches, side by side. */
function controls(lang: Lang, t: T) {
  return `<div class="ctl"><div class="seg theme-switch" role="group" aria-label="${t.theme}"><button type="button" data-theme-opt="light" aria-pressed="false" title="${t.day}"><span aria-hidden="true">☀️</span><span class="tl">${t.day}</span></button><button type="button" data-theme-opt="dark" aria-pressed="false" title="${t.night}"><span aria-hidden="true">🌙</span><span class="tl">${t.night}</span></button></div><div class="seg" role="group" aria-label="${t.language}"><button type="button" data-lang="he" lang="he" aria-pressed="${lang === 'he'}">עב</button><button type="button" data-lang="en" lang="en" aria-pressed="${lang === 'en'}">EN</button></div></div>`;
}
const floatControls = (lang: Lang, t: T) => `<div class="ctl-float">${controls(lang, t)}</div>`;

const THEME_BOOT = `try{var t=localStorage.getItem('theme');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t)}catch(e){}`;

interface ShellOpts {
  css?: string;
  js?: string;
  app?: boolean;
  footer?: boolean; // the disclaimer line; on by default
}

function shell(lang: Lang, title: string, body: string, o: ShellOpts = {}) {
  const t = tr(lang);
  const L = JSON.stringify(t).replace(/</g, '\\u003c');
  return `<!doctype html><html lang="${lang}" dir="${dirOf(lang)}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer">
<meta name="color-scheme" content="light dark"><meta name="theme-color" content="#2563eb"><script nonce="${NONCE}">${THEME_BOOT}</script>
${o.app ? '<link rel="manifest" href="/manifest.webmanifest"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="mobile-web-app-capable" content="yes"><link rel="apple-touch-icon" href="/icon.svg">' : ''}
<link rel="icon" href="/icon.svg"><title>${esc(title)}</title><style>${CSS}${o.css ?? ''}</style></head>
<body><div class="page">${body}</div>${o.footer === false ? '' : `<footer class="disc">${t.disclaimer}</footer>`}<div id="toasts" role="status" aria-live="polite"></div>
<script nonce="${NONCE}">const L=${L};${CORE_JS}${o.js ?? ''}</script></body></html>`;
}

export const iconSvg = () =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" rx="22" fill="#2563eb"/><path d="M22 70V40l26-16 26 16v30" fill="none" stroke="#fff" stroke-width="7" stroke-linejoin="round"/><path d="M34 70V50h28v20M34 58h28" fill="none" stroke="#fff" stroke-width="5"/></svg>`;

export const manifest = () =>
  JSON.stringify({
    name: 'HeyGate',
    short_name: 'HeyGate',
    start_url: '/car',
    scope: '/car',
    display: 'standalone',
    background_color: '#0b1016',
    theme_color: '#2563eb',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
  });

/** Shared client helpers. `L` (the page's dictionary) is defined before this. */
const CORE_JS = String.raw`
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const F=(s,...a)=>String(s).replace(/\{(\d)\}/g,(_,i)=>a[i]??'');
class ApiError extends Error{constructor(m,status,data){super(m);this.status=status;this.data=data;}}
async function post(path,body){let r;
  try{r=await fetch(path,{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json','x-gate-csrf':'1'},body:JSON.stringify(body||{})});}
  catch{throw new ApiError(L.no_internet,0,{});}
  const d=await r.json().catch(()=>({ok:false,message:F(L.error_status,r.status)}));
  if(r.status===401&&path.includes('/api/')){location.reload();throw new ApiError(L.need_login,401,d);}
  if(!r.ok||d.ok===false)throw new ApiError(d.message||F(L.error_status,r.status),r.status,d);return d;}
const api=(p,b)=>post((window.API_BASE||'/app/api/')+p,b);
const darkMQ=matchMedia('(prefers-color-scheme: dark)');
const themePref=()=>document.documentElement.getAttribute('data-theme')||'auto';
const themeNow=()=>{const p=themePref();return p==='auto'?(darkMQ.matches?'dark':'light'):p;};
function setTheme(t){const r=document.documentElement;if(t==='auto'){r.removeAttribute('data-theme');try{localStorage.removeItem('theme')}catch{}}
  else{r.setAttribute('data-theme',t);try{localStorage.setItem('theme',t)}catch{}}syncTheme();}
function syncTheme(){const now=themeNow(),pref=themePref();
  $$('.theme-switch [data-theme-opt]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.themeOpt===now)));
  $$('.theme-pick [data-theme-opt]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.themeOpt===pref)));
  const m=document.querySelector('meta[name=theme-color]');if(m)m.content=now==='dark'?'#0b1016':'#2563eb';}
document.addEventListener('click',e=>{const b=e.target.closest('[data-theme-opt]');if(b)setTheme(b.dataset.themeOpt);
  const l=e.target.closest('[data-lang]');if(l){document.cookie='hg_lang='+l.dataset.lang+'; Path=/; Max-Age=31536000; SameSite=Lax'+(location.protocol==='https:'?'; Secure':'');
    const go=()=>location.reload();if(window.LOGGED_IN)api('settings',{lang:l.dataset.lang}).then(go,go);else go();}});
darkMQ.addEventListener('change',syncTheme);syncTheme();
function toast(msg,kind){const t=document.createElement('div');t.className='toast '+(kind||'');t.textContent=msg;$('#toasts').append(t);setTimeout(()=>t.remove(),3200);}
function ask(title,text,okLabel,danger){return new Promise(res=>{const d=document.createElement('dialog');
  d.innerHTML='<div class="stack"><h2>'+esc(title)+'</h2>'+(text?'<p class="muted">'+esc(text)+'</p>':'')+'<div class="row" style="justify-content:flex-end"><button class="btn-ghost" value="no">'+L.cancel+'</button><button class="'+(danger?'btn-danger':'btn-primary')+'" value="yes">'+esc(okLabel||L.ok)+'</button></div></div>';
  document.body.append(d);d.addEventListener('click',e=>{const v=e.target.closest('button')?.value;if(v||e.target===d){d.close();d.remove();res(v==='yes');}});d.addEventListener('cancel',()=>{d.remove();res(false);});d.showModal();d.querySelector('[value=yes]').focus();});}
document.addEventListener('click',e=>{const t=e.target.closest('[data-copy]');if(!t)return;
  navigator.clipboard.writeText(t.dataset.copy).then(()=>{const o=t.textContent;t.textContent=L.copied;setTimeout(()=>t.textContent=o,1500);},()=>toast(L.copy_failed,'bad'));});
const copyBox=v=>'<div class="copy"><code>'+esc(v)+'</code><button class="btn-soft btn-sm" data-copy="'+esc(v)+'">'+L.copy+'</button></div>';
const b64u=b=>{let s='';for(const x of new Uint8Array(b))s+=String.fromCharCode(x);return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');};
const ub=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-s.length%4)%4)),c=>c.charCodeAt(0));
const pkSupported=()=>!!(window.PublicKeyCredential&&navigator.credentials);
function bioName(){const u=navigator.userAgent;if(/iPhone|iPad/.test(u))return 'Face ID / Touch ID';if(/Android/.test(u))return L.bio_android;if(/Macintosh/.test(u))return 'Touch ID';if(/Windows/.test(u))return 'Windows Hello';return 'Passkey';}
$$('.bio').forEach(e=>e.textContent=bioName());
function pkError(e){if(e&&e.name==='NotAllowedError')return L.pk_cancelled;if(e&&e.name==='InvalidStateError')return L.pk_exists;if(e&&e.name==='SecurityError')return L.pk_blocked;return e&&e.message||L.error;}
async function pkCreate(o){const c=await navigator.credentials.create({publicKey:{...o,challenge:ub(o.challenge),user:{...o.user,id:ub(o.user.id)},excludeCredentials:(o.excludeCredentials||[]).map(x=>({...x,id:ub(x.id)}))}});
  return {id:c.id,rawId:b64u(c.rawId),type:c.type,authenticatorAttachment:c.authenticatorAttachment||undefined,clientExtensionResults:c.getClientExtensionResults(),
    response:{clientDataJSON:b64u(c.response.clientDataJSON),attestationObject:b64u(c.response.attestationObject),transports:c.response.getTransports?c.response.getTransports():[]}};}
async function pkGet(o){const c=await navigator.credentials.get({publicKey:{...o,challenge:ub(o.challenge),allowCredentials:(o.allowCredentials||[]).map(x=>({...x,id:ub(x.id)}))}});
  return {id:c.id,rawId:b64u(c.rawId),type:c.type,authenticatorAttachment:c.authenticatorAttachment||undefined,clientExtensionResults:c.getClientExtensionResults(),
    response:{clientDataJSON:b64u(c.response.clientDataJSON),authenticatorData:b64u(c.response.authenticatorData),signature:b64u(c.response.signature),userHandle:c.response.userHandle?b64u(c.response.userHandle):undefined}};}
function deviceName(){const u=navigator.userAgent;if(/iPhone/.test(u))return 'iPhone';if(/iPad/.test(u))return 'iPad';if(/Android/.test(u))return 'Android';if(/Macintosh/.test(u))return 'Mac';if(/Windows/.test(u))return 'Windows';return L.device;}
async function addPasskey(){const o=await api('passkey/options');let cred;try{cred=await pkCreate(o.options);}catch(err){throw new Error(pkError(err));}
  await api('passkey/verify',{token:o.token,response:cred,name:deviceName()});}
async function busy(btn,fn){const o=btn.innerHTML;btn.disabled=true;btn.innerHTML='<span aria-hidden="true">⏳</span> '+L.wait;try{return await fn();}finally{btn.innerHTML=o;btn.disabled=!!(window.LOCKED_UNTIL>Date.now()&&btn.classList.contains('needs-unlock'));}}
function showRecovery(code,title,then){const d=document.createElement('dialog');
  d.innerHTML='<div class="stack"><h2>'+esc(title||L.rec_title)+'</h2><p class="muted small">'+L.rec_text+'</p>'+
  '<div class="reccode" dir="ltr">'+esc(code)+'</div><button class="btn-soft btn-block" data-copy="'+esc(code)+'">📋 '+L.copy+'</button>'+
  '<label class="row" style="font-weight:400"><input type="checkbox" id="saved" style="width:22px;min-height:22px"> '+L.rec_saved+'</label><button class="btn-primary btn-block" id="cont" disabled>'+L.continue+'</button></div>';
  document.body.append(d);d.addEventListener('cancel',e=>e.preventDefault());d.showModal();
  d.querySelector('#saved').onchange=e=>{d.querySelector('#cont').disabled=!e.target.checked;};
  d.querySelector('#cont').onclick=()=>{d.close();d.remove();(then||(()=>location.reload()))();};}
function offerPasskey(){if(!pkSupported())return location.reload();const d=document.createElement('dialog');
  d.innerHTML='<div class="stack center"><div style="font-size:2.6rem">🔐</div><h2>'+esc(F(L.offer_pk_title,bioName()))+'</h2><p class="muted small">'+L.offer_pk_text+'</p>'+
  '<button class="btn-primary btn-block" id="pky">'+L.offer_pk_yes+'</button><button class="btn-ghost btn-block" id="pkn">'+L.offer_pk_no+'</button><p class="bad small" id="pke"></p></div>';
  document.body.append(d);d.addEventListener('cancel',e=>e.preventDefault());d.showModal();
  d.querySelector('#pkn').onclick=()=>location.reload();
  d.querySelector('#pky').onclick=e=>busy(e.currentTarget,async()=>{try{await addPasskey();toast(L.pk_added,'ok');setTimeout(()=>location.reload(),500);}catch(err){d.querySelector('#pke').textContent=err.message;}});}`;

// ------------------------------------------------------------ public pages

/** What Grok (or any fetcher) reads. Short and bilingual so it can be relayed verbatim. */
export function resultPage(r: { ok: true; label: string; repeated: boolean } | { ok: false; message: string }) {
  const title = r.ok ? `Gate opened: ${r.label} — השער נפתח` : `Gate NOT opened — השער לא נפתח`;
  const body = r.ok
    ? `<h1>✅ The gate is opening — השער נפתח</h1><p><b>${esc(r.label)}</b>${r.repeated ? ' (already sent a few seconds ago)' : ''}</p>
       <p>SUCCESS: The gate "${esc(r.label)}" was opened. Tell the driver: "The gate is opening."</p>`
    : `<h1>❌ The gate did not open — השער לא נפתח</h1><p>FAILED: ${esc(r.message)}. Tell the driver the gate did not open.</p>`;
  return shell('en', title, `<main class="card" style="max-width:640px;margin:15vh auto;text-align:center;width:calc(100% - 32px)">${body}</main>`);
}

export function pairPage(lang: Lang) {
  const t = tr(lang);
  const css = `main{min-height:calc(100vh - 60px);display:grid;place-items:center;padding:16px}
.code{font:700 clamp(44px,11vw,84px)/1 ui-monospace,Menlo,monospace;letter-spacing:.08em;direction:ltr;margin:18px 0;color:var(--brand)}
ol{text-align:start;margin:0 auto;max-width:420px;padding-inline-start:22px}li{margin:6px 0}`;
  const body = `${floatControls(lang, t)}<main><div class="card stack" style="max-width:640px;width:100%;text-align:center;padding:clamp(18px,4vw,40px)">
<div style="font-size:44px" aria-hidden="true">🚘</div><h1>${t.pair_title}</h1>
<p class="muted">${t.pair_sub}</p>
<div class="code" id="code" aria-live="polite">······</div>
<ol><li>${t.pair_1}</li><li>${t.pair_2.replace('←', t.arrow)}</li><li>${t.pair_3}</li></ol>
<p class="muted small" id="status">${t.pair_creating}</p><button class="btn-ghost" id="again" hidden>${t.pair_new}</button></div></main>`;
  const js = `
let code='',until=0,timer;
async function start(){$('#again').hidden=true;try{const d=await post('/car/pair/start');code=d.code;until=Date.now()+d.expiresIn*1000;
  $('#code').textContent=code.slice(0,3)+' '+code.slice(3);poll();}catch(e){$('#status').textContent=e.message;$('#again').hidden=false;}}
async function poll(){clearTimeout(timer);const left=Math.round((until-Date.now())/1000);
  if(left<=0){$('#status').textContent=L.pair_expired;$('#code').textContent='······';$('#again').hidden=false;return;}
  $('#status').textContent=F(L.pair_waiting,Math.floor(left/60)+':'+String(left%60).padStart(2,'0'));
  try{const d=await post('/car/pair/status',{code});if(d.done){$('#status').innerHTML='<span class="ok">'+L.pair_ok+'</span>';setTimeout(()=>location.reload(),600);return;}}
  catch(e){if(e.status===410){until=0;}}
  timer=setTimeout(poll,2500);}
$('#again').onclick=start;start();`;
  return shell(lang, t.pair_title, body, { css, js, app: true });
}

export function carPage(lang: Lang, gates: Gate[], active: boolean, deviceName: string) {
  const t = tr(lang);
  const css = `main{min-height:calc(100vh - 60px);display:flex;flex-direction:column;gap:clamp(16px,3vh,28px);align-items:center;justify-content:center;padding:clamp(56px,8vh,90px) clamp(16px,4vw,48px) 24px}
.gates{display:grid;gap:clamp(14px,2.5vw,28px);width:100%;max-width:1500px;grid-template-columns:repeat(auto-fit,minmax(min(100%,380px),1fr))}
.gates.one{max-width:900px}
.big{width:100%;min-height:clamp(130px,30vh,300px);border-radius:clamp(24px,3vw,40px);background:var(--brand);color:#fff;font-size:clamp(1.8rem,4.2vw,3.4rem);font-weight:800;gap:.5em;box-shadow:0 14px 34px #2563eb55;touch-action:manipulation;padding:20px}
.big .ico{font-size:1.15em}.big.ok{background:var(--ok);box-shadow:0 14px 34px #0f9d5855}.big.bad{background:var(--bad);box-shadow:none}
@media (orientation:landscape) and (max-height:500px){.big{min-height:42vh}}
#msg{font-size:clamp(1.2rem,2.2vw,1.8rem);font-weight:600;min-height:1.6em;text-align:center}`;
  const buttons = !active
    ? `<div class="card center"><div style="font-size:40px">⛔</div><h2>${t.car_disabled}</h2><p class="muted">${t.car_disabled_text}</p></div>`
    : gates.length
      ? `<div class="gates${gates.length === 1 ? ' one' : ''}">${gates.map((g) => `<button class="big" data-alias="${esc(g.alias)}"><span class="ico" aria-hidden="true">⇪</span><span class="t">${esc(g.label || g.alias)}</span></button>`).join('')}</div>`
      : `<div class="card"><p>${t.no_gates}</p></div>`;
  const js = `
$$('.big').forEach(b=>b.addEventListener('click',async()=>{const t=b.querySelector('.t'),label=t.textContent;b.disabled=true;t.textContent=L.opening;
  try{const d=await post('/car/open',{alias:b.dataset.alias});b.classList.add('ok');$('#msg').textContent=d.repeated?L.already_sent:L.opened;if(navigator.vibrate)navigator.vibrate(60);}
  catch(e){b.classList.add('bad');$('#msg').textContent='❌ '+e.message;}
  setTimeout(()=>{b.disabled=false;b.classList.remove('ok','bad');t.textContent=label;$('#msg').textContent='';},3000);}));`;
  return shell(
    lang,
    t.open_gate,
    `${floatControls(lang, t)}<main>${buttons}<div id="msg" role="status" aria-live="polite"></div><div class="muted small">🔒 ${esc(deviceName)}</div></main>`,
    { css, js, app: true },
  );
}

// ------------------------------------------------------------ sign-up & sign-in

const AUTH_CSS = `.auth{min-height:calc(100vh - 50px);display:grid}
.auth .side{display:none}
.auth .pane{display:flex;align-items:center;justify-content:center;padding:clamp(64px,9vh,96px) 16px 24px}
.auth .pane>div{width:100%;max-width:480px}
.brand{display:flex;gap:12px;align-items:center;margin-bottom:18px}.brand img{width:44px;height:44px}
.lock{background:var(--bad-soft);color:var(--bad);border-radius:14px;padding:16px;text-align:center}.lock b{font:700 2.1rem ui-monospace,monospace;display:block;direction:ltr}
@media (min-width:900px){
  .auth{grid-template-columns:minmax(380px,1fr) minmax(460px,1.1fr)}
  .auth .side{display:flex;flex-direction:column;justify-content:center;gap:28px;padding:clamp(40px,6vw,96px);color:#fff;
    background:radial-gradient(1200px 600px at 110% -10%,#38bdf8 0,transparent 55%),linear-gradient(160deg,#1e3a8a,#2563eb 60%,#1d4ed8)}
  .auth .side h1{font-size:clamp(2rem,3.2vw,3rem)}.auth .side p{font-size:1.1rem;opacity:.9;max-width:30ch}
  .auth .side img{width:72px;height:72px;border-radius:20px;box-shadow:0 12px 30px #0004}
  .auth .side ul{list-style:none;padding:0;margin:0;display:grid;gap:14px;font-size:1.05rem}
  .auth .side li{display:flex;gap:12px;align-items:center}.auth .side li span{font-size:1.4rem;width:44px;height:44px;display:grid;place-items:center;background:#ffffff1f;border-radius:12px}
  .auth .pane .brand{display:none}.auth .card{padding:32px}
}`;

function authLayout(lang: Lang, t: T, inner: string) {
  const brand = `<div class="brand"><img src="/icon.svg" alt=""><div><h1>HeyGate</h1><div class="muted small">${t.tagline}</div></div></div>`;
  const side = `<aside class="side" aria-hidden="true"><img src="/icon.svg" alt=""><div><h1>HeyGate</h1><p>${t.side_text}</p></div>
<ul><li><span>🗣️</span>${t.side_1}</li><li><span>🚘</span>${t.side_2}</li><li><span>🔐</span>${t.side_3}</li><li><span>🛡️</span>${t.side_4}</li></ul></aside>`;
  return `${floatControls(lang, t)}<div class="auth">${side}<main class="pane"><div>${brand}${inner}</div></main></div>`;
}

const LOCK_JS = `let lockTimer;
function lock(s){const end=Date.now()+s*1000;window.LOCKED_UNTIL=end;$('#lock')&&($('#lock').hidden=false);$$('.needs-unlock').forEach(b=>b.disabled=true);clearInterval(lockTimer);
  const tick=()=>{const l=Math.max(0,Math.round((end-Date.now())/1000));$('#lockt')&&($('#lockt').textContent=String(Math.floor(l/60)).padStart(2,'0')+':'+String(l%60).padStart(2,'0'));
    if(!l){clearInterval(lockTimer);$('#lock')&&($('#lock').hidden=true);$$('.needs-unlock').forEach(b=>b.disabled=false);}};tick();lockTimer=setInterval(tick,1000);}
function onErr(err){if(err.status===429&&err.data&&err.data.retryAfter){view('login');lock(err.data.retryAfter);}else $('#err').textContent=err.message;}
if(!pkSupported()){$('#nopk')&&($('#nopk').hidden=false);$$('.needs-pk').forEach(b=>b.hidden=true);$$('.needs-pk-or').forEach(b=>b.hidden=true);}`;
const lockBox = (t: T) => `<div class="lock" id="lock" hidden>${t.lock_title}<br>${t.lock_retry}<b id="lockt"></b></div>`;

/** Customers: sign-up first; then sign in with a passkey or username + password. */
export function appAuthPage(lang: Lang, signupsOpen: boolean, lockedSeconds = 0) {
  const t = tr(lang);
  const signup = signupsOpen
    ? `<section class="card stack" id="v-signup" hidden><h2>${t.signup_title}</h2><p class="muted small">${t.signup_sub}</p>
<form id="sf" class="stack" novalidate>
<label>${t.username}<input name="username" class="ltr" autocomplete="username" autocapitalize="none" spellcheck="false" required minlength="3" maxlength="32" pattern="[A-Za-z0-9._\\-]{3,32}"><div class="hint">${t.username_hint}</div></label>
<label>${t.password}<input name="password" type="password" autocomplete="new-password" minlength="10" maxlength="256" required><div class="hint">${t.password_hint}</div></label>
<label>${t.password2}<input name="password2" type="password" autocomplete="new-password" minlength="10" maxlength="256" required></label>
<button class="btn-primary btn-block needs-unlock" type="submit">${t.create_account}</button>
<p class="hint">${t.agree_privacy}</p></form>
<p class="center small">${t.have_account} <a href="#login" data-view="login">${t.sign_in}</a></p></section>`
    : '';
  const login = `<section class="card stack" id="v-login" hidden>${lockBox(t)}<h2 class="center">${t.signin_title}</h2>
<button class="btn-primary btn-block needs-pk needs-unlock" id="go" style="min-height:58px;font-size:1.05rem"><span>🔐 ${t.signin_with} <span class="bio">Passkey</span></span></button>
<div class="or needs-pk-or">${t.or}</div>
<form id="lf" class="stack"><label>${t.username}<input name="username" class="ltr" autocomplete="username" autocapitalize="none" spellcheck="false" required maxlength="32"></label>
<label>${t.password}<input name="password" type="password" autocomplete="current-password" required maxlength="256"></label>
<button class="btn-soft btn-block needs-unlock" type="submit">${t.signin_password}</button></form>
<details><summary>${t.forgot}</summary><form id="rf" class="stack" style="margin-top:10px"><input name="code" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="XXXXX-XXXXX-XXXXX-XXXXX" required style="direction:ltr;text-align:center;letter-spacing:.06em">
<button class="btn-ghost btn-block needs-unlock" type="submit">${t.rec_login}</button></form></details>
${signupsOpen ? `<p class="center small">${t.no_account} <a href="#signup" data-view="signup">${t.create_account}</a></p>` : `<p class="hint center">${t.signups_closed}</p>`}</section>`;
  const body = authLayout(lang, t, `<div class="card" id="nopk" hidden><b>${t.no_pk_title}</b><p class="muted small">${t.no_pk_text}</p></div>${signup}${login}<p id="err" class="bad" role="alert"></p>`);
  const js = `
function view(v){if(!$('#v-'+v))v='login';$$('[id^=v-]').forEach(s=>s.hidden=s.id!=='v-'+v);$('#err').textContent='';const f=$('#v-'+v+' input');if(f&&matchMedia('(min-width:900px)').matches)f.focus();}
document.addEventListener('click',e=>{const a=e.target.closest('[data-view]');if(a){e.preventDefault();view(a.dataset.view);history.replaceState(null,'','#'+a.dataset.view);}});
let known=false;try{known=!!localStorage.getItem('hg_known')}catch{}
view(location.hash==='#signup'?'signup':location.hash==='#login'||known?'login':'signup');
window.addEventListener('hashchange',()=>view(location.hash==='#signup'?'signup':'login'));
const remember=()=>{try{localStorage.setItem('hg_known','1')}catch{};history.replaceState(null,'','/app');};
${LOCK_JS}
${lockedSeconds > 0 ? `view('login');lock(${Math.floor(lockedSeconds)});` : ''}
$('#sf')?.addEventListener('submit',e=>{e.preventDefault();const f=new FormData(e.target);$('#err').textContent='';
  if(!e.target.checkValidity()){e.target.reportValidity();return;}
  if(f.get('password')!==f.get('password2')){$('#err').textContent=L.password_mismatch;return;}
  busy(e.submitter,async()=>{try{const d=await post('/app/signup',{username:f.get('username'),password:f.get('password')});remember();window.LOGGED_IN=true;
    showRecovery(d.recoveryCode,L.rec_created,offerPasskey);}catch(err){onErr(err);}});});
$('#lf').addEventListener('submit',e=>{e.preventDefault();const f=new FormData(e.target);$('#err').textContent='';busy(e.submitter,async()=>{
  try{await post('/app/login/password',{username:f.get('username'),password:f.get('password')});remember();location.reload();}catch(err){onErr(err);}});});
$('#go').addEventListener('click',e=>{$('#err').textContent='';busy(e.currentTarget,async()=>{
  try{const o=await post('/app/login/options');let cred;try{cred=await pkGet(o.options);}catch(err){throw new Error(pkError(err));}
    await post('/app/login/verify',{token:o.token,response:cred});remember();location.reload();}catch(err){onErr(err);}});});
$('#rf').addEventListener('submit',e=>{e.preventDefault();$('#err').textContent='';const f=new FormData(e.target);busy(e.submitter,async()=>{
  try{const d=await post('/app/recover',{code:f.get('code')});remember();showRecovery(d.recoveryCode,L.rec_after_login);}catch(err){onErr(err);}});});`;
  return shell(lang, `${t.sign_in} · HeyGate`, body, { css: AUTH_CSS, js });
}

/** Super-admin sign-in (and the one-time setup with SETUP_CODE). */
export function saAuthPage(lang: Lang, firstTime: boolean, lockedSeconds = 0) {
  const t = tr(lang);
  const inner = firstTime
    ? `<section class="card stack"><h2>${t.sa_setup_title}</h2><p class="muted small">${t.sa_setup_text}</p>
<form id="f1" class="stack"><label>${t.setup_code}<input name="setupCode" class="ltr" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="XXXX-XXXX-XXXX-XXXX" required></label>
<button class="btn-primary btn-block needs-unlock" type="submit">${t.sa_create_pk}</button></form></section>`
    : `<section class="card stack center">${lockBox(t)}<div style="font-size:3rem" aria-hidden="true">🛠️</div><h2>${t.sa_title}</h2>
<button class="btn-primary btn-block needs-unlock" id="go" style="min-height:58px">${t.sa_signin}</button></section>`;
  const body = authLayout(lang, t, `<div class="card" id="nopk" hidden><b>${t.no_pk_title}</b></div>${inner}<p id="err" class="bad" role="alert"></p>`);
  const js = `function view(){}
${LOCK_JS}
${lockedSeconds > 0 ? `lock(${Math.floor(lockedSeconds)});` : ''}
$('#f1')?.addEventListener('submit',e=>{e.preventDefault();const f=new FormData(e.target);$('#err').textContent='';busy(e.submitter,async()=>{
  try{const o=await post('/sa/setup/options',{setupCode:f.get('setupCode')});let cred;try{cred=await pkCreate(o.options);}catch(err){throw new Error(pkError(err));}
    await post('/sa/setup/verify',{token:o.token,response:cred,name:deviceName()});location.reload();}catch(err){onErr(err);}});});
$('#go')?.addEventListener('click',e=>{$('#err').textContent='';busy(e.currentTarget,async()=>{
  try{const o=await post('/sa/login/options');let cred;try{cred=await pkGet(o.options);}catch(err){throw new Error(pkError(err));}
    await post('/sa/login/verify',{token:o.token,response:cred});location.reload();}catch(err){onErr(err);}});});`;
  return shell(lang, `${t.sa_title} · HeyGate`, body, { css: AUTH_CSS, js });
}

// ------------------------------------------------------------ customer app

const APP_CSS = `
.top{position:sticky;top:0;z-index:10;background:color-mix(in srgb,var(--bg) 85%,transparent);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border-bottom:1px solid var(--line)}
.top .in{max-width:1440px;margin:0 auto;padding:10px clamp(16px,3vw,32px);display:flex;align-items:center;gap:10px;flex-wrap:wrap}.top img{width:34px;height:34px}
@media (max-width:440px){.top img{display:none}.top .in{gap:6px;padding-inline:12px}.top .btn-sm{padding:7px 10px}}
.layout{max-width:1440px;margin:0 auto}
main{padding:16px 16px 24px;min-width:0}
.tabs{position:fixed;bottom:0;inset-inline:0;z-index:20;background:var(--card);border-top:1px solid var(--line);display:flex;justify-content:center;padding-bottom:env(safe-area-inset-bottom)}
.tabs button{flex:1;max-width:180px;flex-direction:column;gap:2px;background:none;color:var(--muted);border-radius:0;font-size:.75rem;font-weight:600;min-height:62px}
.tabs button .i{font-size:1.4rem;line-height:1}.tabs button[aria-selected=true]{color:var(--brand)}
body.app footer.disc{padding-bottom:calc(80px + env(safe-area-inset-bottom))}
.grid{display:grid;gap:14px}.grid.stats{grid-template-columns:1fr 1fr}
.cards{display:grid;gap:16px;align-items:start}
.home-cols{display:grid;gap:16px;align-items:start}
@media (min-width:700px){
  main{padding:20px clamp(20px,3vw,32px) 32px}
  .tabs{position:sticky;top:57px;bottom:auto;border:0;background:color-mix(in srgb,var(--bg) 85%,transparent);backdrop-filter:blur(12px);padding:12px clamp(20px,3vw,32px) 0;gap:8px;justify-content:flex-start;z-index:9}
  .tabs button{flex:none;flex-direction:row;font-size:.94rem;min-height:44px;border-radius:12px;padding:8px 16px;max-width:none}.tabs button .i{font-size:1.1rem}
  .tabs button[aria-selected=true]{background:var(--brand-soft)}#toasts{bottom:24px}
  body.app footer.disc{padding-bottom:14px}
  .grid.two{grid-template-columns:1fr 1fr}.grid.stats{grid-template-columns:repeat(4,1fr)}
  .cards{grid-template-columns:repeat(auto-fill,minmax(min(100%,400px),1fr))}
  .card{padding:22px}
}
@media (min-width:1100px){
  .layout{display:grid;grid-template-columns:230px minmax(0,1fr);gap:clamp(20px,2vw,36px);padding:0 clamp(20px,2.5vw,32px)}
  .tabs{position:sticky;top:74px;align-self:start;flex-direction:column;padding:20px 0;background:transparent;backdrop-filter:none}
  .tabs button{justify-content:flex-start;width:100%;min-height:48px;font-size:1rem;padding:10px 14px;gap:12px}
  .tabs button:hover{background:var(--bg2)}
  main{padding:20px 0 40px}
  .home-cols{grid-template-columns:minmax(0,1.5fr) minmax(320px,1fr)}
  .home-cols .grid.stats{grid-template-columns:1fr 1fr}
  .cards{grid-template-columns:repeat(auto-fill,minmax(440px,1fr))}
}
.theme-pick{display:flex;gap:8px;flex-wrap:wrap}.theme-pick button{flex:1;min-width:110px;background:var(--bg2);color:var(--fg);border:2px solid transparent}
.theme-pick button[aria-pressed=true]{border-color:var(--brand);background:var(--brand-soft);color:var(--brand)}
.gatebtn{width:100%;min-height:clamp(88px,12vh,130px);border-radius:22px;font-size:1.35rem;background:var(--brand);color:#fff;box-shadow:0 10px 24px #2563eb40}
.gatebtn.ok{background:var(--ok)}.gatebtn.bad{background:var(--bad)}
.step{display:flex;gap:14px;align-items:flex-start;padding:14px 0;border-top:1px solid var(--line)}.step:first-of-type{border-top:0}
.step .n{flex:none;width:34px;height:34px;border-radius:50%;display:grid;place-items:center;font-weight:700;background:var(--bg2);color:var(--muted)}
.step.done .n{background:var(--ok);color:#fff}.step.cur .n{background:var(--brand);color:#fff}
.stat{padding:14px 16px;border-radius:14px;background:var(--bg2)}.stat b{display:block;font-size:1.5rem}.stat b.sm{font-size:1.05rem}
.ch .head{display:flex;gap:12px;align-items:center}.ch .ico{font-size:1.75rem;width:48px;height:48px;border-radius:14px;display:grid;place-items:center;background:var(--bg2);flex:none}
.ch.off{opacity:.6}
.gate-row{display:grid;grid-template-columns:auto 1fr;gap:10px 12px;align-items:center;padding:12px 0;border-top:1px solid var(--line)}
.gate-row input[type=checkbox]{width:24px;height:24px;min-height:0;accent-color:var(--brand)}
.check{display:flex;gap:10px;align-items:flex-start;padding:8px 0}.check .s{flex:none;font-size:1.1rem}
.ev{display:flex;gap:12px;padding:10px 0;border-top:1px solid var(--line);align-items:flex-start}.ev .s{font-size:1.25rem;flex:none}
.chips{display:flex;gap:8px;flex-wrap:wrap}.chips button{min-height:36px;padding:6px 14px;border-radius:99px;background:var(--bg2);color:var(--muted);font-size:.875rem}
.chips button[aria-pressed=true]{background:var(--brand);color:#fff}
.empty{text-align:center;padding:26px 10px}.empty .e{font-size:2.5rem}
.steps-simple{margin:0;padding:0;list-style:none;counter-reset:st;display:grid;gap:10px}
.steps-simple>li{counter-increment:st;position:relative;padding-inline-start:42px;min-height:30px;line-height:1.5;padding-top:3px}
.steps-simple>li:before{content:counter(st);position:absolute;inset-inline-start:0;top:0;width:30px;height:30px;border-radius:50%;background:var(--brand-soft);color:var(--brand);font-weight:700;display:grid;place-items:center}
hr.sep{border:0;border-top:1px solid var(--line);width:100%}`;

function topBar(lang: Lang, t: T, sub = '<div class="small" id="hstatus"></div>') {
  return `<header class="top"><div class="in"><img src="/icon.svg" alt=""><div class="grow"><b>HeyGate</b>${sub}</div>${controls(lang, t)}<button class="btn-ghost btn-sm" id="logout">${t.logout}</button></div></header>`;
}

export function appPage(lang: Lang) {
  const t = tr(lang);
  const body = `${topBar(lang, t)}
<div class="layout"><nav class="tabs" role="tablist" aria-label="${t.nav}">
<button role="tab" data-tab="home" aria-selected="true"><span class="i" aria-hidden="true">🏠</span>${t.tab_home}</button>
<button role="tab" data-tab="access" aria-selected="false"><span class="i" aria-hidden="true">🔑</span>${t.tab_access}</button>
<button role="tab" data-tab="security" aria-selected="false"><span class="i" aria-hidden="true">🛡️</span>${t.tab_security}</button>
<button role="tab" data-tab="log" aria-selected="false"><span class="i" aria-hidden="true">📜</span>${t.tab_log}</button></nav>
<main><section id="tab-home" class="stack"></section><section id="tab-access" class="stack" hidden></section>
<section id="tab-security" class="stack" hidden></section><section id="tab-log" class="stack" hidden></section></main></div>`;
  const LG = JSON.stringify(LOG[lang]).replace(/</g, '\\u003c');
  return shell(lang, 'HeyGate', body, { css: APP_CSS, js: `document.body.classList.add('app');window.LOGGED_IN=true;const LG=${LG};const LOCALE=${JSON.stringify(lang === 'he' ? 'he-IL' : 'en-GB')};${ADMIN_JS}` });
}

const ADMIN_JS = String.raw`
let S=null,DEV=null,logFilter='all';
const KIND={grok:{i:'🗣️',t:L.k_grok},car:{i:'🚘',t:L.k_car},phone:{i:'📱',t:L.k_phone}};
const AR=L.arrow;
const fmt=iso=>{if(!iso)return L.never;const d=new Date(iso),diff=(Date.now()-d)/1000;if(diff<60)return L.now;if(diff<3600)return F(L.min_ago,Math.floor(diff/60));if(diff<86400)return F(L.hours_ago,Math.floor(diff/3600));return d.toLocaleDateString(LOCALE,{day:'numeric',month:'short'})+' '+d.toLocaleTimeString(LOCALE,{hour:'2-digit',minute:'2-digit'});};
const logT=c=>{const [k,...a]=String(c||'').split('|');return LG[k]?F(LG[k],...a.map(x=>x==='panel'?L.panel:x)):String(c||'');};

function show(tab){$$('.tabs [role=tab]').forEach(b=>b.setAttribute('aria-selected',b.dataset.tab===tab));$$('main>section').forEach(s=>s.hidden=s.id!=='tab-'+tab);
  try{localStorage.setItem('tab',tab)}catch{}window.scrollTo(0,0);render();}
$$('.tabs [role=tab]').forEach(b=>b.onclick=()=>show(b.dataset.tab));
const cur=()=>$('.tabs [aria-selected=true]').dataset.tab;
let resumed=false;
async function load(){S=await api('state');render();if(S.linkPending&&!resumed&&!document.querySelector('dialog')){resumed=true;linkFlow(true);}}
function render(){if(!S)return;header();({home,access,security,log:logTab})[cur()]();syncTheme();}
function header(){const on=S.config.enabled;$('#hstatus').innerHTML=on?'<span class="ok"><span class="dot"></span> '+L.active+'</span>':'<span class="bad"><span class="dot"></span> '+L.disabled+'</span>';}
const ready=()=>({linked:!!S.linked,gates:S.config.gates.length>0,access:S.config.channels.some(c=>c.enabled&&c.lastUsedAt)||S.config.channels.some(c=>c.kind==='car')});

// ---------- home
function home(){const el=$('#tab-home'),r=ready(),done=r.linked&&r.gates;let h='';
  if(!S.config.enabled)h+='<div class="card" style="border-color:var(--bad)"><div class="row between"><div><b class="bad">'+L.all_off+'</b><div class="muted small">'+L.all_off_sub+'</div></div><button class="btn-ok" id="reenable">'+L.reenable+'</button></div></div>';
  if(!done||!r.access){h+='<div class="card"><h2>'+L.setup_title+'</h2><p class="muted small">'+L.setup_sub+'</p>'+
    step(1,L.step1,L.step1_d,r.linked,!r.linked,'<button class="btn-primary" id="w-link">'+L.step1_btn+'</button>')+
    step(2,L.step2,L.step2_d,r.gates,r.linked&&!r.gates,'<div id="w-gates"></div>')+
    step(3,L.step3,L.step3_d,r.access,done&&!r.access,'<button class="btn-primary" id="w-access">'+L.step3_btn+'</button>')+'</div>';}
  let A='',B='';
  if(r.gates){A+='<div class="card stack"><div class="row between"><h2>'+L.quick_open+'</h2><span class="muted small">'+L.logged+'</span></div><div class="grid two">'+
    S.config.gates.map(g=>'<button class="gatebtn" data-test="'+esc(g.alias)+'">⇪ '+esc(g.label||g.alias)+'</button>').join('')+'</div></div>';}
  const today=S.log.filter(l=>l.kind==='open'&&new Date(l.at).toDateString()===new Date().toDateString()).length;
  const blocked=S.log.filter(l=>l.kind==='denied'&&Date.now()-new Date(l.at)<86400e3).length;
  const lastOpen=S.log.find(l=>l.kind==='open');
  if(r.linked)B+='<div class="grid stats"><div class="stat"><span class="muted small">'+L.opens_today+'</span><b>'+today+'</b></div><div class="stat"><span class="muted small">'+L.blocked_24h+'</span><b class="'+(blocked?'warn':'')+'">'+blocked+'</b></div>'+
    '<div class="stat"><span class="muted small">'+L.last_open+'</span><b class="sm">'+(lastOpen?fmt(lastOpen.at)+' · '+esc(chName(lastOpen.channel)):'—')+'</b></div>'+
    '<div class="stat"><span class="muted small">PalGate</span><b class="sm ok">'+L.connected+'</b><span class="muted small mono">'+esc(S.linked.phone)+'</span></div></div>';
  if(r.gates)A+='<details class="card" id="gd"><summary>'+L.edit_gates+'</summary><div id="gates-edit"></div></details>';
  if(r.linked)B+='<details class="card"><summary>'+L.palgate_account+'</summary><div class="row" style="margin-top:10px"><button class="btn-ghost" id="relink">'+L.relink+'</button><button class="btn-ghost" id="unlink" style="color:var(--bad)">'+L.unlink+'</button></div></details>';
  if(A||B)h+='<div class="home-cols"><div class="stack">'+A+'</div><div class="stack">'+B+'</div></div>';
  el.innerHTML=h;
  $('#reenable')?.addEventListener('click',()=>setMaster(true));
  $('#w-link')?.addEventListener('click',()=>linkFlow());$('#relink')?.addEventListener('click',()=>linkFlow());
  $('#unlink')?.addEventListener('click',async()=>{if(await ask(L.unlink_q,L.unlink_text.replace('←',AR),L.unlink,true)){await api('unlink');toast(L.unlinked);load();}});
  $('#w-access')?.addEventListener('click',()=>show('access'));
  if($('#w-gates'))gatesEditor($('#w-gates'));
  $('#gd')?.addEventListener('toggle',e=>{if(e.target.open&&$('#gates-edit')&&!$('#gates-edit').innerHTML)gatesEditor($('#gates-edit'));});
  $$('[data-test]').forEach(b=>b.onclick=async()=>{const o=b.textContent;b.disabled=true;b.textContent=L.opening;
    try{await api('test',{alias:b.dataset.test});b.classList.add('ok');b.textContent=L.opened_short;}catch(e){b.classList.add('bad');b.textContent='❌';toast(e.message,'bad');}
    setTimeout(()=>{b.disabled=false;b.classList.remove('ok','bad');b.textContent=o;load();},2500);});}
const chName=n=>n==='panel'?L.panel:n||'';
function step(n,t,d,isDone,isCur,action){return '<div class="step '+(isDone?'done':isCur?'cur':'')+'"><div class="n">'+(isDone?'✓':n)+'</div><div class="grow stack"><div><b>'+t+'</b><div class="muted small">'+d+'</div></div>'+(isCur?action:'')+'</div></div>';}

async function linkFlow(resume){const d=document.createElement('dialog');d.innerHTML='<div class="stack center"><h2>'+L.link_title+'</h2>'+
  '<ol style="text-align:start;padding-inline-start:20px;margin:0"><li>'+L.link_1+'</li><li>'+L.link_2.replace('←',AR)+'</li><li>'+L.link_3+'</li></ol>'+
  '<div id="lshare" class="stack" hidden><p class="small" style="text-align:start">'+L.link_same_phone+'</p><div class="copy"><code id="lurl" style="font-size:1rem;text-align:center"></code><button class="btn-soft btn-sm" id="lcopy">'+L.copy+'</button></div></div>'+
  '<p class="muted small" id="lother" hidden>'+L.link_other_screen+'</p><div class="qr" id="lq">⏳</div><p class="muted small" id="lm" aria-live="polite">'+(resume?L.link_resuming:L.link_waiting)+'</p><button class="btn-ghost" id="lc">'+L.close+'</button></div>';
  document.body.append(d);d.showModal();let open=true,run=0,id='';const started=Date.now();
  const msg=h=>{const m=d.querySelector('#lm');if(m)m.innerHTML=h;};
  const close=()=>{open=false;document.removeEventListener('visibilitychange',onVis);d.close();d.remove();};
  d.querySelector('#lc').onclick=close;d.addEventListener('cancel',close);
  // Keep asking the server to finish the link until it does: iOS cuts the request off
  // while you are in the PalGate app, so we simply ask again when you come back.
  async function wait(){const me=++run;
    while(open&&me===run&&Date.now()-started<15*60e3){
      try{await api('link/wait',{id});if(me!==run)return;close();toast(L.link_ok,'ok');DEV=null;load();return;}
      catch(e){if(!open||me!==run)return;
        if(e.status===504||e.status===0||e.status===408||e.status===429){await new Promise(r=>setTimeout(r,e.status===0?1500:300));continue;}
        if(e.status===410){msg(L.link_timeout);return;}
        msg('<span class="bad">'+esc(e.message)+'</span> <button class="btn-ghost btn-sm" id="lr">'+L.link_failed_retry+'</button>');d.querySelector('#lr').onclick=()=>{msg(L.link_waiting);wait();};return;}}
    if(open&&me===run)msg(L.link_timeout);}
  function onVis(){if(document.visibilityState==='visible'&&open&&id){msg(L.link_back);wait();}}
  document.addEventListener('visibilitychange',onVis);
  try{const st=resume?await api('link/resume'):await api('link/start');id=st.id;d.querySelector('#lq').innerHTML=st.svg;
    if(st.share){const u=location.origin+'/q/'+st.share;d.querySelector('#lurl').textContent=u.replace(/^https?:\/\//,'');d.querySelector('#lcopy').dataset.copy=u;d.querySelector('#lshare').hidden=false;d.querySelector('#lother').hidden=false;
      if(matchMedia('(pointer:coarse)').matches)d.querySelector('#lq').before(d.querySelector('#lshare'));}
    wait();}catch(e){msg('<span class="bad">'+esc(e.message)+'</span>');}}

async function gatesEditor(el){el.innerHTML='<p class="muted">'+L.loading_gates+'</p>';
  if(!DEV){try{DEV=(await api('devices')).devices;}catch(e){el.innerHTML='<p class="bad">'+esc(e.message)+'</p><button class="btn-ghost" id="gr">'+L.retry+'</button>';el.querySelector('#gr').onclick=()=>gatesEditor(el);return;}}
  if(!DEV.length){el.innerHTML='<p class="muted">'+L.no_gates_found+'</p>';return;}
  const by=Object.fromEntries(S.config.gates.map(g=>[g.deviceId+':'+g.output,g]));const rows=[];
  DEV.forEach(d=>[1,2].forEach(o=>{if(o===2&&!d.outputs.includes(2)&&!by[d.id+':2'])return;const g=by[d.id+':'+o];
    rows.push('<div class="gate-row" data-id="'+esc(d.id)+'" data-out="'+o+'"><input type="checkbox" '+(g||(!S.config.gates.length&&rows.length===0)?'checked':'')+' aria-label="'+L.choose+' '+esc(d.name)+'"><div><b>'+esc(d.name)+'</b>'+(o===2?' <span class="pill">'+L.relay2+'</span>':'')+
    '<div class="row" style="margin-top:8px"><input class="label grow" value="'+esc(g?g.label:d.name)+'" aria-label="'+L.name+'" placeholder="'+L.shown_name+'"></div></div></div>');}));
  el.innerHTML='<div>'+rows.join('')+'</div><div class="row" style="margin-top:12px"><button class="btn-primary" id="gs">'+L.save+'</button><button class="btn-ghost btn-sm" id="g2">'+L.have_relay2+'</button></div>';
  el.querySelector('#g2').onclick=()=>{DEV.forEach(d=>{if(!d.outputs.includes(2))d.outputs.push(2)});gatesEditor(el);};
  el.querySelector('#gs').onclick=e=>busy(e.currentTarget,async()=>{const used=new Set();const gates=[...el.querySelectorAll('.gate-row')].filter(r=>r.querySelector('[type=checkbox]').checked).map((r,i)=>{
      let a=i===0?'home':'gate'+(i+1);while(used.has(a))a+='x';used.add(a);const old=by[r.dataset.id+':'+r.dataset.out];
      return {deviceId:r.dataset.id,output:+r.dataset.out,label:r.querySelector('.label').value.trim(),alias:old?old.alias:a};});
    if(!gates.length){toast(L.choose_one,'bad');return;}
    try{await api('gates',{gates});toast(L.saved,'ok');await load();}catch(e){toast(e.message,'bad');}});}

// ---------- access
function access(){const el=$('#tab-access'),c=S.config.channels,g=S.config.gates;
  if(!S.linked||!g.length){el.innerHTML='<div class="card empty stack"><div class="e">🚧</div><h2>'+L.access_need_title+'</h2><p class="muted">'+L.access_need_text+'</p>'+
    '<div><button class="btn-primary" id="need">'+(S.linked?L.access_need_gate:L.access_need_btn)+'</button></div></div>';
    $('#need').onclick=()=>{show('home');if(!S.linked)linkFlow();else{const d=$('#gd')||$('#w-gates');if(d){if(d.tagName==='DETAILS')d.open=true;d.scrollIntoView({behavior:'smooth'});}}};return;}
  const grok=c.filter(x=>x.kind==='grok'),cars=c.filter(x=>x.kind==='car'),phones=c.filter(x=>x.kind==='phone');
  const carUrl=S.origin.replace(/^https?:\/\//,'')+'/car';
  let h='<div><h2>'+L.open_how+'</h2><p class="muted small">'+L.open_how_sub+'</p></div>';
  // 1. Grok
  h+='<section class="card stack"><div class="row" style="gap:10px"><span style="font-size:1.6rem" aria-hidden="true">🗣️</span><h2 class="grow">'+L.k_grok+'</h2></div>'+
    (grok.length?grok.map(grokSimple).join(''):'<p class="muted small">'+L.grok_desc+'</p><div><button class="btn-primary" id="addgrok">'+L.enable_grok+'</button></div>')+'</section>';
  // 2. Tesla screen
  h+='<section class="card stack"><div class="row" style="gap:10px"><span style="font-size:1.6rem" aria-hidden="true">🚘</span><h2 class="grow">'+L.car_title+'</h2></div>'+
    cars.map(x=>'<div class="row between ev" data-dev="'+esc(x.id)+'" style="border:0;padding:4px 0"><div class="grow"><b>'+esc(x.name)+'</b> <span class="pill ok">'+L.car_connected+'</span>'+(x.enabled?'':' <span class="pill bad">'+L.disabled+'</span>')+'<div class="hint">'+L.car_open_hint+' <span class="mono">'+esc(carUrl)+'</span></div></div><button class="btn-ghost btn-sm devdel" style="color:var(--bad)">'+L.delete+'</button></div>').join('')+
    (cars.length?'<div><button class="btn-ghost btn-sm" id="pair">'+L.pair_more+'</button></div>':
      '<ol class="steps-simple"><li>'+L.car_s1+'<div class="copy" style="margin-top:6px"><code style="font-size:1rem">'+esc(carUrl)+'</code><button class="btn-soft btn-sm" data-copy="'+esc(S.origin+'/car')+'">'+L.copy+'</button></div></li><li>'+L.car_s2+'</li></ol><div><button class="btn-primary" id="pair">'+L.car_enter_code+'</button></div>')+'</section>';
  // 3. Advanced
  h+='<details class="card" id="adv"'+(window.ADV_OPEN?' open':'')+'><summary>'+L.more_options+'</summary><p class="muted small">'+L.more_options_sub+'</p><div class="stack" style="margin-top:12px">'+
    '<h3>📱 '+L.phone_title+'</h3>'+(phones.length?'<div class="cards">'+phones.map(chCard).join('')+'</div>':'<p class="muted small">'+L.phone_desc+'</p><div><button class="btn-soft" id="addphone">'+L.enable_phone+'</button></div>')+
    (grok.length?'<hr class="sep"><h3>🗣️ '+L.settings_of+': '+L.k_grok+'</h3><div class="cards">'+grok.map(chCard).join('')+'</div>':'')+
    (cars.length?'<hr class="sep"><h3>🚘 '+L.settings_of+': '+L.car_title+'</h3><div class="cards">'+cars.map(chCard).join('')+'</div>':'')+'</div></details>';
  el.innerHTML=h;
  $('#adv').addEventListener('toggle',e=>{window.ADV_OPEN=e.target.open;});
  $('#pair').onclick=pairDialog;$('#addgrok')?.addEventListener('click',e=>busy(e.currentTarget,()=>addCh('grok')));$('#addphone')?.addEventListener('click',e=>busy(e.currentTarget,()=>addCh('phone')));
  const act=async(id,p,b,msg)=>{try{await api(p,Object.assign({id},b||{}));if(msg)toast(msg,'ok');await load();}catch(e){toast(e.message,'bad');}};
  $$('[data-dev] .devdel').forEach(btn=>{const id=btn.closest('[data-dev]').dataset.dev,x=c.find(y=>y.id===id);btn.onclick=async()=>{if(await ask(F(L.del_q,x.name),L.del_device,L.delete,true))act(id,'channel/delete',{},L.deleted);};});
  $$('.ch').forEach(box=>{const ch=c.find(x=>x.id===box.dataset.id),a=(p,b,m)=>act(ch.id,p,b,m);
    box.querySelector('.en').onchange=e=>a('channel/update',{enabled:e.target.checked},e.target.checked?L.enabled_t:L.disabled_t);
    box.querySelector('.del').onclick=async()=>{if(await ask(F(L.del_q,ch.name),ch.kind==='car'?L.del_device:L.del_link,L.delete,true))a('channel/delete',{},L.deleted);};
    box.querySelector('.rot')?.addEventListener('click',async()=>{if(await ask(L.rotate_q,F(L.rotate_text,ch.name),L.rotate))a('channel/rotate',{},L.rotated);});
    box.querySelector('.arm')?.addEventListener('change',e=>a('channel/update',{requireArm:e.target.checked},e.target.checked?L.arm_on:L.arm_off));
    box.querySelector('.armnow')?.addEventListener('click',async()=>{try{const d=await api('arm');toast(F(L.armed_for,d.armedMinutes),'ok');load();}catch(e){toast(e.message,'bad');}});
    box.querySelector('.saveadv')?.addEventListener('click',()=>a('channel/update',{name:box.querySelector('.nm').value,countries:box.querySelector('.cc').value,maxPerHour:+box.querySelector('.mx').value,armMinutes:+(box.querySelector('.am')?.value||10)},L.saved));});
  if(window.FOCUS_CH){const b=$('[data-grok="'+window.FOCUS_CH+'"]')||$('.ch[data-id="'+window.FOCUS_CH+'"]');window.FOCUS_CH=null;if(b){b.scrollIntoView({behavior:'smooth',block:'center'});b.style.outline='3px solid var(--brand)';setTimeout(()=>b.style.outline='',2500);}}}

/** The everyday Grok card: three steps and one button. */
function grokSimple(ch){const g=S.config.gates,base=S.origin+'/o/'+ch.secret;
  const more=g.length>1?L.grok_more+'\n'+g.slice(1).map(x=>'- "'+x.label+'": '+base+'/'+x.alias+'/'+L.random_n).join('\n')+'\n':'';
  const instr=F(L.grok_instr,base+'/'+g[0].alias+'/'+L.random_n,more);
  if(!ch.enabled)return '<p class="muted small" data-grok="'+esc(ch.id)+'">'+L.off_text+'</p>';
  return '<div class="stack" data-grok="'+esc(ch.id)+'"><ol class="steps-simple"><li>'+L.grok_s1+'</li><li>'+L.grok_s2.replace(/←/g,AR)+'</li><li>'+L.grok_s3+'</li></ol>'+
    '<button class="btn-primary btn-block" data-copy="'+esc(instr)+'" style="min-height:54px">'+L.copy_instr_big+'</button>'+
    '<details><summary>'+L.show_text+'</summary><pre style="margin-top:8px">'+esc(instr)+'</pre></details></div>';}

/** Full settings for one access method (shown under "advanced"). */
function chCard(ch){const k=KIND[ch.kind],g=S.config.gates,base=S.origin+'/o/'+ch.secret;let body='';
  if(ch.enabled&&g.length){
    if(ch.kind==='grok')body='<div class="row between"><div class="grow"><b>'+L.arm_title+'</b><div class="hint">'+L.arm_hint+'</div></div><label class="switch"><input type="checkbox" class="arm" '+(ch.requireArm?'checked':'')+'><span></span><b class="sr">'+L.arming+'</b></label></div>'+
      (ch.requireArm?'<div class="row"><span class="pill '+(S.armed[ch.id]?'ok':'')+'"><span class="dot"></span>'+(S.armed[ch.id]?L.armed_now:L.not_armed)+'</span><button class="btn-ghost btn-sm armnow">'+L.arm_now+'</button></div>':'');
    if(ch.kind==='phone')body='<p class="small">'+L.phone_instr.replace(/←/g,AR)+'</p>'+copyBox(base+'/'+g[0].alias+'?json')+
      '<p class="small">'+L.phone_arm_text+'</p>'+copyBox(S.origin+'/arm/'+ch.secret)+'<p class="hint">'+L.phone_tip+'</p>';}
  return '<div class="card ch stack'+(ch.enabled?'':' off')+'" data-id="'+esc(ch.id)+'" style="box-shadow:none"><div class="head"><div class="ico" aria-hidden="true">'+k.i+'</div><div class="grow"><b>'+esc(ch.name)+'</b><div class="muted small">'+L.last_used+': '+fmt(ch.lastUsedAt)+'</div></div>'+
    '<label class="switch" title="'+L.active+'"><input type="checkbox" class="en" '+(ch.enabled?'checked':'')+'><span></span><b class="sr">'+L.active+'</b></label></div>'+
    (ch.enabled?body:'<p class="muted small">'+L.off_text+'</p>')+
    '<details><summary>'+L.advanced+'</summary><div class="stack" style="margin-top:10px"><label>'+L.name+'<input class="nm" value="'+esc(ch.name)+'" maxlength="40"></label>'+
    '<div class="grid two"><label>'+L.countries+'<input class="cc mono" value="'+esc(ch.countries.join(', '))+'" placeholder="'+L.countries_ph+'"><div class="hint">'+(ch.kind==='grok'?L.countries_grok:L.countries_il)+'</div></label>'+
    '<label>'+L.max_hour+'<input class="mx" type="number" min="1" max="100" value="'+ch.maxPerHour+'"></label></div>'+
    (ch.kind==='grok'?'<label>'+L.arm_minutes+'<input class="am" type="number" min="1" max="60" value="'+(ch.armMinutes||10)+'"></label>':'')+
    '<div class="row"><button class="btn-primary btn-sm saveadv">'+L.save+'</button>'+(ch.kind!=='car'?'<button class="btn-ghost btn-sm rot">'+L.rotate_link+'</button>':'')+'<button class="btn-ghost btn-sm del" style="color:var(--bad)">'+L.delete+'</button></div></div></details></div>';}

async function addCh(kind){try{const d=await api('channel/add',{kind});window.FOCUS_CH=d.id;toast(L.added,'ok');await load();}catch(e){toast(e.message,'bad');}}

function pairDialog(){const d=document.createElement('dialog');d.innerHTML='<form class="stack" method="dialog"><h2>'+L.pair_dlg+'</h2>'+
  '<ol class="small" style="padding-inline-start:20px;margin:0"><li>'+L.pair_dlg_1+'<br><span class="mono">'+esc(S.origin)+'/car</span></li><li>'+L.pair_dlg_2+'</li></ol>'+
  '<label>'+L.code+'<input name="code" maxlength="7" autocomplete="off" autocapitalize="characters" spellcheck="false" required style="font:700 26px ui-monospace,monospace;letter-spacing:.2em;text-align:center;direction:ltr"></label>'+
  '<label>'+L.device_name+'<input name="name" maxlength="40" placeholder="'+L.device_name_ph+'" required></label><p class="bad small" id="pe"></p>'+
  '<div class="row" style="justify-content:flex-end"><button class="btn-ghost" value="cancel" formnovalidate>'+L.cancel+'</button><button class="btn-primary" value="ok">'+L.approve+'</button></div></form>';
  document.body.append(d);d.showModal();const f=d.querySelector('form');
  f.addEventListener('submit',async e=>{if(e.submitter?.value!=='ok'){d.remove();return;}e.preventDefault();
    try{await api('pair/approve',{code:f.code.value,name:f.name.value});d.close();d.remove();toast(L.paired,'ok');load();}catch(err){d.querySelector('#pe').textContent=err.message;}});
  d.addEventListener('close',()=>d.remove());}

// ---------- security
function security(){const el=$('#tab-security'),cfg=S.config,acc=S.account,hasPk=S.passkeys.length>0;
  const todo=[];if(!hasPk&&pkSupported())todo.push('<button class="btn-soft btn-sm" id="todo-pk">🔐 '+esc(F(L.add_bio_btn,bioName()))+'</button>');
  if(!cfg.notifyUrl)todo.push('<button class="btn-soft btn-sm" id="todo-notif">🔔 '+L.enable_notif_btn+'</button>');
  el.innerHTML='<div class="cards"><div class="card stack"><h2>'+L.safe_title+'</h2><div class="check"><span class="s">✅</span><div>'+L.safe_line+'</div></div>'+
    '<div class="check"><span class="s">'+(hasPk?'✅':'⚪')+'</span><div>'+esc(F(L.chk_login,bioName()))+'</div></div>'+
    '<div class="check"><span class="s">'+(cfg.notifyUrl?'✅':'⚪')+'</span><div>'+L.chk_notify+'</div></div>'+(todo.length?'<div class="row">'+todo.join('')+'</div>':'')+'</div>'+
  '<div class="card"><div class="row between"><div class="grow"><b>'+L.emergency+'</b><div class="muted small">'+L.emergency_sub+'</div></div><label class="switch"><input type="checkbox" id="master" '+(cfg.enabled?'checked':'')+'><span></span><b class="sr">'+L.opening_active+'</b></label></div></div>'+
  '<div class="card stack"><h2>'+L.account+'</h2>'+(acc.username?'<div class="row"><span class="muted small">'+L.username+':</span> <b class="mono">'+esc(acc.username)+'</b></div>':'')+
    '<form id="pwf" class="stack"><b>'+(acc.hasPassword?L.change_password:L.set_password)+'</b>'+(acc.hasPassword?'':'<p class="hint">'+L.no_password_yet+'</p>')+
    (acc.hasPassword?'<input name="current" type="password" placeholder="'+L.current_password+'" autocomplete="current-password" required>':'')+
    (acc.username?'':'<input name="username" class="ltr" placeholder="'+L.username+'" autocomplete="username" autocapitalize="none" spellcheck="false" required minlength="3" maxlength="32"><div class="hint">'+L.username_hint+'</div>')+
    '<input name="next" type="password" placeholder="'+L.new_password+'" autocomplete="new-password" minlength="10" required><button class="btn-primary" type="submit">'+L.save+'</button></form></div>'+
  '<div class="card stack"><div class="row between"><h2>'+L.passkeys+'</h2><button class="btn-soft btn-sm" id="addpk" '+(pkSupported()?'':'hidden')+'>'+L.add_device+'</button></div>'+
    '<p class="muted small">'+L.passkeys_sub+'</p>'+(hasPk?'':'<p class="hint">'+L.no_passkeys+'</p>')+
    S.passkeys.map(p=>'<div class="ev" data-pk="'+esc(p.id)+'"><span class="s" aria-hidden="true">🔑</span><div class="grow"><b>'+esc(p.name)+'</b>'+(p.backedUp?' <span class="pill ok">'+L.synced+'</span>':'')+
      '<div class="muted small">'+L.created+' '+fmt(p.createdAt)+' · '+L.last_used+': '+fmt(p.lastUsedAt)+'</div></div><button class="btn-ghost btn-sm pkren">'+L.rename+'</button>'+(S.passkeys.length>1||acc.hasPassword?'<button class="btn-ghost btn-sm pkdel" style="color:var(--bad)">'+L.delete+'</button>':'')+'</div>').join('')+'</div>'+
  '<div class="card stack"><h2>'+L.notif+'</h2><p class="muted small">'+L.notif_sub+'</p>'+
    '<ol class="small" style="padding-inline-start:20px;margin:0"><li>'+L.notif_1+'</li><li>'+L.notif_2+' <span class="mono" id="topic"></span></li><li>'+L.notif_3+'</li></ol>'+
    '<input id="notify" class="mono" placeholder="https://ntfy.sh/..." value="'+esc(cfg.notifyUrl)+'"><div class="row"><button class="btn-primary" id="sn">'+L.save+'</button><button class="btn-ghost" id="tn">'+L.send_test+'</button></div></div>'+
  '<details class="card"><summary>'+L.advanced+'</summary><div class="stack" style="margin-top:10px"><label>'+L.cooldown+'<input id="cd" type="number" min="0" max="120" value="'+cfg.cooldownSec+'"><div class="hint">'+L.cooldown_hint+'</div></label><button class="btn-ghost" id="scd">'+L.save+'</button>'+
    '<hr class="sep"><b>'+L.recovery+'</b><p class="muted small">'+L.recovery_sub+'</p><button class="btn-ghost" id="newrec">'+L.recovery_btn+'</button>'+
    '<hr class="sep"><b>'+L.logout_all+'</b><p class="muted small">'+L.logout_all_sub+'</p><button class="btn-danger" id="la">'+L.logout_all_btn+'</button>'+
    '<hr class="sep"><b class="bad">'+L.del_account+'</b><p class="muted small">'+L.del_account_sub+'</p><button class="btn-danger" id="delacc">'+L.del_account_btn+'</button></div></details></div>';
  const rnd=crypto.getRandomValues(new Uint8Array(10));const topic='gate-'+[...rnd].map(x=>x.toString(36)).join('').slice(0,18);
  $('#topic').textContent=cfg.notifyUrl?cfg.notifyUrl.replace('https://ntfy.sh/',''):topic;if(!cfg.notifyUrl)$('#notify').value='https://ntfy.sh/'+topic;
  $('#master').onchange=e=>setMaster(e.target.checked);
  $('#todo-pk')?.addEventListener('click',e=>busy(e.currentTarget,async()=>{try{await addPasskey();toast(L.pk_added,'ok');await load();}catch(err){toast(err.message,'bad');}}));
  $('#todo-notif')?.addEventListener('click',()=>{const n=$('#notify');n.scrollIntoView({behavior:'smooth',block:'center'});n.focus();});
  $('#sn').onclick=e=>busy(e.currentTarget,async()=>{try{await api('settings',{notifyUrl:$('#notify').value});toast(L.saved,'ok');load();}catch(err){toast(err.message,'bad');}});
  $('#tn').onclick=async()=>{await api('notify-test');toast(L.test_sent);};
  $('#scd').onclick=async()=>{try{await api('settings',{cooldownSec:+$('#cd').value});toast(L.saved,'ok');}catch(e){toast(e.message,'bad');}};
  $('#pwf').addEventListener('submit',e=>{e.preventDefault();const f=new FormData(e.target);busy(e.submitter,async()=>{try{await api('password',{current:f.get('current'),next:f.get('next'),username:f.get('username')});e.target.reset();toast(L.password_changed,'ok');load();}catch(err){toast(err.message,'bad');}});});
  $('#newrec').onclick=async()=>{if(!await ask(L.recovery_q,L.recovery_q_text,L.create))return;try{const d=await api('recovery/new');showRecovery(d.recoveryCode,L.rec_new_title);}catch(e){toast(e.message,'bad');}};
  $('#delacc').onclick=async()=>{if(!await ask(L.del_account_q,L.del_account_text,L.del_forever,true))return;
    const typed=prompt(L.type_delete);if((typed||'').trim()!==L.delete_word){toast(L.cancelled);return;}try{await api('account/delete',{confirm:'DELETE'});location.href='/';}catch(e){toast(e.message,'bad');}};
  $('#la').onclick=async()=>{if(await ask(L.logout_all_q,L.logout_all_text,L.logout_all_btn,true)){await api('logout-all');location.reload();}};
  $('#addpk').onclick=e=>busy(e.currentTarget,async()=>{try{await addPasskey();toast(L.pk_added,'ok');await load();}catch(err){toast(err.message,'bad');}});
  $$('[data-pk]').forEach(row=>{const id=row.dataset.pk,p=S.passkeys.find(x=>x.id===id);
    row.querySelector('.pkren').onclick=async()=>{const n=prompt(L.new_name,p.name);if(!n)return;try{await api('passkey/rename',{id,name:n});await load();}catch(e){toast(e.message,'bad');}};
    row.querySelector('.pkdel')?.addEventListener('click',async()=>{if(await ask(F(L.del_q,p.name),L.del_pk_text,L.delete,true)){try{await api('passkey/delete',{id});toast(L.deleted);await load();}catch(e){toast(e.message,'bad');}}});});}

async function setMaster(on){if(!on&&!await ask(L.master_off_q,L.master_off_text,L.disable,true)){render();return;}
  try{await api('settings',{enabled:on});toast(on?L.turned_on:L.turned_off,on?'ok':'bad');await load();}catch(e){toast(e.message,'bad');}}

// ---------- log
function logTab(){const el=$('#tab-log');const FL={all:L.f_all,open:L.f_open,denied:L.f_denied,admin:L.f_admin};
  const items=S.log.filter(l=>logFilter==='all'||l.kind===logFilter);
  const icon=l=>l.kind==='open'?'🚪':l.kind==='denied'?'⛔':l.ok?'🔐':'⚠️';
  const gl=a=>{const g=S.config.gates.find(x=>x.alias===a);return esc(g?(g.label||a):a||'');};
  const title=l=>l.kind==='open'?F(L.ev_opened,gl(l.gate)):l.kind==='denied'?L.ev_blocked+(l.gate?' ('+gl(l.gate)+')':''):esc(logT(l.detail));
  el.innerHTML='<div class="card stack"><div class="row between"><h2>'+L.log_title+'</h2><button class="btn-ghost btn-sm" id="rl">'+L.refresh+'</button></div><div class="chips">'+
    Object.entries(FL).map(([k,v])=>'<button aria-pressed="'+(logFilter===k)+'" data-f="'+k+'">'+v+'</button>').join('')+'</div>'+
    (items.length?items.map(l=>'<div class="ev"><span class="s" aria-hidden="true">'+icon(l)+'</span><div class="grow"><b>'+title(l)+'</b>'+(l.kind==='denied'&&l.detail?'<div class="small bad">'+esc(logT(l.detail))+'</div>':'')+
      '<div class="muted small">'+fmt(l.at)+(l.channel?' · '+esc(chName(l.channel)):'')+' · '+esc(l.country||'')+' <span class="mono">'+esc(l.ip||'')+'</span></div></div></div>').join(''):'<div class="empty"><div class="e">📭</div><p class="muted">'+L.no_events+'</p></div>')+'</div>';
  $$('[data-f]').forEach(b=>b.onclick=()=>{logFilter=b.dataset.f;logTab();});$('#rl').onclick=load;}

$('#logout').onclick=async()=>{await post('/app/logout');history.replaceState(null,'','/app#login');location.reload();};
try{const t=localStorage.getItem('tab');if(t&&$('[data-tab='+t+']'))$$('.tabs [role=tab]').forEach(b=>b.setAttribute('aria-selected',b.dataset.tab===t)),$$('main>section').forEach(s=>s.hidden=s.id!=='tab-'+t);}catch{}
load().catch(e=>toast(e.message,'bad'));`;

// ------------------------------------------------------------ super admin

export function saPage(lang: Lang) {
  const t = tr(lang);
  const body = `${topBar(lang, t, `<div class="small muted">${t.sa_sub}</div>`)}
<main style="max-width:1200px;margin:0 auto" class="stack"><div class="grid stats" id="stats"></div>
<div class="cards"><section class="card stack" id="platform"></section>
<section class="card stack"><h2>${t.privacy_box}</h2><p class="muted small">${t.privacy_box_text}</p></section></div>
<section class="card stack"><div class="row between"><h2>${t.customers}</h2><input id="q" class="ltr" placeholder="${t.search_id}" style="max-width:240px"></div><div id="tenants"></div></section></main>`;
  const js = `window.API_BASE='/sa/api/';const LOCALE=${JSON.stringify(lang === 'he' ? 'he-IL' : 'en-GB')};
let S=null;
const fmt=iso=>iso?new Date(iso).toLocaleDateString(LOCALE,{day:'numeric',month:'short',year:'numeric'}):'—';
let resumed=false;
async function load(){S=await api('state');render();if(S.linkPending&&!resumed&&!document.querySelector('dialog')){resumed=true;linkFlow(true);}}
function render(){const T=S.tenants,act=T.filter(t=>t.status==='active').length,week=T.filter(t=>t.lastActiveAt&&Date.now()-new Date(t.lastActiveAt)<7*864e5).length;
  $('#stats').innerHTML=[[L.customers,T.length],[L.active_week,week],[L.blocked,T.length-act],[L.signups_today,S.signupsToday+'/'+S.platform.maxSignupsPerDay]].map(x=>'<div class="stat"><span class="muted small">'+x[0]+'</span><b>'+x[1]+'</b></div>').join('');
  $('#platform').innerHTML='<h2>'+L.signup_box+'</h2><div class="row between"><div class="grow"><b>'+L.signup_open+'</b><div class="hint">'+L.signup_open_hint+'</div></div><label class="switch"><input type="checkbox" id="open" '+(S.platform.signupsOpen?'checked':'')+'><span></span><b class="sr">'+L.signup_open+'</b></label></div>'+
    '<label>'+L.max_signups+'<input id="max" type="number" min="1" max="1000" value="'+S.platform.maxSignupsPerDay+'"><div class="hint">'+L.max_signups_hint+'</div></label><button class="btn-primary" id="savep">'+L.save+'</button>';
  $('#open').onchange=async e=>{await api('platform',{signupsOpen:e.target.checked});toast(e.target.checked?L.signup_opened:L.signup_closed_t);load();};
  $('#savep').onclick=async()=>{try{await api('platform',{maxSignupsPerDay:+$('#max').value});toast(L.saved,'ok');load();}catch(e){toast(e.message,'bad');}};
  list();}
function list(){const q=$('#q').value.trim(),T=S.tenants.filter(t=>!q||t.id.includes(q));
  $('#tenants').innerHTML=T.length?T.map(t=>'<div class="ev" data-id="'+esc(t.id)+'"><span class="s" aria-hidden="true">'+(t.status==='active'?'🟢':'⛔')+'</span><div class="grow"><b class="mono">'+esc(t.id)+'</b> <span class="pill '+(t.status==='active'?'ok':'bad')+'">'+(t.status==='active'?L.st_active:L.st_blocked)+'</span>'+
    '<div class="muted small">'+L.created+' '+fmt(t.createdAt)+' · '+L.last_activity+' '+fmt(t.lastActiveAt)+'</div></div><button class="btn-ghost btn-sm tog">'+(t.status==='active'?L.block:L.unblock)+'</button><button class="btn-ghost btn-sm del" style="color:var(--bad)">'+L.delete+'</button></div>').join(''):'<div class="empty"><div class="e">👥</div><p class="muted">'+L.no_customers+'</p></div>';
  $$('#tenants [data-id]').forEach(row=>{const id=row.dataset.id,t=S.tenants.find(x=>x.id===id);
    row.querySelector('.tog').onclick=async()=>{const to=t.status==='active'?'blocked':'active';if(to==='blocked'&&!await ask(L.block_q,L.block_text,L.block,true))return;await api('tenant/status',{id,status:to});toast(to==='blocked'?L.blocked_t:L.unblocked_t);load();};
    row.querySelector('.del').onclick=async()=>{if(!await ask(L.del_cust_q,L.del_cust_text,L.delete,true))return;const typed=prompt(L.type_id);if(typed!==id){toast(L.cancelled);return;}
      await api('tenant/delete',{id,confirm:id});toast(L.deleted);load();};});}
$('#q').addEventListener('input',()=>S&&list());
$('#logout').onclick=async()=>{await post('/sa/logout');history.replaceState(null,'','/sa');location.reload();};
load().catch(e=>toast(e.message,'bad'));`;
  return shell(lang, `${t.sa_title} · HeyGate`, body, { css: APP_CSS, js });
}

// ------------------------------------------------------------ landing & privacy

export function landingPage(lang: Lang, signupsOpen: boolean) {
  const t = tr(lang);
  const css = `
.nav{max-width:1200px;margin:0 auto;padding:14px clamp(16px,3vw,32px);display:flex;align-items:center;gap:10px;flex-wrap:wrap}.nav img{width:38px;height:38px}
.hero{max-width:1200px;margin:0 auto;padding:clamp(28px,7vh,90px) clamp(16px,3vw,32px);display:grid;gap:clamp(24px,4vw,56px);align-items:center}
.hero h1{font-size:clamp(2.2rem,5.5vw,4rem);line-height:1.08;letter-spacing:-.02em}.hero h1 span{color:var(--brand)}
.hero p.lead{font-size:clamp(1.05rem,1.6vw,1.3rem);color:var(--muted);max-width:36ch}
.cta{display:flex;gap:12px;flex-wrap:wrap;margin-top:22px}.cta .btn{min-height:54px;padding:12px 26px;font-size:1.05rem}
.phone{justify-self:center;width:min(100%,360px);aspect-ratio:9/16;border-radius:40px;background:linear-gradient(160deg,#1e3a8a,#2563eb 60%,#0ea5e9);padding:22px;display:flex;flex-direction:column;justify-content:center;gap:14px;box-shadow:0 30px 80px #2563eb44}
.phone .b{background:#ffffff;color:#1e3a8a;border-radius:24px;padding:22px;font-weight:800;font-size:1.4rem;text-align:center}.phone .s{color:#dbeafe;text-align:center;font-weight:600}
.sec{max-width:1200px;margin:0 auto;padding:clamp(24px,5vh,64px) clamp(16px,3vw,32px)}.sec h2{font-size:clamp(1.5rem,3vw,2.2rem);margin-bottom:18px}
.feats{display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(min(100%,250px),1fr))}.feat .i{font-size:2rem}
.steps3{display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr));counter-reset:s}
.steps3 .card:before{counter-increment:s;content:counter(s);display:grid;place-items:center;width:38px;height:38px;border-radius:50%;background:var(--brand);color:#fff;font-weight:800;margin-bottom:10px}
.links{max-width:1200px;margin:0 auto;padding:6px clamp(16px,3vw,32px);display:flex;justify-content:center;gap:18px}
@media (min-width:900px){.hero{grid-template-columns:1.2fr 1fr}}`;
  const body = `<header class="nav"><img src="/icon.svg" alt=""><b class="grow" style="font-size:1.2rem">HeyGate</b>${controls(lang, t)}<a class="btn btn-ghost btn-sm" href="/app#login">${t.login}</a></header>
<main><section class="hero"><div><h1>${t.hero_1} <span>${t.hero_2}</span>,<br>${t.hero_3}</h1>
<p class="lead">${t.hero_lead}</p>
<div class="cta">${signupsOpen ? `<a class="btn btn-primary" href="/app#signup">${t.start_free}</a>` : ''}<a class="btn btn-ghost" href="/app#login">${t.have_account_btn}</a></div>
<p class="muted small" style="margin-top:14px">📱 ${t.works_on}</p></div>
<div class="phone" aria-hidden="true"><div class="s">${t.demo_say}</div><div class="b">${t.demo_gate}</div><div class="s">${t.demo_done}</div></div></section>
<section class="sec"><h2>${t.three_ways}</h2><div class="feats">
<div class="card feat"><div class="i">🗣️</div><h3>${t.f1_t}</h3><p class="muted">${t.f1_d}</p></div>
<div class="card feat"><div class="i">🚘</div><h3>${t.f2_t}</h3><p class="muted">${t.f2_d}</p></div>
<div class="card feat"><div class="i">📱</div><h3>${t.f3_t}</h3><p class="muted">${t.f3_d}</p></div></div></section>
<section class="sec"><h2>${t.start_3}</h2><div class="steps3">
<div class="card"><h3>${t.s1_t}</h3><p class="muted">${t.s1_d}</p></div>
<div class="card"><h3>${t.s2_t}</h3><p class="muted">${t.s2_d.replace('←', t.arrow)}</p></div>
<div class="card"><h3>${t.s3_t}</h3><p class="muted">${t.s3_d}</p></div></div></section>
<section class="sec"><h2>${t.sec_title}</h2><div class="feats">
<div class="card"><b>${t.sec1_t}</b><p class="muted small">${t.sec1_d}</p></div>
<div class="card"><b>${t.sec2_t}</b><p class="muted small">${t.sec2_d}</p></div>
<div class="card"><b>${t.sec3_t}</b><p class="muted small">${t.sec3_d}</p></div></div></section></main>
<nav class="links small"><a href="/privacy">${t.privacy}</a></nav>`;
  return shell(lang, t.landing_title, body, { css });
}

export function privacyPage(lang: Lang) {
  const t = tr(lang);
  const body = `<header style="max-width:860px;margin:0 auto;padding:14px 16px;display:flex;gap:12px;align-items:center;flex-wrap:wrap"><a href="/" style="display:flex;gap:10px;align-items:center;text-decoration:none;color:inherit"><img src="/icon.svg" alt="" width="34" height="34"><b>HeyGate</b></a><span class="grow"></span>${controls(lang, t)}</header>
<main class="card stack" style="max-width:860px;margin:10px auto 24px;width:calc(100% - 32px)">
<h1>${t.pv_title}</h1><p class="muted small">${t.pv_draft}</p>
<h2>${t.pv_what}</h2><ul><li>${t.pv_1}</li><li>${t.pv_2}</li><li>${t.pv_3}</li><li>${t.pv_4}</li><li>${t.pv_5}</li></ul>
<h2>${t.pv_how}</h2><p>${t.pv_how_t}</p>
<h2>${t.pv_share}</h2><p>${t.pv_share_t}</p>
<h2>${t.pv_del}</h2><p>${t.pv_del_t.replace(/←/g, t.arrow)}</p></main>`;
  return shell(lang, `${t.pv_title} · HeyGate`, body);
}

/** The PalGate linking QR on a second screen (Tesla browser, computer). */
export function qrSharePage(lang: Lang, svg: string | null) {
  const t = tr(lang);
  const css = `main{min-height:calc(100vh - 60px);display:grid;place-items:center;padding:16px}
.qrbig svg{width:min(70vmin,460px);height:min(70vmin,460px);background:#fff;border-radius:18px;padding:8px}`;
  const inner = svg
    ? `<h1>${t.qs_title}</h1><p>${t.qs_steps.replace(/←/g, t.arrow)}</p><div class="qrbig">${svg}</div><p class="muted small">${t.qs_note}</p>`
    : `<div style="font-size:44px">⌛</div><p>${t.qs_expired}</p>`;
  return shell(lang, t.qs_title, `${floatControls(lang, t)}<main><div class="card stack center" style="max-width:640px;width:100%">${inner}</div></main>`, { css });
}
