import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

// Read rather than imported: `tests/e2e/start-server.mjs` loads the same file
// the same way, so the suite and the server cannot drift apart, and neither
// side needs an ESM import attribute.
const credentials = JSON.parse(
  readFileSync(new URL('./credentials.json', import.meta.url), 'utf8'),
) as { email: string; password: string };

export const ADMIN_EMAIL = credentials.email;
export const ADMIN_PASSWORD = credentials.password;

export async function login(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'שם משתמש' }).fill(ADMIN_EMAIL);
  await page.getByLabel('סיסמה').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'כניסה' }).click();
  await expect(page.getByRole('heading', { name: 'לוח בקרה' })).toBeVisible();
}
