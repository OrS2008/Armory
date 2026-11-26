// Origin/destination rows, route choices, the camera layer, and a test drive past a real camera.
const { chromium } = require('playwright');
const B = process.env.BASE || 'http://127.0.0.1:8795';
const OUT = process.env.OUT || __dirname;
const checks = [];
const ok = (name, cond, extra = '') => { checks.push(!!cond); console.log((cond ? '  ✅ ' : '  ❌ ') + name + (extra ? ' — ' + extra : '')); };
const R = 6371008.8, rad = Math.PI / 180;
const move = (lon, lat, brg, m) => [lon + (m * Math.sin(brg * rad)) / (R * Math.cos(lat * rad)) / rad, lat + (m * Math.cos(brg * rad)) / R / rad];

(async () => {
  const br = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const c = await br.newContext({ viewport: { width: 1600, height: 900 }, geolocation: { latitude: 32.0853, longitude: 34.7818, accuracy: 8 }, permissions: ['geolocation'] });
  await c.addInitScript(() => { try { localStorage.setItem('hn_muted', 'true'); localStorage.setItem('hn_theme', '"dark"'); } catch (e) {} });
  const p = await c.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(B + '/');
  await p.waitForFunction(() => window.__hn && window.__hn.state().cams > 0, null, { timeout: 30000 });
  ok('camera map loaded', true, (await p.evaluate(() => window.__hn.state().cams)) + ' cameras');
  ok('two rows: origin shows "my location"', (await p.getAttribute('#from', 'placeholder')).length > 0 && await p.isVisible('#q'), await p.getAttribute('#from', 'placeholder'));

  // Origin by search, destination by search
  await p.fill('#from', 'כיכר המדינה');
  await p.waitForSelector('#res button:nth-child(2)', { timeout: 15000 });
  ok('origin results start with "my location"', (await p.textContent('#res button')).includes('📍'));
  await p.click('#res button:nth-child(2)');
  ok('origin set from search', (await p.inputValue('#from')).length > 0, await p.inputValue('#from'));
  await p.fill('#q', 'עזריאלי');
  await p.waitForSelector('#res button', { timeout: 15000 });
  await p.click('#res button');
  await p.waitForFunction(() => !document.querySelector('#go').disabled, null, { timeout: 20000 });
  const n = await p.evaluate(() => window.__hn.state().routes);
  ok('route options offered', n >= 1, n + ' route(s): ' + (await p.textContent('#alts')).slice(0, 120));
  ok('traffic / cameras line', true, await p.textContent('#pextra'));
  await p.waitForTimeout(1500);
  await p.screenshot({ path: `${OUT}/live-preview.png` });
  if (n > 1) {
    await p.click('#alts button:nth-child(2)');
    ok('choosing another route switches to it', (await p.evaluate(() => window.__hn.state().routeIdx)) === 1);
  }
  await p.click('#reverse');
  await p.waitForFunction(() => !document.querySelector('#go').disabled, null, { timeout: 20000 });
  ok('reverse direction', (await p.textContent('#pname')).length > 0, 'to ' + await p.textContent('#pname'));
  await p.click('#cancel');

  // Test drive past a real camera: build origin/destination around one from the map, along its direction.
  const cam = await p.evaluate(() => { const cs = JSON.parse(localStorage.getItem('hn_cams')).cams; return cs.find((c) => c.id === 1) || cs.find((c) => c.alert && c.h.length === 1); });
  const from = move(cam.lon, cam.lat, cam.h[0] + 180, 700), to = move(cam.lon, cam.lat, cam.h[0], 500);
  await c.clearPermissions(); // no GPS: the manual start point stays in charge
  await p.evaluate(([lon, lat]) => { localStorage.setItem('hn_manual', JSON.stringify({ lon, lat, name: 'QA start' })); }, from);
  await p.reload();
  await p.waitForFunction(() => window.__hn && window.__hn.state().cams > 0, null, { timeout: 30000 });
  await p.evaluate(([lon, lat]) => window.__hn.choose({ name: 'QA camera test', detail: '', lon, lat }), to);
  await p.waitForFunction(() => !document.querySelector('#go').disabled, null, { timeout: 20000 });
  ok('route passes the camera', (await p.textContent('#pextra')).includes('📷'), await p.textContent('#pextra'));
  await p.click('#sim');
  let seen = '';
  for (let i = 0; i < 40 && !seen; i++) { await p.waitForTimeout(1000); if (await p.isVisible('#bcam')) seen = await p.textContent('#bcam'); }
  ok('camera alert on the banner while driving', !!seen, seen + ` (camera ${cam.id}, ${cam.desc.slice(0, 40)})`);
  await p.screenshot({ path: `${OUT}/live-camera.png` });
  await p.click('#end');
  ok('no JS errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  await br.close();
  const failed = checks.filter((x) => !x).length;
  console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
  process.exit(failed ? 1 : 0);
})();
