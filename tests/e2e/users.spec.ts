import { expect, test } from '@playwright/test';
import { totpAt } from '../../shared/totp';
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

test.describe('two-factor authentication', () => {
  test('enrols, then asks for a code at the next login, and takes a recovery code', async ({
    page,
  }, testInfo) => {
    const stamp = `${testInfo.project.name}${Date.now()}`.replace(/[^a-z0-9]/gi, '');
    const account = `mfa.${stamp}`.slice(0, 60);
    const password = 'second-factor-1234';

    // Created through the API: this test is about the factor, not the form.
    await login(page);
    const created = await page.evaluate(
      async ([email, secret]) => {
        const response = await fetch('/api/v1/users', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email,
            displayName: `רב״ט ${email}`,
            password: secret,
            role: 'unit_scheduler',
          }),
        });
        return response.status;
      },
      [account, password],
    );
    expect(created).toBe(200);

    await logout(page);
    await loginAs(page, account, password);
    await expect(page.getByRole('heading', { name: 'לוח בקרה' })).toBeVisible();

    // Enrol.
    await page.getByRole('button', { name: 'החשבון שלי' }).click();
    await page.getByRole('menuitem', { name: 'אימות דו־שלבי' }).click();
    const dialog = page.locator('dialog[open]');
    await dialog.getByRole('button', { name: 'הפעלת אימות דו־שלבי' }).click();

    const secret = (await dialog.getByLabel('מפתח להזנה ידנית').inputValue()).replace(/\s/g, '');
    expect(secret.length).toBeGreaterThan(15);
    await dialog.getByLabel('קוד אימות').fill(await totpAt(secret, Math.floor(Date.now() / 30000)));
    await dialog.getByRole('button', { name: 'אישור' }).click();

    await expect(dialog.getByText('קודי שחזור')).toBeVisible();
    const codes = await dialog.locator('li').allInnerTexts();
    expect(codes.length).toBeGreaterThanOrEqual(10);
    await dialog.getByRole('button', { name: 'סגירה' }).click();

    // The next login stops at the code.
    await logout(page);
    await loginAs(page, account, password);
    await expect(page.getByText('הזינו את הקוד מאפליקציית האימות, או קוד שחזור.')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'לוח בקרה' })).toHaveCount(0);

    await page.getByLabel('קוד אימות').fill('000000');
    await page.getByRole('button', { name: 'אישור' }).click();
    await expect(page.getByText('הקוד שגוי או שפג תוקפו. נסו קוד חדש מהאפליקציה.')).toBeVisible();

    await page.getByLabel('קוד אימות').fill(await totpAt(secret, Math.floor(Date.now() / 30000)));
    await page.getByRole('button', { name: 'אישור' }).click();
    await expect(page.getByRole('heading', { name: 'לוח בקרה' })).toBeVisible();

    // And a recovery code works when the phone does not.
    await logout(page);
    await loginAs(page, account, password);
    await page.getByLabel('קוד אימות').fill(codes[0]);
    await page.getByRole('button', { name: 'אישור' }).click();
    await expect(page.getByRole('heading', { name: 'לוח בקרה' })).toBeVisible();

    // Each recovery code is spent on use.
    await logout(page);
    await loginAs(page, account, password);
    await page.getByLabel('קוד אימות').fill(codes[0]);
    await page.getByRole('button', { name: 'אישור' }).click();
    await expect(page.getByText('הקוד שגוי או שפג תוקפו. נסו קוד חדש מהאפליקציה.')).toBeVisible();
  });
});
