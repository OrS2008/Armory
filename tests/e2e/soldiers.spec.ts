import { expect, test } from '@playwright/test';

const authorizeAdmin = async (page: import('@playwright/test').Page) => {
  await page.route('**/api/v2/auth/me', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        user: { id: 'qa-admin', username: 'qa.admin', displayName: 'בודק מערכת', role: 'admin' },
      }),
    }),
  );
  await page.route('**/api/v2/equipment-signatures', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        items: [{
          id: 'qa-signature', soldier_id: 'qa-soldier', full_name: 'אור שמחון', personal_id: '5817533',
          phone: '0520000573', department: 'מפל״ג', status: 'approved', signed_at: Date.now(), approved_at: Date.now(),
          weapon_serial: null, amral_serial: null, scope_serial: null, soldier_note: null,
          signature_object_key: 'pending/signature/11111111-1111-4111-8111-111111111111', licenses: [],
          lines: [{ id: 'line-1', signature_id: 'qa-signature', equipment_item_id: 'helmet', name: 'קסדה', issued_quantity: 1, returned_quantity: 0 }],
        }],
      }),
    }),
  );
};
test('opens soldiers, filters and expands a soldier', async ({ page }) => {
  await authorizeAdmin(page);
  await page.goto('/admin/soldiers');
  await expect(page.getByRole('heading', { name: 'חיילים וציוד אישי' })).toBeVisible();
  await page.getByRole('searchbox').fill('אור שמחון');
  await expect(page.getByText('אור שמחון').first()).toBeVisible();
  await page.getByRole('button', { name: 'פתיחת פרטים' }).click();
  await expect(page.getByRole('heading', { name: 'פרטי החייל' })).toBeVisible();
});
test('mobile page has no horizontal overflow', async ({ page }) => {
  await authorizeAdmin(page);
  await page.goto('/admin/soldiers');
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
});
