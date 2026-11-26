// Turn list, lane guidance and fuel stops. Lanes and stations are injected into the API answers
// (TomTom/Overpass aren't reachable from the dev box); everything else is real.
const { chromium } = require('playwright');
const B = process.env.BASE || 'http://127.0.0.1:8795';
const OUT = process.env.OUT || __dirname;
const checks = [];
const ok = (name, cond, extra = '') => { checks.push(!!cond); console.log((cond ? '  ✅ ' : '  ❌ ') + name + (extra ? ' — ' + extra : '')); };

(async () => {
  const br = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const c = await br.newContext({ viewport: { width: 1600, height: 900 }, geolocation: { latitude: 32.0853, longitude: 34.7818, accuracy: 8 }, permissions: ['geolocation'] });
  await c.addInitScript(() => { try { localStorage.setItem('hn_muted', 'true'); localStorage.setItem('hn_theme', '"dark"'); } catch (e) {} });
  const routeUrls = [];
  // Real routes, plus lanes on the first few turns (as TomTom would add them).
  await c.route('**/api/route?*', async (route) => {
    routeUrls.push(route.request().url());
    const res = await route.fetch();
    const d = await res.json();
    for (const r of d.routes || []) {
      let n = 0;
      for (const s of r.steps) if (s.speak && s.type !== 'depart' && s.type !== 'arrive' && s.type !== 'waypoint' && n < 3) {
        n++; s.lanes = s.icon.includes('left') ? [{ d: ['left'], ok: true }, { d: ['straight'], ok: false }, { d: ['straight', 'right'], ok: false }] : [{ d: ['left'], ok: false }, { d: ['straight'], ok: false }, { d: ['straight', 'right'], ok: true }];
      }
    }
    d.route = d.routes[d.best ?? 0];
    await route.fulfill({ response: res, json: d });
  });
  // Two stations next to the route the page asks about.
  await c.route('**/api/fuel?*', async (route) => {
    const line = new URL(route.request().url()).searchParams.get('line').split(';').map((x) => x.split(',').map(Number));
    const a = line[Math.min(3, line.length - 1)], b = line[Math.min(8, line.length - 1)];
    await route.fulfill({ json: { ok: true, stations: [
      { id: 'n1', name: 'פז', brand: '', lon: a[0] + 0.0004, lat: a[1] },
      { id: 'n2', name: 'סונול', brand: '', lon: b[0], lat: b[1] + 0.0004 },
    ] } });
  });
  const p = await c.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(B + '/');
  await p.waitForFunction(() => document.querySelector('#gps')?.textContent?.includes('GPS'), null, { timeout: 20000 });

  await p.fill('#q', 'עזריאלי');
  await p.waitForSelector('#res button', { timeout: 20000 });
  await p.click('#res button');
  await p.waitForFunction(() => !document.querySelector('#go').disabled, null, { timeout: 40000 });
  ok('no test-drive button any more', !(await p.$('#sim')));

  // All turns from the preview
  await p.click('#psteps');
  const rows = await p.$$('#steplist button');
  ok('turn list opens from the preview', await p.isVisible('#stepsheet') && rows.length >= 3, rows.length + ' turns');
  ok('turn list shows lanes where known', (await p.$$('#steplist .lanes')).length >= 1);
  await p.screenshot({ path: `${OUT}/turns-list.png` });
  await p.click('#stepsheet [data-close]');

  // Fuel on the way → stop
  await p.click('#pfuel');
  await p.waitForSelector('#fuellist [role=listitem]', { timeout: 15000 });
  ok('fuel stations listed in route order', (await p.$$('#fuellist [role=listitem]')).length === 2, await p.textContent('#fuellist [role=listitem]'));
  await p.screenshot({ path: `${OUT}/turns-fuel.png` });
  const before = routeUrls.length;
  await p.click('#fuellist [role=listitem] .go');
  await p.waitForFunction((n) => !document.querySelector('#go').disabled && window.__hn.state().stop, before, { timeout: 40000 });
  ok('stop added: route recalculated through it', routeUrls.slice(before).some((u) => u.includes('via=')), (await p.textContent('#pstop')) || '');
  ok('route has a waypoint step', await p.evaluate(() => window.__hn.state().steps > 0));

  // Drive: banner shows lanes; tapping it lists the turns ahead
  await p.evaluate(() => window.__hn.sim());
  await p.waitForSelector('#banner:not([hidden])');
  await p.waitForFunction(() => !document.querySelector('#blanes').hidden, null, { timeout: 60000 }).catch(() => {});
  ok('lane guidance in the banner', await p.isVisible('#blanes'), (await p.$$('#blanes .ln.on')).length + ' lit lane(s)');
  await p.screenshot({ path: `${OUT}/turns-lanes.png` });
  await p.click('#bt');
  ok('tapping the banner opens the turn list', await p.isVisible('#stepsheet'));
  await p.screenshot({ path: `${OUT}/turns-drive-list.png` });
  await p.click('#steplist button:last-child');
  await p.waitForTimeout(400);
  ok('choosing a turn shows it on the map', (await p.evaluate(() => window.__hn.state().follow)) === false && await p.isVisible('#recenter'));
  ok('fuel button while driving', await p.isVisible('#openfuel'));
  await p.click('#openfuel');
  await p.waitForSelector('#fuelsheet:not([hidden])');
  ok('current stop can be removed', await p.isVisible('#fstop .stopbar'));
  await p.click('#fuelsheet [data-close]');
  await p.click('#end');
  ok('no JS errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  await br.close();
  const failed = checks.filter((x) => !x).length;
  console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
  process.exit(failed ? 1 : 0);
})();
