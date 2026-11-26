// Local end-to-end run: search → route → test drive, with screenshots.
// Needs `npx wrangler dev --port 8795` and `node qa/relay.cjs` running (see .dev.vars).
const { chromium } = require('playwright');
const B = process.env.BASE || 'http://127.0.0.1:8795';
const OUT = process.env.OUT || __dirname;
const checks = [];
const ok = (name, cond, extra = '') => { checks.push([name, !!cond]); console.log((cond ? '  ✅ ' : '  ❌ ') + name + (extra ? ' — ' + extra : '')); };

(async () => {
  const br = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  for (const [lang, theme] of [['he', 'dark'], ['en', 'light']]) {
    console.log(`== ${lang} / ${theme}`);
    const c = await br.newContext({ viewport: { width: 1600, height: 900 }, geolocation: { latitude: 32.0853, longitude: 34.7818, accuracy: 8 }, permissions: ['geolocation'] });
    await c.addCookies([{ name: 'hn_lang', value: lang, url: B }]);
    await c.addInitScript((t) => { try { localStorage.setItem('hn_theme', JSON.stringify(t)); localStorage.setItem('hn_muted', 'true'); } catch (e) {} }, theme);
    const p = await c.newPage();
    const errs = [];
    p.on('pageerror', (e) => errs.push(e.message));
    p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });

    await p.goto(B + '/');
    await p.waitForFunction(() => document.querySelector('#gps')?.textContent?.includes('32.08'), null, { timeout: 15000 });
    ok('location shown', true, await p.textContent('#gps'));
    await p.waitForTimeout(3000);
    const tiles = await p.evaluate(() => performance.getEntriesByType('resource').filter((e) => e.name.includes('openfreemap')).length);
    ok('map tiles loaded', tiles > 3, tiles + ' requests');
    await p.screenshot({ path: `${OUT}/nav-${lang}-browse.png` });

    await p.fill('#q', lang === 'he' ? 'דיזנגוף סנטר' : 'Dizengoff Center');
    await p.waitForSelector('#res button', { timeout: 15000 });
    ok('search results', (await p.$$('#res button')).length > 0, await p.textContent('#res button'));
    await p.click('#res button');
    await p.waitForFunction(() => !document.querySelector('#go').disabled, null, { timeout: 20000 });
    ok('route preview', true, await p.textContent('#psum'));
    await p.waitForTimeout(1500);
    await p.screenshot({ path: `${OUT}/nav-${lang}-preview.png` });

    await p.click('#sethome');
    await p.click('#sim');
    await p.waitForTimeout(600);
    ok('guidance banner', await p.isVisible('#banner'), await p.textContent('#bt'));
    const first = await p.textContent('#bt');
    await p.waitForTimeout(25000);
    await p.screenshot({ path: `${OUT}/nav-${lang}-drive.png` });
    const st = await p.evaluate(() => window.__hn.state());
    ok('progress along route', st.prog && st.prog.along > 150, Math.round(st.prog?.along || 0) + ' m, next: ' + (await p.textContent('#bt')) + ', ETA ' + (await p.textContent('#etaA')));
    ok('banner follows the drive', first !== (await p.textContent('#bt')) || st.prog.step > 0);

    await p.click('#overview');
    await p.waitForTimeout(1200);
    ok('recenter offered after overview', await p.isVisible('#recenter'));
    await p.click('#recenter');
    await p.click('#end');
    await p.waitForTimeout(600);
    ok('end returns to search', await p.isVisible('#search'));
    ok('home chip saved', ((await p.textContent('#chips')) || '').includes(lang === 'he' ? 'בית' : 'Home'));
    ok('no JS errors', errs.length === 0, errs.slice(0, 3).join(' | '));
    await c.close();
  }
  await br.close();
  const failed = checks.filter((x) => !x[1]).length;
  console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
  process.exit(failed ? 1 : 0);
})();
