import { expect, test } from '@playwright/test';
import { ADMIN_EMAIL, login, loginAs, logout } from './helpers';

test.describe.configure({ mode: 'serial' });

test.describe('user administration', () => {
  test('creates an account, and its owner can sign in and change their password', async ({
    page,
  }, testInfo) => {
    // Unique per run: both projects share one local database.
    const stamp = `${testInfo.project.name}${Date.now()}`.replace(/[^a-z0-9]/gi, '');
    const account = `sgt.${stamp}`.slice(0, 60);
    const firstPassword = 'first-password-1234';
    const secondPassword = 'second-password-5678';

    await login(page);
    await page.goto('/settings');
    await page.getByRole('tab', { name: 'משתמשים' }).click();
    await page.getByRole('button', { name: 'הוספת משתמש' }).click();

    // Closed dialogs stay in the DOM, so every field is addressed inside the
    // one that is actually open.
    const form = page.locator('dialog[open]');
    await form.getByRole('textbox', { name: 'שם משתמש לכניסה' }).fill(account);
    await form.getByRole('textbox', { name: 'שם', exact: true }).fill(`סמל ${stamp}`);
    await form.getByLabel(/^סיסמה/).fill(firstPassword);
    await form.getByLabel('הרשאה').selectOption('unit_scheduler');
    await form.getByRole('button', { name: 'שמירה' }).click();

    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByText(account)).toBeVisible();

    // The administrator cannot switch their own account off; the row does not
    // offer it, and the server refuses it as well.
    const ownRow = page.locator('tr,li').filter({ hasText: ADMIN_EMAIL }).first();
    await expect(ownRow.getByRole('button', { name: 'השבתת חשבון' })).toHaveCount(0);

    await logout(page);
    await loginAs(page, account, firstPassword);
    await expect(page.getByRole('heading', { name: 'לוח בקרה' })).toBeVisible();

    // A scheduler has no business on the users screen, in the tabs or at the API.
    await page.goto('/settings');
    await expect(page.getByRole('tab', { name: 'משתמשים' })).toHaveCount(0);
    const forbidden = await page.evaluate(async () => {
      const response = await fetch('/api/v1/users', { credentials: 'include' });
      return response.status;
    });
    expect(forbidden).toBe(403);

    await page.getByRole('button', { name: 'החשבון שלי' }).click();
    await page.getByRole('menuitem', { name: 'שינוי סיסמה' }).click();
    const passwords = page.locator('dialog[open]');
    await passwords.getByLabel(/^סיסמה נוכחית/).fill(firstPassword);
    await passwords.getByLabel(/^סיסמה חדשה/).fill(secondPassword);
    await passwords.getByLabel(/^אימות סיסמה חדשה/).fill(secondPassword);
    await passwords.getByRole('button', { name: 'שמירה' }).click();
    await expect(page.getByText('הסיסמה שונתה. שאר המכשירים נותקו.')).toBeVisible();

    await logout(page);
    await loginAs(page, account, firstPassword);
    await expect(page.getByText('שם המשתמש או הסיסמה שגויים.')).toBeVisible();

    await loginAs(page, account, secondPassword);
    await expect(page.getByRole('heading', { name: 'לוח בקרה' })).toBeVisible();
  });
});
