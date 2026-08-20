import { expect, test } from '@playwright/test';
import { ADMIN_EMAIL, login } from './helpers';

test.describe('authentication', () => {
  test('renders the login screen right-to-left in Hebrew', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('html')).toHaveAttribute('lang', 'he');
    await expect(page.getByRole('heading', { name: 'כניסה למערכת' })).toBeVisible();
  });

  test('rejects wrong credentials with a Hebrew message', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('textbox', { name: 'דוא״ל' }).fill(ADMIN_EMAIL);
    await page.getByLabel('סיסמה').fill('definitely-not-the-password');
    await page.getByRole('button', { name: 'כניסה' }).click();
    await expect(page.getByRole('alert')).toContainText('שגוי');
  });

  test('sends an unauthenticated visitor to the login screen', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/);
  });

  test('logs in and reaches the dashboard', async ({ page }) => {
    await login(page);
    await expect(page.getByText('זמינים').first()).toBeVisible();
  });
});
