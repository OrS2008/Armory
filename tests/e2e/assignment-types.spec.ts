import { expect, test } from '@playwright/test';
import { login } from './helpers';

/*
 * Retiring and deleting are different acts.
 *
 * A post nobody has used is a mistake, and a mistake should vanish. A post
 * shifts have been created from cannot be deleted at all: assignment_instances
 * points at it without a cascade, so the database refuses — and it is right to,
 * because every shift ever stood there names it. That one is retired instead,
 * which stops it being offered while yesterday's sheet still reads.
 */
test.describe('assignment types', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('retires and restores a post, then deletes it', async ({ page }, testInfo) => {
    // Both projects share one database and the name is unique per organisation.
    const name = `בדיקת סוג ${testInfo.project.name}-${Date.now()}`;

    await page.goto('/assignment-types');
    await page.getByRole('button', { name: 'סוג משימה חדש' }).click();
    const form = page.locator('dialog[open]');
    await form.getByRole('textbox', { name: 'שם המשימה' }).fill(name);
    await form.getByRole('button', { name: 'שמירה' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    const row = page.locator('tr, li').filter({ hasText: name }).first();
    await expect(row).toBeVisible();

    // Retired: still listed, marked, and out of the rotation.
    await row.getByRole('button', { name: `עוד — ${name}` }).click();
    await page.getByRole('menuitem', { name: 'השבתת סוג המשימה' }).click();
    await expect(page.getByText('סוג המשימה הושבת')).toBeVisible();
    await expect(row.getByText('לא פעיל')).toBeVisible();

    await row.getByRole('button', { name: `עוד — ${name}` }).click();
    await page.getByRole('menuitem', { name: 'הפעלה מחדש' }).click();
    await expect(page.getByText('סוג המשימה הופעל מחדש')).toBeVisible();

    // Nothing was ever created from it, so it can really go.
    await row.getByRole('button', { name: `עוד — ${name}` }).click();
    await page.getByRole('menuitem', { name: 'מחיקת סוג המשימה' }).click();
    const confirm = page.locator('dialog[open]');
    await expect(confirm.getByText(name)).toBeVisible();
    await confirm.getByRole('button', { name: 'מחיקת סוג המשימה' }).click();

    await expect(page.getByText('סוג המשימה נמחק')).toBeVisible();
    await expect(page.getByText(name)).toHaveCount(0);
  });

  test('refuses to delete a post that shifts have been created from', async ({ page }) => {
    // Give עיט a day of shifts, so the refusal is about something real.
    await page.goto('/schedule');
    await page.getByRole('button', { name: 'עוד' }).click();
    await page.getByRole('menuitem', { name: 'פריסת תקופה' }).click();
    const layout = page.locator('dialog[open]');
    await layout.getByLabel('מתאריך').fill('2030-05-01');
    await layout.getByLabel('עד תאריך').fill('2030-05-01');
    await layout.getByRole('button', { name: 'פריסה' }).click();
    await expect(page.getByText(/נוצרו \d+ משמרות|כל המשמרות בתקופה כבר קיימות/)).toBeVisible({
      timeout: 20_000,
    });
    if (await page.locator('dialog[open]').count()) await page.keyboard.press('Escape');

    await page.goto('/assignment-types');
    const row = page.locator('tr, li').filter({ hasText: 'עיט' }).first();
    await row.getByRole('button', { name: 'עוד — עיט' }).click();

    // Offered, and it says how many shifts stand behind it rather than leaving
    // the reader to guess. Removing it is allowed — it just takes them with it,
    // which the confirmation states before anything happens.
    const remove = page.getByRole('menuitem', { name: 'מחיקת סוג המשימה' });
    await expect(remove).toBeEnabled();
    await expect(page.getByText(/כבר נוצרו \d+ משמרות מסוג המשימה הזה/)).toBeVisible();

    await remove.click();
    const confirm = page.locator('dialog[open]');
    await expect(confirm.getByText(/יימחק יחד עם \d+ המשמרות שנוצרו ממנו/)).toBeVisible();
    // Saying it once is choosing it; the cost has to be ticked before the
    // button that spends it will do anything.
    await expect(confirm.getByRole('button', { name: 'מחיקת סוג המשימה' })).toBeDisabled();
    await confirm.getByRole('checkbox').check();
    await expect(confirm.getByRole('button', { name: 'מחיקת סוג המשימה' })).toBeEnabled();
    // Not this time: עיט is the post every other spec on this database reads.
    await page.keyboard.press('Escape');
  });
});
