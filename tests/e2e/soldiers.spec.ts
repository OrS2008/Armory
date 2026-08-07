import { expect, test } from '@playwright/test';
test('opens soldiers, filters and expands a soldier', async ({ page }) => {
  await page.goto('/admin/soldiers');
  await expect(page.getByRole('heading', { name: 'חיילים' })).toBeVisible();
  await page.getByRole('searchbox').fill('אור שמחון');
  await expect(page.getByText('אור שמחון').first()).toBeVisible();
  await page.getByRole('button', { name: /פתיחת פרטי אור שמחון/ }).click();
  await expect(page.getByRole('heading', { name: 'פרטים אישיים' })).toBeVisible();
});
test('mobile page has no horizontal overflow', async ({ page }) => {
  await page.goto('/admin/soldiers');
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
});
