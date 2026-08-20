import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

export const ADMIN_EMAIL = 'admin@shabatzak.local';
export const ADMIN_PASSWORD = 'local-dev-password-1234';

export async function login(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'דוא״ל' }).fill(ADMIN_EMAIL);
  await page.getByLabel('סיסמה').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'כניסה' }).click();
  await expect(page.getByRole('heading', { name: 'לוח בקרה' })).toBeVisible();
}
