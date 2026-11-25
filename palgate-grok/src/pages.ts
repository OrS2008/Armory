import { NONCE } from './http';
import type { Gate } from './store';

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const BASE_CSS = `
:root{--bg:#f6f7f9;--fg:#111418;--muted:#5d6672;--card:#fff;--line:#dde1e6;--ok:#13824a;--bad:#c62828;--accent:#1f6feb;--warn:#a15c00}
@media (prefers-color-scheme:dark){:root{--bg:#0d1014;--fg:#eef1f4;--muted:#9aa4b0;--card:#161b21;--line:#2a313a;--ok:#36c275;--bad:#ff6b6b;--accent:#4c8dff;--warn:#f0a73a}}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.5 system-ui,-apple-system,"Segoe UI",Arial,sans-serif}
button{font:inherit;cursor:pointer}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:18px;margin:16px 0}
.muted{color:var(--muted)}.ok{color:var(--ok)}.bad{color:var(--bad)}.warn{color:var(--warn)}
.btn{background:var(--accent);color:#fff;border:0;border-radius:10px;padding:10px 16px;min-height:44px}
.btn.ghost{background:transparent;color:var(--accent);border:1px solid var(--line)}
.btn.red{background:var(--bad)}.btn[disabled]{opacity:.6}
input,select{font:inherit;padding:9px 10px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--fg);width:100%;min-height:44px}
label{display:block;margin:10px 0}
code,.mono{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:13px;direction:ltr;unicode-bidi:embed;word-break:break-all}
.qr svg{width:240px;height:240px;max-width:100%;background:#fff;border-radius:12px}`;

function shell(title: string, body: string, extraCss = '', script = '') {
  return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex,nofollow">
<meta name="referrer" content="no-referrer"><meta name="color-scheme" content="light dark">
<title>${esc(title)}</title><style>${BASE_CSS}${extraCss}</style></head><body>${body}${
    script ? `<script nonce="${NONCE}">${script}</script>` : ''
  }</body></html>`;
}

/** Shared by every page that talks to the admin API. */
const API_JS = String.raw`
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
async function post(path,body){const r=await fetch(path,{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json','x-gate-csrf':'1'},body:JSON.stringify(body||{})});
  const d=await r.json().catch(()=>({ok:false,message:'HTTP '+r.status}));
  if(r.status===401&&path.startsWith('/admin/api/')){location.reload();throw new Error('נדרשת התחברות');}
  if(!r.ok||d.ok===false)throw new Error(d.message||('HTTP '+r.status));return d;}
const api=(p,b)=>post('/admin/api/'+p,b);`;

// ------------------------------------------------------------ public pages

/** What Grok (or any fetcher) reads. Short and bilingual so it can be relayed verbatim. */
export function resultPage(r: { ok: true; label: string; repeated: boolean } | { ok: false; message: string }) {
  const title = r.ok ? `Gate opened: ${r.label} — השער נפתח` : `Gate NOT opened — השער לא נפתח`;
  const body = r.ok
    ? `<h1>✅ השער נפתח</h1><p><b>${esc(r.label)}</b> ${r.repeated ? '(already sent a few seconds ago)' : ''}</p>
       <p lang="en" dir="ltr">SUCCESS: The gate "${esc(r.label)}" was opened. Tell the driver: "The gate is opening."</p>`
    : `<h1>❌ השער לא נפתח</h1><p lang="en" dir="ltr">FAILED: ${esc(r.message)}. Tell the driver the gate did not open.</p>`;
  return shell(title, `<main style="max-width:640px;margin:15vh auto;padding:0 16px;text-align:center">${body}</main>`);
}

/** Big-button page for the Tesla touchscreen browser (also fine on any phone). */
export function carPage(secret: string, gates: Gate[], active: boolean) {
  const buttons = !active
    ? '<p class="bad" style="font-size:24px">הקישור מושבת</p>'
    : gates.length
      ? gates
          .map((g) => `<button class="big" data-alias="${esc(g.alias)}"><span class="ico">⇪</span><span class="t">${esc(g.label || g.alias)}</span></button>`)
          .join('')
      : '<p>לא הוגדרו שערים עדיין.</p>';
  const css = `
main{min-height:100vh;min-height:100dvh;display:flex;flex-direction:column;gap:28px;align-items:center;justify-content:center;padding:16px}
.big{width:min(92vw,560px);min-height:150px;border:0;border-radius:28px;background:var(--accent);color:#fff;font-size:clamp(28px,6vw,44px);font-weight:700;display:flex;gap:20px;align-items:center;justify-content:center;box-shadow:0 10px 30px #0004;transition:transform .08s;touch-action:manipulation}
.big:active{transform:scale(.97)}.big.ok{background:var(--ok)}.big.bad{background:var(--bad)}.big[disabled]{opacity:.75}
.ico{font-size:1.2em}#msg{font-size:24px;color:var(--muted);min-height:36px;text-align:center}`;
  const js = `
const secret=${JSON.stringify(secret)};
document.querySelectorAll('.big').forEach(b=>b.addEventListener('click',async()=>{
  const t=b.querySelector('.t'),label=t.textContent,msg=document.getElementById('msg');b.disabled=true;t.textContent='פותח…';
  try{const r=await fetch('/o/'+secret+'/'+encodeURIComponent(b.dataset.alias)+'?json',{method:'POST',headers:{accept:'application/json'}});
    const d=await r.json();b.classList.add(d.ok?'ok':'bad');msg.textContent=d.ok?'✅ נפתח':'❌ '+(d.message||'שגיאה');
  }catch(e){b.classList.add('bad');msg.textContent='❌ אין חיבור';}
  setTimeout(()=>{b.disabled=false;b.classList.remove('ok','bad');t.textContent=label;msg.textContent='';},3000);
}));`;
  return shell('פתיחת שער', `<main>${buttons}<div id="msg" role="status" aria-live="polite"></div></main>`, css, js);
}

// ------------------------------------------------------------ setup & login

const AUTH_CSS = `main{max-width:440px;margin:8vh auto;padding:0 16px}h1{font-size:24px}#err{min-height:24px}`;

export function setupPage() {
  const body = `<main><h1>🔐 הגדרת חשבון בעלים</h1>
<div class="card" id="s1"><p class="muted">פעם אחת בלבד. אחרי זה קוד ההתקנה מפסיק לעבוד.</p>
<form id="f1"><label>קוד התקנה<input name="setupCode" autocomplete="off" required></label>
<label>סיסמה חדשה (לפחות 12 תווים)<input name="password" type="password" autocomplete="new-password" minlength="12" required></label>
<label>שוב את הסיסמה<input name="password2" type="password" autocomplete="new-password" minlength="12" required></label>
<button class="btn" type="submit">המשך</button></form></div>
<div class="card" id="s2" hidden><h2>אימות דו-שלבי (חובה)</h2>
<p>סרוק עם אפליקציית אימות: Google Authenticator, Microsoft Authenticator, Authy, 1Password וכו'.</p>
<div class="qr" id="qr"></div><p class="muted">או הקלד ידנית: <code id="sec"></code></p>
<form id="f2"><label>קוד בן 6 ספרות מהאפליקציה<input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="\\d{6}" maxlength="6" required></label>
<button class="btn" type="submit">סיום</button></form></div>
<p id="err" class="bad" role="alert"></p></main>`;
  const js = `${API_JS}
let token='';
$('#f1').addEventListener('submit',async e=>{e.preventDefault();const f=new FormData(e.target);$('#err').textContent='';
  if(f.get('password')!==f.get('password2')){$('#err').textContent='הסיסמאות לא תואמות';return;}
  try{const d=await post('/admin/setup/start',{setupCode:f.get('setupCode'),password:f.get('password')});token=d.token;
    $('#qr').innerHTML=d.svg;$('#sec').textContent=d.secret.replace(/(.{4})/g,'$1 ').trim();$('#s1').hidden=true;$('#s2').hidden=false;}
  catch(err){$('#err').textContent=err.message;}});
$('#f2').addEventListener('submit',async e=>{e.preventDefault();const f=new FormData(e.target);$('#err').textContent='';
  try{await post('/admin/setup/finish',{token,code:f.get('code')});location.reload();}catch(err){$('#err').textContent=err.message;}});`;
  return shell('הגדרת חשבון', body, AUTH_CSS, js);
}

export function loginPage() {
  const body = `<main><h1>🔐 כניסה לניהול השער</h1><div class="card">
<form id="f"><label>סיסמה<input name="password" type="password" autocomplete="current-password" required></label>
<label>קוד אימות (6 ספרות)<input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="\\d{6}" maxlength="6" required></label>
<button class="btn" type="submit">כניסה</button></form></div><p id="err" class="bad" role="alert"></p></main>`;
  const js = `${API_JS}
$('#f').addEventListener('submit',async e=>{e.preventDefault();const f=new FormData(e.target);$('#err').textContent='';
  try{await post('/admin/login',{password:f.get('password'),code:f.get('code')});location.reload();}catch(err){$('#err').textContent=err.message;}});`;
  return shell('כניסה', body, AUTH_CSS, js);
}

// ------------------------------------------------------------ admin

export function adminPage() {
  const css = `
main{max-width:900px;margin:0 auto;padding:20px 16px 64px}
h1{font-size:24px;margin:0}h2{font-size:19px;margin:0 0 12px}h3{font-size:16px;margin:14px 0 6px}
.top{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}
table{width:100%;border-collapse:collapse}td,th{padding:8px 6px;border-bottom:1px solid var(--line);text-align:start;vertical-align:middle}
.copy{display:flex;gap:8px;align-items:center;background:var(--bg);border:1px solid var(--line);border-radius:10px;padding:8px 10px;margin:6px 0}
.copy code{flex:1;min-width:0}
.row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}.row>label{margin:0}
.scroll{overflow-x:auto;-webkit-overflow-scrolling:touch}
pre{white-space:pre-wrap;word-break:break-word;background:var(--bg);border:1px solid var(--line);border-radius:10px;padding:10px;font-size:14px}
.ch{border:1px solid var(--line);border-radius:12px;padding:14px;margin:12px 0}
.ch.off{opacity:.65}.pill{display:inline-block;font-size:12px;padding:2px 8px;border-radius:99px;border:1px solid var(--line)}
.master{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
.master.off{border-color:var(--bad)}
@media (max-width:600px){.hide-sm{display:none}}`;
  const body = `<main>
<div class="top"><h1>🚗 פותחן שערים</h1><div class="row"><button class="btn ghost" id="logout">יציאה</button></div></div>
<section class="card master" id="master"></section>
<section class="card"><h2>1. חיבור לחשבון PalGate</h2><div id="link"></div></section>
<section class="card"><h2>2. שערים</h2><div id="gates"></div></section>
<section class="card"><h2>3. קישורי גישה</h2>
<p class="muted">לכל דרך פתיחה יש קישור סודי משלה. אפשר להשבית, להחליף או להגביל כל אחד בנפרד. אם קישור דלף — מחליפים רק אותו.</p>
<div id="channels"></div>
<div class="row"><select id="newkind" style="width:auto"><option value="grok">Grok (קול)</option><option value="car">כפתור במסך הרכב</option><option value="phone">אוטומציה בטלפון</option></select>
<button class="btn ghost" id="addch">הוסף קישור</button></div></section>
<section class="card"><h2>4. התראות לטלפון</h2>
<p class="muted">קבל התראה על כל פתיחה, ניסיון חסום או התחברות לפאנל. התקן את האפליקציה החינמית <b>ntfy</b> (iOS/Android), הירשם לנושא עם שם אקראי, והדבק כאן את הכתובת:</p>
<div class="row"><input id="notify" class="mono" placeholder="https://ntfy.sh/your-random-topic" style="flex:1;min-width:220px">
<button class="btn ghost" id="savenotify">שמור</button><button class="btn ghost" id="testnotify">שלח בדיקה</button></div>
<p class="muted" id="topicSuggest"></p></section>
<section class="card"><h2>יומן אבטחה</h2><div id="log" class="scroll"></div></section>
<section class="card"><h2>חשבון</h2>
<div class="row"><label>השהיה בין פתיחות (שניות) <input id="cooldown" type="number" min="0" max="120" style="width:100px"></label><button class="btn ghost" id="savecd">שמור</button></div>
<h3>החלפת סיסמה</h3>
<form id="pwf" class="row"><input name="current" type="password" placeholder="סיסמה נוכחית" autocomplete="current-password" required style="flex:1;min-width:160px">
<input name="next" type="password" placeholder="סיסמה חדשה (12+)" autocomplete="new-password" minlength="12" required style="flex:1;min-width:160px">
<input name="code" inputmode="numeric" placeholder="קוד 6 ספרות" maxlength="6" required style="width:130px"><button class="btn ghost" type="submit">החלף</button></form>
<h3>התנתקות מכל המכשירים</h3><button class="btn red" id="logoutall">נתק את כל המכשירים</button></section>
</main>`;
  return shell('ניהול שער', body, css, API_JS + ADMIN_JS);
}

const ADMIN_JS = String.raw`
let S=null,DEV=null;
const copyRow=t=>'<div class="copy"><code>'+esc(t)+'</code><button class="btn ghost" data-copy="'+esc(t)+'">העתק</button></div>';
document.addEventListener('click',e=>{const t=e.target.closest('[data-copy]');if(t){navigator.clipboard.writeText(t.dataset.copy).then(()=>{t.textContent='הועתק ✓';setTimeout(()=>t.textContent='העתק',1500);});}});
const fmt=iso=>iso?new Date(iso).toLocaleString('he-IL',{dateStyle:'short',timeStyle:'short'}):'—';

async function load(){S=await api('state');renderMaster();renderLink();renderGates(true);renderChannels();renderLog();
  $('#cooldown').value=S.config.cooldownSec;$('#notify').value=S.config.notifyUrl||'';
  if(!S.config.notifyUrl){const a=crypto.getRandomValues(new Uint8Array(12));$('#topicSuggest').innerHTML='הצעה לנושא אקראי: <code>https://ntfy.sh/gate-'+[...a].map(x=>x.toString(36)).join('').slice(0,20)+'</code>';}}

function renderMaster(){const on=S.config.enabled,el=$('#master');el.classList.toggle('off',!on);
  el.innerHTML='<div><b>'+(on?'🟢 פתיחה פעילה':'🔴 כל הפתיחות מושבתות')+'</b><div class="muted">מתג חירום — משבית מיד את כל הקישורים</div></div><button class="btn '+(on?'red':'')+'" id="mtoggle">'+(on?'השבת הכל':'הפעל מחדש')+'</button>';
  $('#mtoggle').onclick=async()=>{if(on&&!confirm('להשבית את כל הפתיחות?'))return;await api('settings',{enabled:!on});load();};}

function renderLink(){const el=$('#link');
  if(S.linked){el.innerHTML='<p class="ok">✅ מחובר כמכשיר מקושר: <span class="mono">'+esc(S.linked.phone)+'</span></p><div class="row"><button class="btn ghost" id="relink">חבר מחדש</button><button class="btn ghost" id="unlink">נתק</button></div>';
    $('#unlink').onclick=async()=>{if(confirm('לנתק? הסר את המכשיר גם באפליקציית PalGate ← מכשירים מקושרים.')){await api('unlink');load();}};
    $('#relink').onclick=startLink;return;}
  el.innerHTML='<ol><li>פתח את אפליקציית PalGate בטלפון</li><li>☰ ← <b>מכשירים מקושרים</b> ← <b>קשר מכשיר</b></li><li>סרוק את הקוד</li></ol><button class="btn" id="start">הצג קוד QR</button>';
  $('#start').onclick=startLink;}

async function startLink(){const el=$('#link');
  el.innerHTML='<p>סרוק עם PalGate ← מכשירים מקושרים ← קשר מכשיר:</p><div class="qr" id="qr"></div><p id="linkmsg" class="muted">ממתין לסריקה…</p>';
  const retry=t=>{$('#linkmsg').insertAdjacentHTML('beforeend',' <button class="btn ghost" id="retry">'+t+'</button>');$('#retry').onclick=startLink;};
  const {id,svg}=await api('link/start');$('#qr').innerHTML=svg;
  for(let i=0;i<6;i++){try{const r=await api('link/wait',{id});$('#linkmsg').innerHTML='<span class="ok">✅ חובר ('+esc(r.phone)+')</span>';DEV=null;setTimeout(load,800);return;}
    catch(e){if(!/timeout|abort/i.test(e.message)){$('#linkmsg').innerHTML='<span class="bad">שגיאה: '+esc(e.message)+'</span>';retry('נסה שוב');return;}}}
  $('#linkmsg').textContent='פג הזמן.';retry('קוד חדש');}

async function renderGates(useCache){const el=$('#gates');
  if(!S.linked){el.innerHTML='<p class="muted">חבר קודם את חשבון PalGate.</p>';return;}
  if(!useCache||!DEV){el.innerHTML='<p class="muted">טוען שערים…</p>';
    try{DEV=(await api('devices')).devices;}catch(e){el.innerHTML='<p class="bad">'+esc(e.message)+'</p>';return;}}
  const byId=Object.fromEntries(S.config.gates.map(g=>[g.deviceId+':'+g.output,g]));
  const rows=[];DEV.forEach(d=>[1,2].forEach(o=>{if(o==2&&!d.outputs.includes(2)&&!byId[d.id+':2'])return;const g=byId[d.id+':'+o];
    rows.push('<tr data-id="'+esc(d.id)+'" data-out="'+o+'"><td><input type="checkbox" class="on" style="width:22px;min-height:22px" '+(g?'checked':'')+'></td><td>'+esc(d.name)+(o==2?' <span class="muted">(ממסר 2)</span>':'')+'</td>'+
    '<td><input class="label" value="'+esc(g?g.label:d.name)+'"></td><td><input class="alias mono" placeholder="home" value="'+esc(g?g.alias:'')+'" style="width:110px"></td>'+
    '<td>'+(g?'<button class="btn ghost test" data-alias="'+esc(g.alias)+'">בדיקה</button>':'')+'</td></tr>');}));
  if(!DEV.length){el.innerHTML='<p class="muted">לא נמצאו שערים בחשבון.</p>';return;}
  el.innerHTML='<div class="scroll"><table><tr><th></th><th>שער</th><th>שם לנהג</th><th>כינוי</th><th></th></tr>'+rows.join('')+'</table></div><p class="muted">השער המסומן הראשון הוא ברירת המחדל.</p><div class="row"><button class="btn" id="savegates">שמור שערים</button><button class="btn ghost" id="dual">הצג ממסר 2</button><span id="gmsg"></span></div>';
  el.querySelectorAll('.test').forEach(b=>b.onclick=async()=>{b.textContent='פותח…';try{await api('test',{alias:b.dataset.alias});b.textContent='✅ נפתח';}catch(e){b.textContent='❌';alert(e.message);}setTimeout(()=>{b.textContent='בדיקה';refreshLog();},2500);});
  $('#dual').onclick=()=>{DEV.forEach(d=>{if(!d.outputs.includes(2))d.outputs.push(2);});renderGates(true);};
  $('#savegates').onclick=async()=>{const gates=[...el.querySelectorAll('tr[data-id]')].filter(tr=>tr.querySelector('.on').checked).map((tr,i)=>{
      let alias=tr.querySelector('.alias').value.trim().toLowerCase().replace(/[^a-z0-9-]/g,'');if(!alias)alias=i==0?'home':'gate'+(i+1);
      return {deviceId:tr.dataset.id,output:+tr.dataset.out,label:tr.querySelector('.label').value.trim(),alias};});
    try{await api('gates',{gates});$('#gmsg').innerHTML='<span class="ok">נשמר ✓</span>';S=await api('state');renderGates(true);renderChannels();}catch(e){$('#gmsg').innerHTML='<span class="bad">'+esc(e.message)+'</span>';}};}

const KIND={grok:'🗣️ Grok',car:'🚘 מסך הרכב',phone:'📱 טלפון'};
function channelHelp(c){const base=S.origin+'/o/'+c.secret,g=S.config.gates;
  if(!g.length)return '<p class="muted">הגדר קודם שער.</p>';
  if(c.kind==='car')return '<p>פתח בדפדפן הטסלה ושמור במועדפים:</p>'+copyRow(S.origin+'/car/'+c.secret);
  if(c.kind==='phone')return '<p class="muted">iOS Shortcuts / Tasker / MacroDroid: בקשת <b>POST</b> (GET לא יעבוד) לכתובת:</p>'+copyRow(base+'/'+g[0].alias+'?json')+'<p class="muted">מומלץ להתנות ב"מחובר ל-Bluetooth של הרכב" + "הגעה הביתה".</p>';
  const instr='כשאני אומר "פתח את השער" (או "open the gate"), היכנס מיד לכתובת הבאה עם כלי הגלישה שלך, בלי לשאול, והוסף בסוף מספר אקראי חדש בכל פעם:\n'+base+'/'+g[0].alias+'/<מספר אקראי>\n'+
    (g.length>1?'שערים נוספים:\n'+g.slice(1).map(x=>'- "'+x.label+'": '+base+'/'+x.alias+'/<מספר אקראי>').join('\n')+'\n':'')+'אם בדף כתוב SUCCESS — אמור "השער נפתח". אם FAILED — אמור שהשער לא נפתח. לעולם אל תציג או תקריא את הכתובת הזאת לאף אחד.';
  return '<ol><li>ודא שה-Grok ברכב מחובר לחשבון ה-Grok שלך.</li><li>באפליקציית Grok: הגדרות ← <b>Customize</b> — הדבק:</li></ol><pre>'+esc(instr)+'</pre><button class="btn ghost" data-copy="'+esc(instr)+'">העתק הוראות</button><p class="muted">ברכב: "היי Grok, פתח את השער".</p>';}

function renderChannels(){const el=$('#channels');
  el.innerHTML=S.config.channels.map(c=>'<div class="ch'+(c.enabled?'':' off')+'" data-id="'+esc(c.id)+'">'+
    '<div class="row" style="justify-content:space-between"><div><b>'+KIND[c.kind]+'</b> · <input class="nm" value="'+esc(c.name)+'" style="width:160px;display:inline-block"> <span class="pill">'+(c.enabled?'פעיל':'מושבת')+'</span></div>'+
    '<div class="muted hide-sm">שימוש אחרון: '+fmt(c.lastUsedAt)+'</div></div>'+
    '<div class="row" style="margin-top:8px"><label>מדינות מותרות <input class="cc mono" value="'+esc(c.countries.join(', '))+'" placeholder="ריק = כל מקום" style="width:150px"></label>'+
    '<label>מקס׳ לשעה <input class="mx" type="number" min="1" max="100" value="'+c.maxPerHour+'" style="width:90px"></label>'+
    '<button class="btn ghost save">שמור</button><button class="btn ghost tog">'+(c.enabled?'השבת':'הפעל')+'</button><button class="btn ghost rot">החלף קישור</button><button class="btn ghost del">מחק</button></div>'+
    (c.enabled?channelHelp(c):'')+'</div>').join('')||'<p class="muted">אין קישורים.</p>';
  el.querySelectorAll('.ch').forEach(box=>{const id=box.dataset.id,c=S.config.channels.find(x=>x.id===id);
    const act=async(p,b,ask)=>{if(ask&&!confirm(ask))return;try{await api(p,Object.assign({id},b));S=await api('state');renderChannels();}catch(e){alert(e.message);}};
    box.querySelector('.save').onclick=()=>act('channel/update',{name:box.querySelector('.nm').value,countries:box.querySelector('.cc').value,maxPerHour:+box.querySelector('.mx').value});
    box.querySelector('.tog').onclick=()=>act('channel/update',{enabled:!c.enabled});
    box.querySelector('.rot').onclick=()=>act('channel/rotate',{},'להחליף את הקישור? הקישור הישן יפסיק לעבוד מיד ותצטרך לעדכן את '+c.name+'.');
    box.querySelector('.del').onclick=()=>act('channel/delete',{},'למחוק את הקישור '+c.name+'?');});}

async function refreshLog(){S=await api('state');renderLog();}
function renderLog(){const el=$('#log');if(!S.log.length){el.innerHTML='<p class="muted">אין אירועים עדיין.</p>';return;}
  const what=l=>l.kind==='open'?'🚪 פתיחה':l.kind==='admin'?'🔐 '+esc(l.detail||''):'⛔ נחסם: '+esc(l.detail||'');
  el.innerHTML='<table><tr><th>זמן</th><th>אירוע</th><th>שער</th><th>מקור</th><th class="hide-sm">IP</th></tr>'+S.log.map(l=>'<tr><td class="mono">'+fmt(l.at)+'</td><td class="'+(l.ok?'ok':'bad')+'">'+what(l)+'</td><td>'+esc(l.gate||'')+'</td><td>'+esc(l.channel||'')+' '+esc(l.country||'')+'</td><td class="mono hide-sm">'+esc(l.ip||'')+'</td></tr>').join('')+'</table>';}

$('#addch').onclick=async()=>{await api('channel/add',{kind:$('#newkind').value});S=await api('state');renderChannels();};
$('#savenotify').onclick=async()=>{try{await api('settings',{notifyUrl:$('#notify').value});alert('נשמר');}catch(e){alert(e.message);}};
$('#testnotify').onclick=async()=>{await api('notify-test');alert('נשלחה התראת בדיקה');};
$('#savecd').onclick=async()=>{await api('settings',{cooldownSec:+$('#cooldown').value});alert('נשמר');};
$('#logout').onclick=async()=>{await post('/admin/logout');location.reload();};
$('#logoutall').onclick=async()=>{if(!confirm('לנתק את כל המכשירים, כולל זה?'))return;await api('logout-all');location.reload();};
$('#pwf').addEventListener('submit',async e=>{e.preventDefault();const f=new FormData(e.target);
  try{await api('password',{current:f.get('current'),next:f.get('next'),code:f.get('code')});e.target.reset();alert('הסיסמה הוחלפה. שאר המכשירים נותקו.');}catch(err){alert(err.message);}});
load().catch(e=>$('main').insertAdjacentHTML('afterbegin','<p class="bad">'+esc(e.message)+'</p>'));`;
