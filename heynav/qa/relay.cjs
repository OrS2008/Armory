// Local QA only: forwards /osrm/* and /photon/* to the real services through curl
// (the local Workers runtime cannot use this environment's outbound proxy).
const http = require('http'), { execFile } = require('child_process');
const T = { '/osrm/': 'https://router.project-osrm.org/route/v1/driving/', '/photon/': 'https://photon.komoot.io/api/', '/kml/': 'https://www.google.com/maps/d/kml?mid=1bspXgBYQ2GWj_6rDdGrJhG81RQConHHm&forcekml=1' };
http.createServer((req, res) => {
  const k = Object.keys(T).find((p) => req.url.startsWith(p));
  if (!k) { res.writeHead(404); return res.end(); }
  const url = k === '/kml/' ? T[k] : T[k] + req.url.slice(k.length);
  execFile('curl', ['-sS', '--max-time', '20', '-A', req.headers['user-agent'] || 'HeyNav-QA', url], { maxBuffer: 20e6 }, (err, out) => {
    res.writeHead(err ? 502 : 200, { 'content-type': k === '/kml/' ? 'text/xml' : 'application/json' }); res.end(err ? '{}' : out);
  });
}).listen(8796, '127.0.0.1', () => console.log('relay on 8796'));
