// A stand-in for the PalGate API, for local QA only.
const http = require('http');
const opens = [];
let linkN = 0;
const PHONE = 972501234567;
const ok = (res, extra) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ err: null, status: 'ok', ...extra })); };
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const p = u.pathname;
  if (p === '/__opens') { res.end(JSON.stringify(opens)); return; }
  if (p.startsWith('/v1/bt/un/secondary/init/')) {
    // the real API long-polls until the QR is scanned; we "scan" after 1.5 s
    setTimeout(() => ok(res, { user: { id: String(PHONE), token: '00112233445566778899aabbccdd' + String(++linkN).padStart(4, '0') }, secondary: '1' }), 1500);
    return;
  }
  const token = req.headers['x-bt-token'] || '';
  if (!/^11[0-9A-F]{44}$/.test(token) || parseInt(token.slice(2, 14), 16) !== PHONE) {
    res.writeHead(401, { 'content-type': 'application/json' }); res.end(JSON.stringify({ err: 'bad token', status: 'failed', msg: 'bad token' })); return;
  }
  if (p === '/v1/bt/user/check-token') return ok(res, { msg: 'token valid' });
  if (p === '/v1/bt/devices') return ok(res, { devices: [{ id: 'GATE-MAIN', name1: 'שער ראשי' }, { id: 'GATE-WALK', name1: 'הולכי רגל', output2: true }] });
  const m = p.match(/^\/v1\/bt\/device\/([^/]+)\/open-gate$/);
  if (m) { opens.push({ device: m[1], output: u.searchParams.get('outputNum'), at: Date.now() }); return ok(res, { msg: 'Gate opened: true' }); }
  res.writeHead(404); res.end('{}');
}).listen(8790, '127.0.0.1', () => console.log('palgate mock on 8790'));
