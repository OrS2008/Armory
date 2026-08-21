/**
 * Starts the end-to-end server deterministically.
 *
 * Playwright launches `webServer` before `globalSetup`, so preparing the
 * database or writing `.dev.vars` from a global setup is too late — wrangler has
 * already read its environment. Everything the suite needs therefore happens
 * here, in order, before the server binds its port, and the bootstrap
 * credentials are injected as explicit bindings rather than through a file.
 */
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const PORT = process.env.E2E_PORT ?? '8788';
const credentials = JSON.parse(
  readFileSync(new URL('./credentials.json', import.meta.url), 'utf8'),
);

const wrangler = (args) => {
  const result = spawnSync('npx', ['wrangler', ...args], {
    stdio: 'inherit',
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error(`wrangler ${args.join(' ')} failed with status ${result.status}`);
  }
};

wrangler(['d1', 'migrations', 'apply', 'shabatzak', '--local']);
wrangler(['d1', 'execute', 'shabatzak', '--local', '--file=./scripts/seed-demo.sql']);
// Clearing users lets the first-run bootstrap path create the administrator on
// every suite, so the login tests exercise the real code path.
wrangler([
  'd1',
  'execute',
  'shabatzak',
  '--local',
  '--command',
  'DELETE FROM sessions; DELETE FROM login_attempts; DELETE FROM notifications; DELETE FROM users;',
]);

const server = spawn(
  'npx',
  [
    'wrangler',
    'pages',
    'dev',
    '--port',
    PORT,
    '--ip',
    '127.0.0.1',
    '--binding',
    `BOOTSTRAP_ADMIN_EMAIL=${credentials.email}`,
    '--binding',
    `BOOTSTRAP_ADMIN_PASSWORD=${credentials.password}`,
  ],
  { stdio: 'inherit', env: process.env },
);

const stop = (signal) => () => {
  server.kill(signal);
  process.exit(0);
};
process.on('SIGINT', stop('SIGINT'));
process.on('SIGTERM', stop('SIGTERM'));
server.on('exit', (code) => process.exit(code ?? 0));
