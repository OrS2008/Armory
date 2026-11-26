// Places around you: hotel / food / mall… badges on the map, tap one, settings toggle and legend.
const { chromium } = require('playwright');
const B = process.env.BASE || 'http://127.0.0.1:8795';
const OUT = process.env.OUT || __dirname;
const checks = [];
const ok = (name, cond, extra = '') => { checks.push(!!cond); console.log((cond ? '  ✅ ' : '  ❌ ') + name + (extra ? ' — ' + extra : '')); };

(async () => {
  const br = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  for (const theme of ['dark', 'light']) {
    console.log('== ' + theme);
    // Near Azrieli / Dizengoff: hotels, restaurants, cafés and malls all around.
    const c = await br.newContext({ viewport: { width: 1600, height: 900 }, geolocation: { latitude: 32.0786, longitude: 34.7740, accuracy: 8 }, permissions: ['geolocation'] });
    await c.addInitScript((t) => { try { localStorage.setItem('hn_muted', 'true'); localStorage.setItem('hn_theme', JSON.stringify(t)); } catch (e) {} }, theme);
    const p = await c.newPage();
    const errs = [];
    p.on('pageerror', (e) => errs.push(e.message));
    await p.goto(B + '/');
    await p.waitForFunction(() => document.querySelector('#gps')?.textContent?.includes('GPS'), null, { timeout: 20000 });
    await p.evaluate(() => window.__hnmap.jumpTo({ center: [34.7740, 32.0786], zoom: 16.4, pitch: 0, bearing: 0 }));
    await p.waitForTimeout(5000);
    const seen = await p.evaluate(() => {
      const fs = window.__hnmap.queryRenderedFeatures({ layers: ['hn-poi-1', 'hn-poi-2', 'hn-poi-3'] });
      const t = {};
      for (const f of fs) { const k = f.layer.layout['icon-image']; t[f.properties.class] = (t[f.properties.class] || 0) + 1; }
      return t;
    });
    const kinds = Object.keys(seen);
    ok('places drawn around you', kinds.length >= 4, JSON.stringify(seen));
    ok('hotels, food and cafés among them', ['lodging', 'restaurant', 'cafe'].filter((k) => seen[k]).length >= 2);
    await p.screenshot({ path: `${OUT}/places-${theme}.png` });

    // Tap a hotel (or any place) → popup with its kind and "navigate here"
    const pt = await p.evaluate(() => {
      const m = window.__hnmap;
      const fs = m.queryRenderedFeatures({ layers: ['hn-poi-1', 'hn-poi-2'] });
      const f = fs.find((x) => x.properties.class === 'lodging') || fs[0];
      if (!f) return null;
      const q = m.project(f.geometry.coordinates);
      return { x: q.x, y: q.y };
    });
    if (pt) {
      await p.mouse.click(pt.x, pt.y);
      await p.waitForSelector('#placesheet:not([hidden])', { timeout: 5000 }).catch(() => {});
      await p.waitForTimeout(800);
      ok('tapping a place opens its card', await p.isVisible('#placesheet'), (await p.textContent('#plname')) + ' · ' + (await p.textContent('#plcat')));
      ok('card offers navigation', await p.isVisible('#plgo'), await p.textContent('#plgo'));
      ok('card shows a picture or the place icon', await p.isVisible('#plhero svg, #plhero img'));
      await p.screenshot({ path: `${OUT}/places-${theme}-card.png` });
      await p.click('#placesheet [data-close]');
    } else ok('a hotel or place to tap', false);

    if (theme === 'dark') {
      await p.click('#openset');
      ok('legend explains every icon', (await p.$$('#poileg > span')).length === 16);
      await p.screenshot({ path: `${OUT}/places-legend.png` });
      await p.click('#o-pois');
      await p.waitForTimeout(500);
      ok('places can be switched off', (await p.evaluate(() => window.__hnmap.getLayoutProperty('hn-poi-1', 'visibility'))) === 'none');
      await p.click('#o-pois');
      await p.click('#setsheet [data-close]');
      // Light theme next (setStyle re-adds the layer)
    }
    ok('no JS errors', errs.length === 0, errs.slice(0, 3).join(' | '));
    await c.close();
  }
  await br.close();
  const failed = checks.filter((x) => !x).length;
  console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
  process.exit(failed ? 1 : 0);
})();
