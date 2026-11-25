import type { Gate } from './index';

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const BASE_CSS = `
:root{--bg:#f6f7f9;--fg:#111418;--muted:#5d6672;--card:#fff;--line:#dde1e6;--ok:#13824a;--bad:#c62828;--accent:#1f6feb}
@media (prefers-color-scheme:dark){:root{--bg:#0d1014;--fg:#eef1f4;--muted:#9aa4b0;--card:#161b21;--line:#2a313a;--ok:#36c275;--bad:#ff6b6b;--accent:#4c8dff}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.5 system-ui,-apple-system,"Segoe UI",Arial,sans-serif}
button{font:inherit;cursor:pointer}`;

function shell(title: string, body: string, extraCss = '', script = '') {
  return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">
<title>${esc(title)}</title><style>${BASE_CSS}${extraCss}</style></head><body>${body}${script ? `<script>${script}</script>` : ''}</body></html>`;
}

/**
 * What Grok (or any fetcher) reads after hitting the open URL. Kept short and
 * bilingual so the assistant can relay it to the driver verbatim.
 */
export function resultPage(r: { ok: true; label: string; repeated: boolean } | { ok: false; message: string }) {
  const title = r.ok ? `Gate opened: ${r.label} — השער נפתח` : `Gate NOT opened — השער לא נפתח`;
  const body = r.ok
    ? `<h1>✅ השער נפתח</h1><p><b>${esc(r.label)}</b> ${r.repeated ? '(the command was already sent a few seconds ago)' : ''}</p>
       <p lang="en" dir="ltr">SUCCESS: The gate "${esc(r.label)}" was opened at ${new Date().toISOString().slice(11, 19)} UTC. Tell the driver: "The gate is opening."</p>`
    : `<h1>❌ השער לא נפתח</h1><p lang="en" dir="ltr">FAILED: ${esc(r.message)}. Tell the driver the gate did not open.</p>`;
  return shell(title, `<main style="max-width:640px;margin:15vh auto;padding:0 16px;text-align:center">${body}</main>`);
}

/** Big-button page for the Tesla touchscreen browser (also fine on a phone). */
export function carPage(secret: string, gates: Gate[]) {
  const buttons = gates.length
    ? gates
        .map(
          (g) =>
            `<button class="big" data-alias="${esc(g.alias)}"><span class="ico">⇪</span><span>${esc(g.label || g.alias)}</span></button>`,
        )
        .join('')
    : '<p>לא הוגדרו שערים עדיין. היכנס ל-/admin.</p>';
  const css = `
main{min-height:100vh;display:flex;flex-direction:column;gap:28px;align-items:center;justify-content:center;padding:16px}
.big{width:min(92vw,560px);min-height:150px;border:0;border-radius:28px;background:var(--accent);color:#fff;font-size:44px;font-weight:700;display:flex;gap:20px;align-items:center;justify-content:center;box-shadow:0 10px 30px #0004;transition:transform .08s}
.big:active{transform:scale(.97)}.big.ok{background:var(--ok)}.big.bad{background:var(--bad)}.big[disabled]{opacity:.7}
.ico{font-size:52px}#msg{font-size:24px;color:var(--muted);min-height:36px}`;
  const js = `
const secret=${JSON.stringify(secret)};
document.querySelectorAll('.big').forEach(b=>b.addEventListener('click',async()=>{
  const label=b.lastChild.textContent;b.disabled=true;b.lastChild.textContent='פותח…';
  try{const r=await fetch('/o/'+secret+'/'+b.dataset.alias+'?json',{method:'POST',headers:{accept:'application/json'}});
    const d=await r.json();b.classList.add(d.ok?'ok':'bad');document.getElementById('msg').textContent=d.ok?'✅ נפתח':'❌ '+(d.message||'שגיאה');
  }catch(e){b.classList.add('bad');document.getElementById('msg').textContent='❌ אין חיבור';}
  setTimeout(()=>{b.disabled=false;b.classList.remove('ok','bad');b.lastChild.textContent=label;},3000);
}));`;
  return shell('פתיחת שער', `<main>${buttons}<div id="msg"></div></main>`, css, js);
}

export function adminPage() {
  const css = `
main{max-width:860px;margin:0 auto;padding:24px 16px 64px}
h1{font-size:26px;margin:0 0 4px}h2{font-size:19px;margin:0 0 12px}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:18px;margin:16px 0}
.muted{color:var(--muted)}.ok{color:var(--ok)}.bad{color:var(--bad)}
.btn{background:var(--accent);color:#fff;border:0;border-radius:10px;padding:9px 16px}
.btn.ghost{background:transparent;color:var(--accent);border:1px solid var(--line)}
.btn.red{background:var(--bad)}
input,select{font:inherit;padding:7px 9px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--fg);width:100%}
table{width:100%;border-collapse:collapse}td,th{padding:7px 6px;border-bottom:1px solid var(--line);text-align:start;vertical-align:middle}
code,.mono{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:13px;direction:ltr;unicode-bidi:embed;word-break:break-all}
.copy{display:flex;gap:8px;align-items:center;background:var(--bg);border:1px solid var(--line);border-radius:10px;padding:8px 10px;margin:6px 0}
.copy code{flex:1}#qr svg{width:260px;height:260px;background:#fff;border-radius:12px}
.row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
ol li{margin:4px 0}.scroll{overflow-x:auto}
pre{white-space:pre-wrap;background:var(--bg);border:1px solid var(--line);border-radius:10px;padding:10px;font-size:14px}`;
  const body = `<main>
<h1>🚗 פותחן שערים PalGate × Grok</h1>
<p class="muted">פאנל הגדרות פרטי. השרת שלך, הנתונים שלך — שום צד שלישי לא מחזיק את החשבון שלך.</p>

<section class="card" id="link-card"><h2>1. חיבור לחשבון PalGate</h2><div id="link"></div></section>
<section class="card"><h2>2. בחירת שערים</h2><div id="gates"></div></section>
<section class="card"><h2>3. חיבור ל-Grok בטסלה</h2><div id="grok"></div></section>
<section class="card"><h2>יומן פתיחות</h2><div id="log" class="scroll"></div></section>
<section class="card"><h2>אבטחה</h2>
<p class="muted">כל מי שמחזיק בקישור הסודי יכול לפתוח את השער. אם הקישור דלף — החלף אותו. הקישורים הישנים יפסיקו לעבוד מיד.</p>
<div class="row"><button class="btn red" id="rotate">החלף קישור סודי</button>
<label>השהיה בין פתיחות (שניות) <input id="cooldown" type="number" min="0" max="120" style="width:90px"></label>
<label>מקסימום פתיחות לשעה <input id="maxph" type="number" min="1" max="500" style="width:90px"></label>
<button class="btn ghost" id="save-limits">שמור</button></div></section>
</main>`;
  return shell('ניהול שער', body, css, ADMIN_JS);
}

const ADMIN_JS = String.raw`
const $=s=>document.querySelector(s);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
let S=null;
async function api(path,body){const r=await fetch('/admin/api/'+path,body===undefined?{}:{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  const d=await r.json().catch(()=>({ok:false,message:'HTTP '+r.status}));if(!r.ok&&d.ok!==true)throw new Error(d.message||('HTTP '+r.status));return d;}
function copyRow(text){return '<div class="copy"><code>'+esc(text)+'</code><button class="btn ghost" data-copy="'+esc(text)+'">העתק</button></div>';}
document.addEventListener('click',e=>{const t=e.target.closest('[data-copy]');if(t){navigator.clipboard.writeText(t.dataset.copy);t.textContent='הועתק ✓';setTimeout(()=>t.textContent='העתק',1500);}});

async function load(){S=await api('state');renderLink();renderGates();renderGrok();renderLog();
  $('#cooldown').value=S.config.cooldownSec;$('#maxph').value=S.config.maxPerHour;}

function renderLink(){const el=$('#link');
  if(S.linked){el.innerHTML='<p class="ok">✅ מחובר כמכשיר מקושר למספר <span class="mono">'+esc(S.linked.phone)+'</span> (סוג '+(S.linked.type==2?'משני':S.linked.type==1?'ראשי':'SMS')+')</p><button class="btn ghost" id="unlink">נתק</button> <button class="btn ghost" id="relink">חבר מחדש</button>';
    $('#unlink').onclick=async()=>{if(confirm('לנתק? (מומלץ גם להסיר את המכשיר מאפליקציית PalGate → מכשירים מקושרים)')){await api('unlink',{});load();}};
    $('#relink').onclick=startLink;return;}
  el.innerHTML='<ol><li>פתח את אפליקציית PalGate בטלפון</li><li>תפריט ☰ ← <b>מכשירים מקושרים</b> (Linked Devices) ← <b>קשר מכשיר</b></li><li>סרוק את הקוד שיופיע כאן</li></ol><button class="btn" id="start">הצג קוד QR</button><div id="qr"></div><p id="linkmsg" class="muted"></p>';
  $('#start').onclick=startLink;}

async function startLink(){const el=$('#link');
  el.innerHTML='<p>סרוק עם אפליקציית PalGate ← מכשירים מקושרים ← קשר מכשיר:</p><div id="qr"></div><p id="linkmsg" class="muted">ממתין לסריקה…</p>';
  const {id,svg}=await api('link/start',{});$('#qr').innerHTML=svg;
  for(let i=0;i<6;i++){try{const r=await api('link/wait',{id});$('#linkmsg').innerHTML='<span class="ok">✅ חובר! ('+esc(r.phone)+')</span>';setTimeout(load,800);return;}
    catch(e){if(!/timeout|abort|aborted/i.test(e.message)){$('#linkmsg').innerHTML='<span class="bad">שגיאה: '+esc(e.message)+'</span> <button class="btn ghost" onclick="startLink()">נסה שוב</button>';return;}}}
  $('#linkmsg').innerHTML='פג הזמן. <button class="btn ghost" onclick="startLink()">קוד חדש</button>';}

let DEV=null;
async function renderGates(useCache){const el=$('#gates');
  if(!S.linked){el.innerHTML='<p class="muted">חבר קודם את חשבון PalGate.</p>';return;}
  if(!useCache||!DEV){el.innerHTML='<p class="muted">טוען שערים מהחשבון…</p>';
    try{DEV=(await api('devices')).devices;}catch(e){el.innerHTML='<p class="bad">לא הצלחתי לטעון שערים: '+esc(e.message)+'</p>';return;}}
  const devices=DEV;
  const byId=Object.fromEntries(S.config.gates.map(g=>[g.deviceId+':'+g.output,g]));
  const rows=[];devices.forEach(d=>[1,2].forEach(o=>{if(o==2&&!d.outputs.includes(2)&&!byId[d.id+':2'])return;const g=byId[d.id+':'+o];
    rows.push('<tr data-id="'+esc(d.id)+'" data-out="'+o+'"><td><input type="checkbox" class="on" '+(g?'checked':'')+'></td><td>'+esc(d.name)+(o==2?' <span class="muted">(ממסר 2)</span>':'')+'<div class="muted mono">'+esc(d.id)+'</div></td>'+
    '<td><input class="label" placeholder="שם לנהג" value="'+esc(g?g.label:d.name)+'"></td><td><input class="alias mono" placeholder="home" value="'+esc(g?g.alias:'')+'" style="width:110px"></td>'+
    '<td>'+(g?'<button class="btn ghost test" data-alias="'+esc(g.alias)+'">בדיקה</button>':'')+'</td></tr>');}));
  if(!devices.length){el.innerHTML='<p class="muted">לא נמצאו שערים בחשבון.</p>';return;}
  el.innerHTML='<div class="scroll"><table><tr><th></th><th>שער</th><th>שם</th><th>כינוי ב-URL</th><th></th></tr>'+rows.join('')+'</table></div><p class="muted">השער המסומן הראשון הוא ברירת המחדל. כינוי: אותיות באנגלית/ספרות בלבד.</p><div class="row"><button class="btn" id="save-gates">שמור שערים</button><button class="btn ghost" id="add-dual">הצג ממסר 2 לכל השערים</button><span id="gmsg"></span></div>';
  el.querySelectorAll('.test').forEach(b=>b.onclick=async()=>{b.textContent='פותח…';try{await api('test',{alias:b.dataset.alias});b.textContent='✅ נפתח';}catch(e){b.textContent='❌';alert(e.message);}setTimeout(()=>{b.textContent='בדיקה';renderLogFresh();},2500);});
  $('#add-dual').onclick=()=>{devices.forEach(d=>{if(!d.outputs.includes(2))d.outputs.push(2);});renderGates(true);};
  $('#save-gates').onclick=async()=>{try{await api('config',{gates:collect()});$('#gmsg').innerHTML='<span class="ok">נשמר ✓</span>';S=await api('state');renderGates(true);renderGrok();}catch(e){$('#gmsg').innerHTML='<span class="bad">'+esc(e.message)+'</span>';}};
}

function collect(){return [...document.querySelectorAll('#gates tr[data-id]')].filter(tr=>tr.querySelector('.on').checked).map((tr,i)=>{
  let alias=tr.querySelector('.alias').value.trim().toLowerCase().replace(/[^a-z0-9-]/g,'');if(!alias)alias=i==0?'home':'gate'+(i+1);
  return {deviceId:tr.dataset.id,output:+tr.dataset.out,label:tr.querySelector('.label').value.trim(),alias};});}

function renderGrok(){const el=$('#grok');const base=S.origin+'/o/'+S.config.secret;const g=S.config.gates;
  if(!g.length){el.innerHTML='<p class="muted">בחר ושמור לפחות שער אחד.</p>';return;}
  const lines=g.map(x=>'- "'+x.label+'": '+base+'/'+x.alias).join('\n');
  const instr='כשאני אומר "פתח את השער" (או "open the gate"), פתח מיד את הכתובת הבאה עם כלי הגלישה שלך, בלי לשאול שאלות, וקרא לי את התוצאה:\n'+base+'/'+g[0].alias+'/{מספר אקראי}\n'+(g.length>1?'שערים נוספים לפי שם:\n'+lines+'\n':'')+'אם בדף כתוב SUCCESS — תגיד "השער נפתח". אם FAILED — תגיד שהשער לא נפתח.';
  el.innerHTML='<p><b>הקישור הסודי לפתיחה</b> (כל כניסה אליו פותחת את השער):</p>'+g.map(x=>'<div class="muted">'+esc(x.label)+'</div>'+copyRow(base+'/'+x.alias)).join('')+
  '<h3>אפשרות א׳ — פקודה קולית ל-Grok</h3><ol><li>ודא שה-Grok ברכב מחובר לחשבון ה-Grok/X שלך (בטסלה: הגדרות ← Grok ← התחברות).</li><li>באפליקציית Grok בטלפון: הגדרות ← <b>Customize / הוראות מותאמות אישית</b> — הדבק את הטקסט הבא:</li></ol><pre id="instr">'+esc(instr)+'</pre><button class="btn ghost" data-copy="'+esc(instr)+'">העתק הוראות</button>'+
  '<ol start="3"><li>ברכב: לחץ על כפתור הקול ואמור <b>"היי Grok, פתח את השער"</b>.</li><li>בפעם הראשונה בדוק ביומן למטה שהבקשה הגיעה (מקור: grok).</li></ol>'+
  '<p class="muted">טיפ: אם Grok לא מוכן לגלוש לקישור, אמור במפורש "תיכנס לכתובת" או השתמש באפשרות ב׳.</p>'+
  '<h3>אפשרות ב׳ — כפתור ענק במסך הטסלה (גיבוי אמין)</h3><p>פתח בדפדפן של הטסלה, ושמור במועדפים / הוסף למסך הבית של הדפדפן:</p>'+copyRow(S.origin+'/car/'+S.config.secret)+
  '<h3>אפשרות ג׳ — פתיחה אוטומטית בהתקרבות (אייפון/אנדרואיד)</h3><p class="muted">אוטומציה בקיצורים (iOS Shortcuts → Automation → Arrive) או ב-Tasker/MacroDroid: בקשת <span class="mono">POST</span> לכתובת:</p>'+copyRow(base+'/'+g[0].alias+'?json')+
  '<p class="muted">אפשר להתנות ב"מחובר ל-Bluetooth של הרכב" כדי שייפתח רק כשאתה נוהג.</p>';}

async function renderLogFresh(){S=await api('state');renderLog();}
function renderLog(){const el=$('#log');if(!S.log.length){el.innerHTML='<p class="muted">אין פתיחות עדיין.</p>';return;}
  el.innerHTML='<table><tr><th>זמן</th><th>שער</th><th>תוצאה</th><th>מקור</th></tr>'+S.log.map(l=>'<tr><td class="mono">'+esc(new Date(l.at).toLocaleString('he-IL'))+'</td><td>'+esc(l.gate)+'</td><td class="'+(l.ok?'ok':'bad')+'">'+(l.ok?'✅':'❌ '+esc(l.detail||''))+'</td><td class="mono">'+esc(l.via)+'</td></tr>').join('')+'</table>';}

$('#rotate').onclick=async()=>{if(!confirm('להחליף את הקישור הסודי? תצטרך לעדכן את Grok ואת המועדפים ברכב.'))return;await api('rotate',{});load();};
$('#save-limits').onclick=async()=>{await api('config',{cooldownSec:+$('#cooldown').value,maxPerHour:+$('#maxph').value});load();};
load().catch(e=>{document.querySelector('main').insertAdjacentHTML('afterbegin','<p class="bad">'+esc(e.message)+'</p>');});
`;
