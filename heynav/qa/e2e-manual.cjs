// No GPS (permission denied): set the location by hand and still get a route.
const { chromium } = require('playwright');
const B = process.env.BASE || 'http://127.0.0.1:8795';
const OUT = process.env.OUT || __dirname;
const checks = [];
const ok = (name, cond, extra = '') => { checks.push(!!cond); console.log((cond ? '  ✅ ' : '  ❌ ') + name + (extra ? ' — ' + extra : '')); };

(async () => {
  const br = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const c = await br.newContext({ viewport: { width: 1600, height: 900 } }); // no geolocation permission
  await c.addInitScript(() => { try { localStorage.setItem('hn_muted', 'true'); localStorage.setItem('hn_theme', '"light"'); } catch (e) {} });
  const p = await c.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(B + '/');
  await p.waitForFunction(() => document.querySelector('#gps').classList.contains('bad'), null, { timeout: 40000 });
  ok('no-location message shown', true, await p.textContent('#gps'));

  // 1) destination first: the app asks where you are
  await p.fill('#q', 'דיזנגוף סנטר');
  await p.waitForSelector('#res button', { timeout: 15000 });
  await p.click('#res button');
  ok('asks where you are (origin row active)', await p.evaluate(() => document.querySelector('#search').classList.contains('picking') && document.activeElement.id === 'from'), await p.getAttribute('#from', 'placeholder'));
  await p.screenshot({ path: `${OUT}/manual-1-ask.png` });

  // 2) search your own location and pick it → the route to the waiting destination follows
  await p.fill('#from', 'כיכר רבין');
  await p.waitForSelector('#res button', { timeout: 15000 });
  await p.click('#res button');
  await p.waitForFunction(() => !document.querySelector('#go').disabled, null, { timeout: 20000 });
  ok('route to the destination you picked first', (await p.textContent('#pname')).includes('דיזנגוף'), await p.textContent('#psum'));
  ok('manual-location note in the preview', await p.isVisible('#pmanual'));
  await p.waitForTimeout(1200);
  await p.screenshot({ path: `${OUT}/manual-2-route.png` });
  await p.click('#cancel');
  ok('location line shows the manual location', (await p.textContent('#gps')).includes('📍'), await p.textContent('#gps'));
  ok('origin row shows the place, with ✕ back to GPS', (await p.inputValue('#from')).includes('כיכר רבין') && await p.isVisible('#fromx'), await p.inputValue('#from'));

  // 3) tap the map → "I'm here"
  await p.mouse.click(800, 600);
  await p.waitForSelector('.maplibregl-popup button.ghost');
  await p.click('.maplibregl-popup button.ghost');
  ok('"I\'m here" from a map tap', (await p.textContent('#gps')).includes('📍'), await p.textContent('#gps'));

  // 4) remembered after reload
  await p.reload();
  await p.waitForTimeout(1500);
  ok('remembered after reload', (await p.textContent('#gps')).includes('📍'), await p.textContent('#gps'));
  await p.screenshot({ path: `${OUT}/manual-3-reload.png` });
  ok('no JS errors', errs.length === 0, errs.join(' | '));
  await br.close();
  const failed = checks.filter((x) => !x).length;
  console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
  process.exit(failed ? 1 : 0);
})();
