import { expect, test } from '@playwright/test';
import { login } from './helpers';

test.describe.configure({ mode: 'serial' });

test.describe('scheduling workflow', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('adds a person and finds them in the roster', async ({ page }) => {
    await page.goto('/personnel');
    await page.getByRole('button', { name: 'הוספת איש כוח אדם' }).click();
    // Role + accessible name: getByLabel would also match the decorative
    // required marker inside the <label>.
    await page.getByRole('textbox', { name: 'שם', exact: true }).fill('בדיקה אוטומטית');
    await page.getByRole('textbox', { name: 'מספר אישי' }).fill('9999999');
    await page.getByRole('button', { name: 'שמירה' }).click();
    await expect(page.getByText('בדיקה אוטומטית')).toBeVisible();
  });

  test('imports a roster from pasted CSV without a dead-end button', async ({ page }, testInfo) => {
    // Both projects share one local database, and importing the same names
    // twice is correctly refused as a duplicate — so each run brings its own.
    const first = `רס״ר ${testInfo.project.name}`;
    const second = `סמל ${testInfo.project.name}`;

    await page.goto('/personnel');
    await page.getByRole('button', { name: 'ייבוא מקובץ' }).click();

    // A name column alone is a valid file: everything else is optional.
    await page
      .getByRole('textbox', { name: 'או הדביקו כאן את תוכן הקובץ' })
      .fill(`שם\n${first}\n${second}`);

    // The verification runs on its own, so the import button becomes usable
    // without the reader having to discover a separate step first.
    const importButton = page.getByRole('button', { name: /ייבוא 2 רשומות/ });
    await expect(importButton).toBeEnabled({ timeout: 15_000 });
    await importButton.click();

    await expect(page.getByText(first)).toBeVisible();
    await expect(page.getByText(second)).toBeVisible();
  });

  test('creates an assignment and reports it as understaffed', async ({ page }) => {
    await page.goto('/schedule');
    await page.getByRole('button', { name: 'משימה חדשה' }).click();
    await page.getByRole('combobox', { name: 'סוג משימה' }).selectOption({ label: 'שמירה' });
    await page.getByRole('textbox', { name: 'שעת התחלה' }).fill('08:00');
    await page.getByRole('textbox', { name: 'שעת סיום' }).fill('12:00');
    await page.getByRole('button', { name: 'יצירת משימה' }).click();

    await expect(page.getByRole('button', { name: /שמירה/ }).first()).toBeVisible();
    await page.goto('/schedule/conflicts');
    await expect(page.getByText(/מאוישת ב־0 מתוך/).first()).toBeVisible();
  });

  test('assigns a person from the ranked candidate list', async ({ page }) => {
    await page.goto('/schedule');
    await page.getByRole('button', { name: /שמירה/ }).first().click();
    await expect(page.getByText('מועמדים מוצעים')).toBeVisible();
    await page.getByRole('button', { name: 'שיבוץ', exact: true }).first().click();
    await expect(page.getByRole('button', { name: 'הסרת שיבוץ' }).first()).toBeVisible();
  });
});
