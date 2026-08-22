import { expect, test } from '@playwright/test';
import { login } from './helpers';

test.describe.configure({ mode: 'serial' });

test.describe('scheduling workflow', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('adds a person and finds them in the roster', async ({ page }, testInfo) => {
    // Both projects share one local database, so a fixed name and personal
    // number make the second project's save a duplicate — and the assertion
    // would then pass on the row the first project left behind.
    const stamp = `${testInfo.project.name}-${Date.now()}`;
    const name = `בדיקה אוטומטית ${stamp}`;
    const externalId = String(Date.now()).slice(-7);

    await page.goto('/personnel');
    await page.getByRole('button', { name: 'הוספת איש כוח אדם' }).click();
    // Role + accessible name: getByLabel would also match the decorative
    // required marker inside the <label>.
    await page.getByRole('textbox', { name: 'שם', exact: true }).fill(name);
    await page.getByRole('textbox', { name: 'מספר אישי' }).fill(externalId);
    await page.getByRole('button', { name: 'שמירה' }).click();

    // The dialog closing is what proves the save went through; the name alone
    // could already be on the screen behind it.
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByText(name)).toBeVisible();
  });

  test('imports a roster from pasted CSV without a dead-end button', async ({ page }, testInfo) => {
    // Both projects share one local database and importing the same name twice
    // is correctly refused as a duplicate, so each run brings its own names —
    // the project alone is not enough when the suite runs twice against a
    // server that is already up.
    const run = `${testInfo.project.name}-${Date.now()}`;
    const first = `רס״ר ${run}`;
    const second = `סמל ${run}`;

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

  test('imports a leave sheet and shows who was skipped', async ({ page }, testInfo) => {
    const run = `${testInfo.project.name}-${Date.now()}`;
    const known = `רס״ל ${run}`;

    // Someone to be absent, plus a name the roster has never heard of.
    await page.goto('/personnel');
    await page.getByRole('button', { name: 'הוספת איש כוח אדם' }).click();
    const form = page.locator('dialog[open]');
    await form.getByRole('textbox', { name: 'שם', exact: true }).fill(known);
    await form.getByRole('button', { name: 'שמירה' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await page.goto('/availability');
    await page.getByRole('button', { name: 'ייבוא מקובץ' }).click();
    const importer = page.locator('dialog[open]');
    await importer
      .getByRole('textbox', { name: 'או הדביקו כאן את תוכן הקובץ' })
      .fill(
        `שם,סוג,מתאריך,עד תאריך\n${known},חופשה,21/08/2026,23/08/2026\nרוח רפאים,חופשה,21/08/2026,`,
      );

    // The dry run explains the unknown name before anything is written.
    await expect(importer.getByText('לא נמצא במאגר כוח האדם')).toBeVisible();
    const importButton = importer.getByRole('button', { name: /ייבוא 1 רשומות/ });
    await expect(importButton).toBeEnabled({ timeout: 15_000 });
    await importButton.click();

    // Scoped to the list: the closed "add availability" dialog also carries the
    // name, in its person picker.
    const list = page.locator('.card').first();
    await expect(list.getByText(known).first()).toBeVisible();
    await expect(list.getByText('חופשה').first()).toBeVisible();
  });

  test('creates an assignment and reports it as understaffed', async ({ page }) => {
    await page.goto('/schedule');
    await page.getByRole('button', { name: 'משימה חדשה' }).click();

    // The type dropdown opens on a prompt, not on a value that reads like a
    // choice, and the form says in words what it is about to create.
    await expect(page.getByRole('combobox', { name: 'סוג משימה' })).toHaveValue('');
    await expect(page.getByText(/בחרו סוג משימה ותאריך/)).toBeVisible();

    await page.getByRole('combobox', { name: 'סוג משימה' }).selectOption({ label: 'שמירה' });
    await page.getByRole('textbox', { name: 'שעת התחלה' }).fill('08:00');
    await expect(page.getByText(/מה ייווצר/)).toBeVisible();

    await page.getByRole('button', { name: 'יצירת משימה' }).click();

    // The board opens on the duty sheet, so the new shift appears under a post
    // title bar with its crew listed seat by seat.
    await expect(page.getByText('שמירה', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('טרם שובץ').first()).toBeVisible();

    await page.goto('/schedule/conflicts');
    await expect(page.getByText(/מאוישת ב־0 מתוך/).first()).toBeVisible();
  });

  test('assigns a person from the ranked candidate list', async ({ page }) => {
    await page.goto('/schedule');
    // The title bar carries the post name, so the shift row is named for the
    // part of day it covers.
    await page.getByRole('button', { name: /בוקר/ }).first().click();
    await expect(page.getByText('מועמדים מוצעים')).toBeVisible();
    await page.getByRole('button', { name: 'שיבוץ', exact: true }).first().click();
    await expect(page.getByRole('button', { name: 'הסרת שיבוץ' }).first()).toBeVisible();
  });
});
