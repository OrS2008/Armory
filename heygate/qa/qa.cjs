// HeyGate full QA: press every button, verify the effect. Run against wrangler dev + palgate-mock.
const { chromium, devices } = require('playwright');
const B = 'http://localhost:8799';
const MOCK = 'http://127.0.0.1:8790';
const results = [];
let section = '';
const sec = (s) => { section = s; console.log('\n== ' + s); };
function check(name, ok, detail = '') { results.push({ section, name, ok: !!ok, detail }); console.log((ok ? '  ✅ ' : '  ❌ ') + name + (ok || !detail ? '' : '  → ' + detail)); }
async function step(name, fn) { try { await fn(); } catch (e) { check(name, false, String(e.message || e).split('\n')[0].slice(0, 200)); } }
const opens = async () => (await (await fetch(MOCK + '/__opens')).json()).length;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];

let ipN = 10;
async function newCtx(b, opts = {}) {
  // Each browser is its own visitor (own IP) from Israel, as Cloudflare would report.
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, ...opts, extraHTTPHeaders: { 'accept-language': 'he-IL', 'cf-connecting-ip': `10.20.0.${ipN++}`, 'cf-ipcountry': 'IL', ...(opts.extraHTTPHeaders || {}) } });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: B });
  return ctx;
}
async function watch(p, tag) {
  p.on('pageerror', (e) => errors.push(`${tag} pageerror: ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`${tag} console: ${m.text()}`); });
  p.on('response', (r) => { if (r.status() >= 500) errors.push(`${tag} ${r.status()} ${r.url()}`); });
  let nextPrompt = null;
  p.on('dialog', (d) => d.accept(nextPrompt ?? undefined));
  return { setPrompt: (v) => (nextPrompt = v) };
}
async function authenticator(ctx, p) {
  const cdp = await ctx.newCDPSession(p);
  await cdp.send('WebAuthn.enable');
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
  return { cdp, authenticatorId };
}
const clip = (p) => p.evaluate(() => navigator.clipboard.readText());
const toastText = async (p) => (await p.textContent('#toasts')) || '';
async function waitToast(p, re, ms = 6000) { const end = Date.now() + ms; while (Date.now() < end) { const t = await toastText(p); if (re.test(t)) return t; await sleep(100); } return await toastText(p); }
const state = (p) => p.evaluate(() => fetch('/app/api/state', { method: 'POST', headers: { 'content-type': 'application/json', 'x-gate-csrf': '1' }, body: '{}' }).then((r) => r.json()));
const askYes = (p) => p.click('dialog [value=yes]');
const askNo = (p) => p.click('dialog [value=no]');
async function tab(p, t) { await p.click(`.tabs [data-tab=${t}]`); await p.waitForSelector(`#tab-${t}:not([hidden]) > *`); await sleep(250); }

(async () => {
  const b = await chromium.launch();
  const ctx = await newCtx(b);
  const p = await ctx.newPage();
  const w = await watch(p, 'A');
  await authenticator(ctx, p);
  const user = 'qa' + (Date.now() % 1e6);
  let password = 'qa long password 1';
  let recovery = '';

  // ------------------------------------------------------------ landing & privacy
  sec('Landing page');
  await step('landing', async () => {
    await p.goto(B + '/');
    check('loads with HeyGate title', (await p.title()).includes('HeyGate'));
    check('footer disclaimer', (await p.textContent('footer.disc')).includes('HeyGate אינו קשור'));
    await p.click('.theme-switch [data-theme-opt=dark]');
    check('🌙 night button → dark theme', (await p.getAttribute('html', 'data-theme')) === 'dark');
    await p.reload();
    check('night theme remembered after reload', (await p.getAttribute('html', 'data-theme')) === 'dark');
    await p.click('.theme-switch [data-theme-opt=light]');
    check('☀️ day button → light theme', (await p.getAttribute('html', 'data-theme')) === 'light');
    await p.click('[data-lang=en]'); await p.waitForSelector('html[lang=en]');
    check('EN button → English, left-to-right', (await p.getAttribute('html', 'dir')) === 'ltr' && (await p.textContent('footer.disc')).includes('not affiliated'));
    await p.click('[data-lang=he]'); await p.waitForSelector('html[lang=he]');
    check('עב button → Hebrew, right-to-left', (await p.getAttribute('html', 'dir')) === 'rtl');
    await p.click('a[href="/privacy"]'); await p.waitForURL(/\/privacy/);
    check('Privacy link opens the privacy page', (await p.textContent('h1')).includes('מדיניות פרטיות'));
    await p.click('header a[href="/"]'); await p.waitForURL(B + '/');
    check('Privacy → logo goes home', true);
    await p.click('.cta a[href="/app#signup"]'); await p.waitForURL(/\/app/);
    check('"התחל בחינם" → sign-up form', await p.isVisible('#v-signup'));
    await p.goto(B + '/'); await p.click('.cta a[href="/app#login"]'); await p.waitForURL(/\/app/);
    check('"יש לי חשבון" → sign-in form', await p.isVisible('#v-login'));
    await p.goto(B + '/'); await p.click('header a[href="/app#login"]'); await p.waitForURL(/\/app/);
    check('"כניסה" (header) → sign-in form', await p.isVisible('#v-login'));
  });

  // ------------------------------------------------------------ sign-up
  sec('Sign-up');
  await step('signup', async () => {
    await p.goto(B + '/app#signup');
    await p.click('#v-signup [data-view=login]');
    check('"התחבר" link switches to sign-in', await p.isVisible('#v-login') && !(await p.isVisible('#v-signup')));
    await p.click('#v-login [data-view=signup]');
    check('"צור חשבון" link switches back to sign-up', await p.isVisible('#v-signup'));
    await p.fill('#sf [name=username]', user); await p.fill('#sf [name=password]', password); await p.fill('#sf [name=password2]', password + 'x');
    await p.click('#sf button[type=submit]');
    check('mismatched passwords → error shown', (await p.textContent('#err')).includes('לא תואמות'));
    await p.fill('#sf [name=username]', 'bad name!');  await p.fill('#sf [name=password2]', password);
    await p.click('#sf button[type=submit]'); await sleep(300);
    check('invalid username → blocked before sending', !(await p.isVisible('dialog')));
    await p.fill('#sf [name=username]', user);
    await p.click('#sf button[type=submit]');
    await p.waitForSelector('dialog .reccode');
    recovery = (await p.textContent('dialog .reccode')).trim();
    check('recovery code dialog appears (XXXXX-XXXXX-XXXXX-XXXXX)', /^[A-Z2-9]{5}(-[A-Z2-9]{5}){3}$/.test(recovery), recovery);
    check('"המשך" disabled until "שמרתי" is ticked', await p.isDisabled('#cont'));
    await p.click('dialog [data-copy]'); await sleep(200);
    check('"העתק" copies the recovery code', (await clip(p)) === recovery);
    await p.check('#saved');
    check('ticking "שמרתי" enables "המשך"', !(await p.isDisabled('#cont')));
    await p.click('#cont'); await p.waitForSelector('#pkn');
    check('passkey offer dialog appears', (await p.textContent('dialog h2')).includes('כניסה מהירה'));
    await p.click('#pkn'); await p.waitForSelector('#tab-home .card');
    check('"אחר כך" → into the panel', true);
    check('duplicate username refused', (await p.evaluate(async (u) => (await fetch('/app/signup', { method: 'POST', headers: { 'x-gate-csrf': '1' }, body: JSON.stringify({ username: u, password: 'another long password' }) })).status, user)) === 409);
  });

  // ------------------------------------------------------------ panel shell
  sec('Panel: header & tabs');
  await step('shell', async () => {
    check('status shows "פעיל"', (await p.textContent('#hstatus')).includes('פעיל'));
    for (const t of ['access', 'security', 'log', 'home']) { await tab(p, t); check(`tab "${t}" opens its section`, await p.isVisible(`#tab-${t}`)); }
    await tab(p, 'security'); await p.reload(); await p.waitForSelector('#tab-security:not([hidden]) > *');
    check('last tab remembered after reload', await p.isVisible('#tab-security'));
    await tab(p, 'access');
    check('Access before linking → single "connect first" card', (await p.textContent('#tab-access')).includes('קודם מחברים את השער'));
  });

  // ------------------------------------------------------------ PalGate linking
  sec('Connect PalGate & choose gates');
  await step('link', async () => {
    await p.click('#need'); await p.waitForSelector('dialog #lq svg');
    check('"חבר את PalGate" (Access) opens the QR dialog', true);
    const share = await p.getAttribute('#lcopy', 'data-copy');
    check('dialog offers a second-screen address /q/XXXXXX', /\/q\/[A-Z2-9]{6}$/.test(share || ''), share);
    await p.click('#lcopy'); await sleep(200);
    check('"העתק" copies the second-screen address', (await clip(p)) === share);
    const q = await ctx.newPage(); await q.goto(share);
    check('second-screen page shows the same QR', (await q.$('.qrbig svg')) !== null);
    await q.close();
    await p.waitForSelector('dialog', { state: 'detached', timeout: 10000 });
    check('after the scan, dialog closes by itself', (await waitToast(p, /PalGate חובר/)).includes('חובר'));
    await tab(p, 'home');
    await p.waitForSelector('#w-gates .gate-row');
    const rows = await p.$$('#w-gates .gate-row');
    check('gate list loaded from PalGate (2 gates + relay 2)', rows.length === 3, String(rows.length));
    check('first gate pre-selected', await p.isChecked('#w-gates .gate-row:first-child [type=checkbox]'));
    await p.fill('#w-gates .gate-row:first-child .label', 'שער הבית');
    await p.check('#w-gates .gate-row:nth-child(2) [type=checkbox]');
    await p.click('#w-gates #gs');
    await waitToast(p, /נשמר/);
    await p.waitForSelector('.gatebtn');
    const btns = await p.$$eval('.gatebtn', (e) => e.map((x) => x.textContent));
    check('"שמור" saves 2 gates → 2 quick-open buttons', btns.length === 2 && btns[0].includes('שער הבית'), btns.join('|'));
    const before = await opens();
    await p.click('.gatebtn >> nth=0');
    await p.waitForSelector('.gatebtn.ok');
    check('quick-open button really opens the gate (PalGate called)', (await opens()) === before + 1);
    await sleep(2800);
    check('stats: "פתיחות היום" counts the open', (await p.textContent('.stat b')).trim() === '1');
    await p.click('#gd summary'); await p.waitForSelector('#gates-edit .gate-row');
    check('"עריכת שערים" opens the gate editor', true);
    await p.click('#gates-edit #g2'); await sleep(200);
    check('"יש לי ממסר שני" adds relay-2 rows', (await p.$$('#gates-edit .gate-row')).length === 4);
    await p.click('#tab-home details:has(#relink) summary'); await p.click('#relink'); await p.waitForSelector('dialog #lq svg');
    check('"חבר מחדש" opens a new QR dialog', true);
    await p.click('#lc'); await sleep(300);
    check('"סגור" closes it', !(await p.isVisible('dialog')));
    await p.click('#unlink'); await askNo(p); await sleep(300);
    check('"נתק" → cancel keeps PalGate connected', !!(await state(p)).linked);
  });

  // ------------------------------------------------------------ access: Grok
  sec('Access: Grok');
  let grok;
  await step('grok', async () => {
    await p.evaluate(() => fetch('/app/api/settings', { method: 'POST', headers: { 'x-gate-csrf': '1' }, body: JSON.stringify({ cooldownSec: 0 }) }));
    await tab(p, 'access');
    const st = await state(p);
    grok = st.config.channels.find((c) => c.kind === 'grok');
    check('Grok section shows the existing Grok card (no extra "turn on")', !!grok && !(await p.isVisible('#addgrok')));
    check('Grok card shows 3 simple steps', (await p.$$('[data-grok="' + grok.id + '"] .steps-simple li')).length === 3);
    const instr = await p.textContent('[data-grok="' + grok.id + '"] pre');
    check('Grok instructions contain the secret link', instr.includes('/o/' + grok.secret));
    await p.click('[data-grok="' + grok.id + '"] [data-copy]'); await sleep(200);
    check('"העתק הוראות ל-Grok" copies them', (await clip(p)).includes('/o/' + grok.secret));
    const o1 = await opens();
    const r = await p.request.get(B + '/o/' + grok.secret + '/home/4821', { headers: { 'user-agent': 'Grok-Fetcher' } });
    check('Grok visiting the link → SUCCESS page and gate opens', (await r.text()).includes('SUCCESS') && (await opens()) === o1 + 1);
    await p.click('#adv > summary');
    check('"אפשרויות מתקדמות" opens', await p.isVisible('.ch[data-id="' + grok.id + '"]'));
    await p.click('.ch[data-id="' + grok.id + '"] .en + span'); await waitToast(p, /הושבת/);
    check('on/off switch → disabled; link refused', (await p.request.get(B + '/o/' + grok.secret + '?json')).status() === 403);
    await p.click('.ch[data-id="' + grok.id + '"] .en + span'); await waitToast(p, /הופעל/);
    check('switch back on → link works', (await p.request.get(B + '/o/' + grok.secret + '?json')).status() === 200);
    await p.click('.ch[data-id="' + grok.id + '"] .arm + span'); await waitToast(p, /דרוך/);
    check('"פתיחה רק כשדרוך" on → Grok refused while not armed', (await p.request.get(B + '/o/' + grok.secret + '?json')).status() === 403);
    await p.click('.ch[data-id="' + grok.id + '"] .armnow'); await waitToast(p, /דרוך ל-/);
    check('"דרוך עכשיו" → Grok allowed', (await p.request.get(B + '/o/' + grok.secret + '?json')).status() === 200);
    await p.click('.ch[data-id="' + grok.id + '"] .arm + span'); await sleep(600);
    await p.click('.ch[data-id="' + grok.id + '"] details summary');
    await p.fill('.ch[data-id="' + grok.id + '"] .nm', 'Grok שלי');
    await p.fill('.ch[data-id="' + grok.id + '"] .mx', '7');
    await p.click('.ch[data-id="' + grok.id + '"] .saveadv'); await waitToast(p, /נשמר/);
    const g2 = (await state(p)).config.channels.find((c) => c.id === grok.id);
    check('advanced "שמור" saves name and hourly limit', g2.name === 'Grok שלי' && g2.maxPerHour === 7, JSON.stringify({ n: g2.name, m: g2.maxPerHour }));
    await p.click('.ch[data-id="' + grok.id + '"] details summary').catch(() => {});
    if (!(await p.isVisible('.ch[data-id="' + grok.id + '"] .rot'))) await p.click('.ch[data-id="' + grok.id + '"] details summary');
    await p.click('.ch[data-id="' + grok.id + '"] .rot'); await askYes(p); await waitToast(p, /הוחלף/);
    const g3 = (await state(p)).config.channels.find((c) => c.id === grok.id);
    check('"החלף קישור" → new secret; old link dead', g3.secret !== grok.secret && (await p.request.get(B + '/o/' + grok.secret + '?json')).status() === 404);
    grok = g3;
  });

  // ------------------------------------------------------------ access: phone automation
  sec('Access: phone automation');
  await step('phone', async () => {
    const ph = (await state(p)).config.channels.find((c) => c.kind === 'phone');
    const box = '.ch[data-id="' + ph.id + '"]';
    const api = (path, body) => p.evaluate(([a, b]) => fetch('/app/api/' + a, { method: 'POST', headers: { 'x-gate-csrf': '1' }, body: JSON.stringify(b) }).then((r) => r.status), [path, body]);
    // The local engine reports its own (non-IL) country, so first prove the IL-only default bites…
    check('IL-only default refuses a request from outside Israel', (await p.request.post(B + '/o/' + ph.secret + '/home?json')).status() === 403);
    // …then allow anywhere to exercise the rest.
    await api('channel/update', { id: ph.id, countries: '' }); await p.reload(); await tab(p, 'access');
    await p.click('#adv > summary'); await p.waitForSelector(box + ' .copy');
    await p.click(box + ' .copy [data-copy]'); await sleep(200);
    const url = await clip(p);
    check('"העתק" copies the automation URL', url.includes('/o/' + ph.secret));
    const o = await opens();
    check('automation POST → gate opens', (await p.request.post(url)).status() === 200 && (await opens()) === o + 1);
    check('automation link refuses GET (no accidental opens)', (await p.request.get(url)).status() === 405);
    check('automation card shows the arm URL', (await p.textContent(box)).includes('/arm/' + ph.secret));
    check('arm URL (POST) arms Grok', (await p.request.post(B + '/arm/' + ph.secret)).status() === 200);
  });

  // ------------------------------------------------------------ access: pair a device
  sec('Access: pair the car');
  await step('pair', async () => {
    const car = await newCtx(b, { viewport: { width: 1920, height: 1200 }, colorScheme: 'dark' });
    const cp = await car.newPage(); await watch(cp, 'car');
    await cp.goto(B + '/car');
    await cp.waitForFunction(() => /[A-Z2-9]{3} [A-Z2-9]{3}/.test(document.querySelector('#code').textContent));
    const code = (await cp.textContent('#code')).replace(' ', '');
    check('car browser shows a 6-character pairing code', /^[A-Z2-9]{6}$/.test(code));
    await p.click('#pair'); await p.waitForSelector('dialog [name=code]');
    check('"צמד מכשיר" opens the pairing dialog', true);
    await p.fill('dialog [name=code]', 'AAAAAA'); await p.fill('dialog [name=name]', 'טסלה'); await p.click('dialog [value=ok]'); await sleep(500);
    check('wrong code → error inside the dialog', (await p.textContent('#pe')).length > 0);
    await p.fill('dialog [name=code]', code); await p.click('dialog [value=ok]'); await waitToast(p, /צומד/);
    await cp.waitForSelector('.big', { timeout: 15000 });
    const devc = (await state(p)).config.channels.find((c) => c.kind === 'car');
    await p.evaluate((id) => fetch('/app/api/channel/update', { method: 'POST', headers: { 'x-gate-csrf': '1' }, body: JSON.stringify({ id, countries: '' }) }), devc.id);
    check('car page turns into gate buttons after approval', (await cp.$$('.big')).length === 2);
    const o = await opens();
    await cp.click('.big >> nth=0'); await cp.waitForSelector('.big.ok');
    check('car gate button opens the gate', (await opens()) === o + 1 && (await cp.textContent('#msg')).includes('נפתח'));
    await cp.click('[data-lang=en]'); await cp.waitForSelector('html[lang=en]');
    check('car page language switch works', (await cp.textContent('footer.disc')).includes('not affiliated'));
    check('Access shows "+ צמד מכשיר נוסף" once a device exists', (await p.textContent('#pair')).includes('נוסף'));
    const dev = (await state(p)).config.channels.find((c) => c.kind === 'car');
    await p.click('[data-dev="' + dev.id + '"] .devdel'); await askYes(p); await waitToast(p, /נמחק/);
    await cp.reload();
    check('deleting the device revokes it (car back to pairing)', await cp.isVisible('#code'));
    await car.close();
  });

  // ------------------------------------------------------------ security tab
  sec('Security tab');
  await step('security', async () => {
    await tab(p, 'security');
    check('plain security summary (3 lines)', (await p.$$('#tab-security .check')).length === 3);
    check('suggests turning on notifications', await p.isVisible('#todo-notif'));
    await p.click('#master + span'); await askYes(p); await waitToast(p, /הושבת/);
    check('emergency switch off → all opening refused (423)', (await p.request.get(B + '/o/' + grok.secret + '?json')).status() === 423);
    check('header shows "מושבת"', (await p.textContent('#hstatus')).includes('מושבת'));
    await tab(p, 'home'); await p.click('#reenable'); await waitToast(p, /הופעל/);
    check('"הפעל מחדש" (home) → opening works again', (await p.request.get(B + '/o/' + grok.secret + '?json')).status() === 200);
    await tab(p, 'security');
    await p.click('.top [data-theme-opt=dark]'); check('panel header: night', (await p.getAttribute('html', 'data-theme')) === 'dark');
    await p.click('.top [data-theme-opt=light]'); check('panel header: day', (await p.getAttribute('html', 'data-theme')) === 'light');
    await p.fill('#pwf [name=current]', 'wrong wrong wrong'); await p.fill('#pwf [name=next]', 'qa new password 2'); await p.click('#pwf button');
    check('password change with wrong current → error', /שגויה/.test(await waitToast(p, /שגויה/)));
    await p.fill('#pwf [name=current]', password); await p.fill('#pwf [name=next]', 'qa new password 2'); await p.click('#pwf button');
    check('password change → saved', /נשמרה/.test(await waitToast(p, /נשמרה/)));
    password = 'qa new password 2';
    await p.click('#addpk'); await waitToast(p, /נוסף/); await sleep(500);
    check('"+ הוסף מכשיר" registers a passkey', (await state(p)).passkeys.length === 1);
    w.setPrompt('אייפון של QA'); await p.click('.pkren'); await sleep(800);
    check('"שנה שם" renames the passkey', (await state(p)).passkeys[0].name === 'אייפון של QA');
    w.setPrompt(null);
    await p.fill('#notify', 'http://bad'); await p.click('#sn');
    check('notifications: invalid URL refused', /לא תקינה/.test(await waitToast(p, /לא תקינה/)));
    await p.fill('#notify', 'https://ntfy.sh/heygate-qa-topic'); await p.click('#sn'); await waitToast(p, /נשמר/);
    check('notifications: valid URL saved', (await state(p)).config.notifyUrl === 'https://ntfy.sh/heygate-qa-topic');
    await p.click('#tn'); check('"שלח בדיקה" responds', /נשלחה/.test(await waitToast(p, /נשלחה/)));
    await p.click('#tab-security details.card summary');
    await p.fill('#cd', '5'); await p.click('#scd'); await waitToast(p, /נשמר/);
    check('cooldown "שמור" saved', (await state(p)).config.cooldownSec === 5);
    await p.click('#newrec'); await askYes(p); await p.waitForSelector('dialog .reccode');
    const nr = (await p.textContent('dialog .reccode')).trim();
    check('"צור קוד שחזור חדש" shows a new code', nr !== recovery && /^[A-Z2-9]{5}(-[A-Z2-9]{5}){3}$/.test(nr));
    recovery = nr;
    await p.check('#saved'); await p.click('#cont'); await p.waitForSelector('.tabs'); await sleep(800);
  });

  // ------------------------------------------------------------ log tab
  sec('Log tab');
  await step('log', async () => {
    await p.waitForSelector('.tabs'); await tab(p, 'log');
    const all = (await p.$$('#tab-log .ev')).length;
    check('log lists events', all > 10, String(all));
    for (const [f, label] of [['open', 'פתיחות'], ['denied', 'חסימות'], ['admin', 'ניהול']]) {
      await p.click(`[data-f=${f}]`); await sleep(150);
      const n = (await p.$$('#tab-log .ev')).length;
      check(`filter "${label}" narrows the list`, n > 0 && n < all, `${n}/${all}`);
    }
    await p.click('[data-f=all]'); await p.click('#rl'); await sleep(400);
    check('"רענן" reloads', (await p.$$('#tab-log .ev')).length >= all);
    check('log entries are in Hebrew (codes translated)', (await p.textContent('#tab-log')).includes('הסיסמה הוגדרה'));
  });

  // ------------------------------------------------------------ sign-in methods
  sec('Sign out & sign-in methods');
  await step('signin', async () => {
    await p.click('#logout'); await p.waitForSelector('#v-login:not([hidden])');
    check('"יציאה" → sign-in screen (remembers you have an account)', true);
    await p.fill('#lf [name=username]', user); await p.fill('#lf [name=password]', 'wrong password!!'); await p.click('#lf button');
    check('wrong password → error message', (await p.waitForFunction(() => document.querySelector('#err').textContent.length > 0)) && (await p.textContent('#err')).includes('שגויים'));
    await p.fill('#lf [name=password]', password); await p.click('#lf button'); await p.waitForSelector('.tabs button');
    check('username + (new) password sign-in', true);
    await p.click('#logout'); await p.waitForSelector('#go'); await p.click('#go'); await p.waitForSelector('.tabs button');
    check('"כניסה עם Face ID" (passkey) sign-in', true);
    await p.click('#logout'); await p.waitForSelector('#rf', { state: 'attached' });
    await p.click('#v-login details summary'); await p.fill('#rf [name=code]', recovery); await p.click('#rf button');
    await p.waitForSelector('dialog .reccode');
    check('recovery-code sign-in → shows a fresh code', (await p.textContent('dialog .reccode')).trim() !== recovery);
    await p.check('#saved'); await p.click('#cont'); await p.waitForSelector('.tabs button');
    check('…and lands in the panel', true);
  });

  // ------------------------------------------------------------ language inside the app
  sec('Language inside the panel');
  await step('lang', async () => {
    await p.click('.top [data-lang=en]'); await p.waitForSelector('html[lang=en]'); await p.waitForSelector('.tabs');
    check('EN in the panel → English tabs', (await p.textContent('.tabs')).includes('Home'));
    check('account notification language saved as English', (await state(p)).config.lang === 'en');
    await p.click('.top [data-lang=he]'); await p.waitForSelector('html[lang=he]');
    check('back to Hebrew', (await p.textContent('.tabs')).includes('בית'));
  });

  // ------------------------------------------------------------ sign out everywhere
  sec('Sign out everywhere');
  await step('logoutall', async () => {
    const c2 = await newCtx(b); const p2 = await c2.newPage(); await watch(p2, 'B');
    await p2.goto(B + '/app#login'); await p2.fill('#lf [name=username]', user); await p2.fill('#lf [name=password]', password); await p2.click('#lf button'); await p2.waitForSelector('.tabs button');
    await tab(p, 'security'); await p.click('#tab-security details.card summary'); await p.click('#la'); await askYes(p); await p.waitForSelector('#v-login:not([hidden])');
    check('"נתק את כולם" signs this device out', true);
    const s2 = await p2.evaluate(() => fetch('/app/api/state', { method: 'POST', headers: { 'x-gate-csrf': '1' }, body: '{}' }).then((r) => r.status));
    check('…and the other device too', s2 === 401);
    await c2.close();
  });

  // ------------------------------------------------------------ super admin
  sec('System admin (/sa)');
  const sctx = await newCtx(b); const sp = await sctx.newPage(); const sw = await watch(sp, 'SA'); await authenticator(sctx, sp);
  await step('sa', async () => {
    await sp.goto(B + '/sa');
    await sp.fill('[name=setupCode]', 'WRONG'); await sp.click('#f1 button');
    check('wrong setup code → error', await sp.waitForFunction(() => document.querySelector('#err').textContent.length > 0, null, { timeout: 5000 }).then(() => true, () => false));
    await sp.fill('[name=setupCode]', 'QA-SETUP'); await sp.click('#f1 button'); await sp.waitForSelector('#tenants .ev');
    check('setup code + passkey → admin panel', true);
    check('stats show customers', (await sp.textContent('#stats')).includes('1'));
    await sp.fill('#q', 'zzzz'); await sleep(200);
    check('search filters the list', (await sp.$$('#tenants .ev')).length === 0);
    await sp.fill('#q', '');
    await sp.click('#open + span'); await waitToast(sp, /נסגרה/);
    check('sign-up switch off → sign-up page says closed', (await (await sp.request.get(B + '/app', { headers: { cookie: 'hg_lang=he' } })).text()).includes('ההרשמה לחשבונות חדשים סגורה'));
    await sp.click('#open + span'); await waitToast(sp, /נפתחה/);
    await sp.fill('#max', '9'); await sp.click('#savep'); await waitToast(sp, /נשמר/);
    check('max sign-ups saved', (await sp.textContent('#stats')).includes('/9'));
    await sp.click('#tenants .tog'); await askYes(sp); await waitToast(sp, /נחסם/);
    await p.goto(B + '/app#login');
    check('blocked customer\'s open session is cut off', await p.isVisible('#v-login'));
    await p.fill('#lf [name=username]', user); await p.fill('#lf [name=password]', password); await p.click('#lf button'); await sleep(800);
    check('blocked customer cannot sign in', (await p.textContent('#err')).length > 0);
    check('blocked customer\'s links stop', (await p.request.get(B + '/o/' + grok.secret + '?json')).status() === 404);
    await sp.click('#tenants .tog'); await waitToast(sp, /שוחרר/);
    await p.click('#lf button'); await p.waitForSelector('.tabs button');
    check('unblock → customer can sign in again', true);
    await sp.click('#logout'); await sp.waitForSelector('#go'); await sp.click('#go'); await sp.waitForSelector('#tenants .ev');
    check('admin sign-out / passkey sign-in', true);
  });

  // ------------------------------------------------------------ delete account (second customer)
  sec('Delete account');
  await step('delete', async () => {
    const c3 = await newCtx(b); const p3 = await c3.newPage(); const w3 = await watch(p3, 'C');
    await p3.goto(B + '/app#signup'); const u3 = 'del' + (Date.now() % 1e6);
    await p3.fill('#sf [name=username]', u3); await p3.fill('#sf [name=password]', 'delete me please'); await p3.fill('#sf [name=password2]', 'delete me please');
    await p3.click('#sf button[type=submit]'); await p3.waitForSelector('#saved'); await p3.check('#saved'); await p3.click('#cont'); await p3.click('#pkn'); await p3.waitForSelector('.tabs button');
    await tab(p3, 'security'); await p3.click('#tab-security details.card summary');
    w3.setPrompt('לא'); await p3.click('#delacc'); await askYes(p3); await sleep(600);
    check('delete with wrong typed confirmation → cancelled', (await p3.evaluate(() => fetch('/app/api/state', { method: 'POST', headers: { 'x-gate-csrf': '1' }, body: '{}' }).then((r) => r.status))) === 200);
    w3.setPrompt('מחק'); await p3.click('#delacc'); await askYes(p3); await p3.waitForURL(B + '/');
    check('"מחק את החשבון שלי" + typing "מחק" → account gone', (await p3.request.post(B + '/app/login/password', { headers: { origin: B, 'x-gate-csrf': '1' }, data: { username: u3, password: 'delete me please' } })).status() === 401);
    await c3.close();
  });

  sec('Admin deletes a customer');
  await step('sadelete', async () => {
    await sp.reload(); await sp.waitForSelector('#tenants .ev');
    const id = (await sp.textContent('#tenants .ev b.mono')).trim();
    sw.setPrompt(id); await sp.click('#tenants .del'); await askYes(sp); await waitToast(sp, /נמחק/);
    check('admin "מחק" + typing the id → customer removed', (await sp.$$('#tenants .ev')).length === 0);
  });

  // ------------------------------------------------------------ lockout (last: it blocks this IP)
  sec('Guessing protection');
  await step('lockout', async () => {
    const c4 = await newCtx(b); const p4 = await c4.newPage(); await watch(p4, 'D');
    await p4.goto(B + '/app#login');
    for (let i = 0; i < 5; i++) { await p4.fill('#lf [name=username]', 'nobody'); await p4.fill('#lf [name=password]', 'guess ' + i + ' guess'); await p4.click('#lf button'); await sleep(700); }
    check('5 wrong attempts → lock box with countdown', await p4.isVisible('#lock') && /\d\d:\d\d/.test(await p4.textContent('#lockt')));
    check('buttons disabled while locked', await p4.isDisabled('#lf button'));
    await c4.close();
  });

  await b.close();
  const fails = results.filter((r) => !r.ok);
  console.log(`\n${results.length - fails.length}/${results.length} checks passed`);
  console.log('JS errors / 5xx:', errors.length ? '\n  ' + errors.join('\n  ') : 'none');
  if (fails.length) console.log('FAILED:\n' + fails.map((f) => `  [${f.section}] ${f.name} → ${f.detail}`).join('\n'));
  require('fs').writeFileSync(__dirname + '/qa-results.json', JSON.stringify({ results, errors }, null, 1));
})();
