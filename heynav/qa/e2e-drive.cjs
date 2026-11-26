// Driving experience: low "reality" camera, speedometer, auto-follow, reports, settings, avoid options.
const { chromium } = require('playwright');
const B = process.env.BASE || 'http://127.0.0.1:8795';
const OUT = process.env.OUT || __dirname;
const checks = [];
const ok = (name, cond, extra = '') => { checks.push(!!cond); console.log((cond ? '  ✅ ' : '  ❌ ') + name + (extra ? ' — ' + extra : '')); };

(async () => {
  const br = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const c = await br.newContext({ viewport: { width: 1600, height: 900 }, geolocation: { latitude: 32.0853, longitude: 34.7818, accuracy: 8 }, permissions: ['geolocation'] });
  await c.addInitScript(() => { try { localStorage.setItem('hn_muted', 'true'); localStorage.setItem('hn_theme', '"dark"'); } catch (e) {} });
  const p = await c.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(B + '/');
  await p.waitForFunction(() => document.querySelector('#gps')?.textContent?.includes('GPS'), null, { timeout: 20000 });
  ok('simple main screen: report and settings buttons', await p.isVisible('#openrep') && await p.isVisible('#openset'));

  // Settings: avoid options and display
  await p.click('#openset');
  ok('settings sheet', await p.isVisible('#setsheet'));
  ok('Area A avoided by default', (await p.getAttribute('#o-areas', 'aria-checked')) === 'true');
  await p.click('#o-tolls');
  ok('avoid tolls can be switched on', (await p.getAttribute('#o-tolls', 'aria-checked')) === 'true');
  await p.screenshot({ path: `${OUT}/drive-settings.png` });
  await p.click('#setsheet [data-close]');

  // Report police here
  await p.click('#openrep');
  ok('report sheet with big tiles', (await p.$$('#repsheet [data-rep]')).length === 6);
  await p.screenshot({ path: `${OUT}/drive-report.png` });
  await p.click('[data-rep="police"]');
  await p.waitForSelector('#toast:not([hidden])');
  ok('report sent', true, await p.textContent('#toast'));
  await p.waitForFunction(() => window.__hn.state().reports > 0, null, { timeout: 15000 });
  ok('report appears on the map', (await p.$$('.rep-m')).length > 0);

  // Route and test drive
  await p.fill('#q', 'עזריאלי');
  await p.waitForSelector('#res button', { timeout: 20000 });
  await p.click('#res button');
  await p.waitForFunction(() => !document.querySelector('#go').disabled, null, { timeout: 40000 });
  ok('route with avoid options', true, await p.textContent('#pextra'));
  await p.evaluate(() => window.__hn.sim());
  await p.waitForTimeout(6000);
  const pitch = await p.evaluate(() => window.__hn.pitch());
  ok('low, driver\'s-eye camera', pitch >= 60, 'pitch ' + Math.round(pitch) + '°');
  const sp = await p.textContent('#spd');
  ok('speedometer shows speed', Number(sp) > 0 && await p.isVisible('#speedo'), sp + ' km/h');
  await p.screenshot({ path: `${OUT}/drive-reality.png` });

  // Drag the map away: the recenter button appears, then the view returns on its own
  await p.mouse.move(800, 450); await p.mouse.down(); await p.mouse.move(500, 300, { steps: 8 }); await p.mouse.up();
  await p.waitForTimeout(500);
  ok('moving the map shows recenter', await p.isVisible('#recenter'));
  await p.waitForTimeout(10000);
  ok('view returns to the car by itself', (await p.evaluate(() => window.__hn.state().follow)) === true && !(await p.isVisible('#recenter')));
  await p.click('#end');
  ok('no JS errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  await br.close();
  const failed = checks.filter((x) => !x).length;
  console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
  process.exit(failed ? 1 : 0);
})();
