import { execFileSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';

export const ADMIN_EMAIL = 'admin@shabatzak.local';
export const ADMIN_PASSWORD = 'local-dev-password-1234';

/** Reset the local D1 database so every suite starts from known data. */
export default function globalSetup(): void {
  if (!existsSync('.dev.vars')) {
    writeFileSync(
      '.dev.vars',
      `BOOTSTRAP_ADMIN_EMAIL=${ADMIN_EMAIL}\nBOOTSTRAP_ADMIN_PASSWORD=${ADMIN_PASSWORD}\n`,
    );
  }

  const wrangler = (args: string[]) =>
    execFileSync('npx', ['wrangler', ...args], { stdio: 'inherit', env: process.env });

  wrangler(['d1', 'migrations', 'apply', 'shabatzak', '--local']);
  wrangler(['d1', 'execute', 'shabatzak', '--local', '--file=./scripts/seed-demo.sql']);
  // Clearing users lets the bootstrap-admin path run on every suite.
  wrangler([
    'd1',
    'execute',
    'shabatzak',
    '--local',
    '--command',
    'DELETE FROM sessions; DELETE FROM login_attempts; DELETE FROM notifications; DELETE FROM users;',
  ]);
}
