import { expect, test, type Page } from '@playwright/test';
import { login } from './helpers';

/*
 * The card's title bar, and what opening it lets you do.
 *
 * The bar names the post, and pressing it is how somebody says "this one" —
 * about the post rather than about one of its turns. Two acts live behind it
 * and they are not the same act: clearing today's turns leaves the post
 * standing for tomorrow, while removing the post takes every turn with it.
 *
 * Each test stands up its own post and its own shift. The suite shares one
 * database, and a test that removed a post the roster actually runs would be
 * testing this feature by breaking every spec after it.
 */
const today = () => new Date().toISOString().slice(0, 10);

/** A post nobody else reads, and one shift of it on today's sheet. */
async function standUpPost(page: Page, name: string) {
  await page.goto('/assignment-types');
  await page.getByRole('button', { name: 'סוג משימה חדש' }).click();
  const form = page.locator('dialog[open]');
  await form.getByRole('textbox', { name: 'שם המשימה' }).fill(name);
  await form.getByRole('button', { name: 'שמירה' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await page.goto('/schedule');
  await page.getByRole('button', { name: 'משימה חדשה' }).click();
  const shift = page.locator('dialog[open]');
  await shift.getByLabel('סוג משימה').selectOption({ label: name });
  await shift.getByLabel('תאריך').fill(today());
  await shift.getByRole('button', { name: 'יצירת משימה' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  const card = page.locator('table.roster-card').filter({ hasText: name }).first();
  await expect(card).toBeVisible({ timeout: 15_000 });
  return card;
}

test.describe('a post, from its card', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('takes the day off the board and leaves the post standing', async ({ page }, testInfo) => {
    const name = `בדיקת כרטיס ${testInfo.project.name}-${Date.now()}`;
    const card = await standUpPost(page, name);

    await card.getByRole('button', { name }).click();
    const dialog = page.locator('dialog[open]');
    await expect(dialog.getByText('1 משמרות בתאריך המוצג')).toBeVisible();

    await dialog.getByRole('button', { name: /משמרות היום מהלוח/ }).click();
    await dialog.getByRole('button', { name: /משמרות היום מהלוח/ }).click();
    await expect(page.getByText(/ירדו מהלוח: \d+ נמחקו, \d+ בוטלו/)).toBeVisible({
      timeout: 15_000,
    });

    // The turn is gone from the sheet; the post it was stood from is not.
    await expect(page.locator('table.roster-card').filter({ hasText: name })).toHaveCount(0);
    await page.goto('/assignment-types');
    await expect(page.getByText(name).first()).toBeVisible();
  });

  test('removes the post itself, with the shifts behind it', async ({ page }, testInfo) => {
    const name = `בדיקת מחיקה ${testInfo.project.name}-${Date.now()}`;
    const card = await standUpPost(page, name);

    await card.getByRole('button', { name }).click();
    const dialog = page.locator('dialog[open]');
    await dialog.getByRole('button', { name: 'מחיקת המשימה מכל הימים' }).click();

    // Saying it once is choosing it; the shifts it costs have to be ticked.
    const confirm = dialog.getByRole('button', { name: 'מחיקת סוג המשימה' });
    await expect(confirm).toBeDisabled();
    await dialog.getByRole('checkbox').check();
    await confirm.click();

    await expect(page.getByText(/סוג המשימה נמחק/)).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('table.roster-card').filter({ hasText: name })).toHaveCount(0);
    await page.goto('/assignment-types');
    await expect(page.getByText(name)).toHaveCount(0);
  });
});
