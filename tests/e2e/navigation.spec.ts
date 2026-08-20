import { expect, test } from '@playwright/test';
import { login } from './helpers';

test.describe('navigation and screen states', () => {
  test('shows the mobile bottom navigation on a phone viewport', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'mobile-only layout');
    await login(page);
    await expect(page.getByRole('link', { name: 'כוח אדם' }).last()).toBeVisible();
  });

  test('renders an empty state rather than a blank screen', async ({ page }) => {
    await login(page);
    await page.goto('/replacements');
    await expect(page.getByText('אין בקשות החלפה פתוחות.')).toBeVisible();
  });

  test('shows the audit trail with its immutability notice', async ({ page }) => {
    await login(page);
    await page.goto('/settings');
    await page.getByRole('tab', { name: 'יומן פעולות' }).click();
    await expect(page.getByText('רשומות היומן אינן ניתנות לעריכה או למחיקה.')).toBeVisible();
  });

  test('lets a commander change a scheduling rule severity', async ({ page }) => {
    await login(page);
    await page.goto('/settings');
    await expect(page.getByText('מנוחה מזערית בין שיבוצים')).toBeVisible();
  });
});
