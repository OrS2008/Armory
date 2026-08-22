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

    await page.getByRole('combobox', { name: 'סוג משימה' }).selectOption({ label: 'ש״ג' });
    await page.getByRole('textbox', { name: 'שעת התחלה' }).fill('08:00');
    await expect(page.getByText(/מה ייווצר/)).toBeVisible();

    await page.getByRole('button', { name: 'יצירת משימה' }).click();

    // The board opens on the duty sheet, so the new shift appears under a post
    // title bar with its crew listed seat by seat.
    await expect(page.getByText('ש״ג', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('טרם שובץ').first()).toBeVisible();

    await page.goto('/schedule/conflicts');
    await expect(page.getByText(/מאוישת ב־0 מתוך/).first()).toBeVisible();
  });

  test('assigns a person from the ranked candidate list', async ({ page }) => {
    await page.goto('/schedule');
    // A one-seat post prints as a single time line, and the time is the way in.
    await page.getByRole('button', { name: /08:00/ }).first().click();
    await expect(page.getByText('מועמדים מוצעים')).toBeVisible();
    await page.getByRole('button', { name: 'שיבוץ', exact: true }).first().click();
    // The removal control names the person, so a crew of four does not present
    // four identical buttons.
    await expect(page.getByRole('button', { name: /^הסרת שיבוץ — / }).first()).toBeVisible();
  });

  /*
   * "המשימות הם משימות קבועות לאורך כל הזמן ... אל תבקש ממני ליצור אותם כל יום
   * מחדש." The period is stated once and every shift in it is created.
   */
  test('lays out a whole period of standing posts, and says so when it is already laid out', async ({
    page,
  }) => {
    await page.goto('/schedule');
    await page.getByRole('button', { name: 'עוד' }).click();
    await page.getByRole('menuitem', { name: 'פריסת תקופה' }).click();

    const dialog = page.locator('dialog[open]');
    await dialog.getByLabel('מתאריך').fill('2026-09-15');
    await dialog.getByLabel('עד תאריך').fill('2026-09-16');
    await dialog.getByRole('button', { name: 'פריסה' }).click();

    // Two days of four eight-hour posts plus one round-the-clock post.
    await expect(page.getByText(/נוצרו 26 משמרות/)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('dialog')).toHaveCount(0);

    // Running it a second time creates nothing rather than a second roster.
    await page.getByRole('button', { name: 'עוד' }).click();
    await page.getByRole('menuitem', { name: 'פריסת תקופה' }).click();
    const again = page.locator('dialog[open]');
    await again.getByLabel('מתאריך').fill('2026-09-15');
    await again.getByLabel('עד תאריך').fill('2026-09-16');
    await again.getByRole('button', { name: 'פריסה' }).click();
    await expect(page.getByText('כל המשמרות בתקופה כבר קיימות')).toBeVisible({ timeout: 15_000 });
  });

  /*
   * "מי שמוגדר מבצעים או מפקד לא יכול להיות במשימת שג" — and the commander can
   * still say yes, in writing. Both halves matter: a rule nothing can override
   * is a rule the unit will work around outside the system.
   */
  test('refuses מבצעים at the gate, and records the commander who overrides it', async ({
    page,
  }) => {
    await page.goto('/schedule');
    await page.getByRole('button', { name: /08:00/ }).first().click();
    const dialog = page.locator('dialog[open]');

    // The search box is how you reach a specific soldier rather than the top of
    // a ranking: "תן לי אפשרות לחפש את החייל שאני רוצה".
    await dialog.getByRole('searchbox', { name: 'חיפוש חייל ברשימה' }).fill('רן ביתן');
    await expect(dialog.getByText('רן ביתן', { exact: true })).toBeVisible();
    // The list says why, in the same words the sheet would use.
    await expect(dialog.getByText(/מסומן מבצעים/)).toBeVisible();

    // The blocked candidate is offered an override rather than a button that
    // fails: pressing it opens the reason box.
    await dialog.getByRole('button', { name: 'עקיפת החסימה' }).first().click();
    await dialog.getByPlaceholder('נימוק לעקיפה').fill('אין מי שיעמוד בשער');
    await dialog.getByRole('button', { name: 'עקיפת החסימה' }).last().click();

    await expect(page.getByText('השיבוץ בוצע כחריגה מתועדת')).toBeVisible();
    await expect(dialog.getByText('עקיפת החסימה').first()).toBeVisible();
  });

  test('edits a shift and calls it off', async ({ page }) => {
    await page.goto('/schedule');
    await page.getByRole('button', { name: 'משימה חדשה' }).click();
    const form = page.locator('dialog[open]');
    await form.getByRole('combobox', { name: 'סוג משימה' }).selectOption({ label: 'נחל שכם' });
    await form.getByRole('textbox', { name: 'שעת התחלה' }).fill('13:00');
    await form.getByRole('button', { name: 'יצירת משימה' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    // A two-seat post prints a crew, so its row is named for the part of day.
    await page
      .getByRole('button', { name: /צהריים/ })
      .first()
      .click();
    await page.locator('dialog[open]').getByRole('button', { name: 'עריכת המשימה' }).click();

    const editor = page.locator('dialog[open]');
    await editor.getByRole('spinbutton', { name: 'כמות אנשים נדרשת' }).fill('3');
    await editor.getByRole('button', { name: 'שמירת השינויים' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    // Calling it off takes it off the board without deleting what happened.
    await page
      .getByRole('button', { name: /צהריים/ })
      .first()
      .click();
    await page.locator('dialog[open]').getByRole('button', { name: 'עריכת המשימה' }).click();
    const closing = page.locator('dialog[open]');
    await closing.getByRole('button', { name: 'ביטול המשימה' }).click();
    await closing.getByRole('button', { name: 'ביטול המשימה' }).click();
    await expect(page.getByText('המשימה בוטלה')).toBeVisible();
  });

  /*
   * "נראה שהשיבוץ אוטומטי לא באמת מסתכל על רשימת כוח אדם ועל ההכשירים שלהם."
   *
   * It does now, and this is what proves it: a real day of standing posts,
   * filled automatically, must not put anybody marked מבצעים on a patrol or
   * anybody marked מפלג anywhere at all — and it must find the whole roster,
   * not just the platoon the post happens to belong to.
   */
  test('auto-fills a laid-out day from the whole roster, and honours the marks', async ({
    page,
  }) => {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(
      new Date(),
    );

    await page.goto('/schedule');
    await page.getByRole('button', { name: 'עוד' }).click();
    await page.getByRole('menuitem', { name: 'פריסת תקופה' }).click();
    const layout = page.locator('dialog[open]');
    await layout.getByLabel('מתאריך').fill(today);
    await layout.getByLabel('עד תאריך').fill(today);
    await layout.getByRole('button', { name: 'פריסה' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 20_000 });

    await page.getByRole('button', { name: 'שיבוץ אוטומטי' }).click();
    const proposal = page.locator('dialog[open]');
    // The proposal must draw on people from every platoon, not one.
    await expect(proposal.getByText(/שיבוצים מוצעים/)).toBeVisible({ timeout: 30_000 });
    // Nobody marked מפלג is ever proposed, and nobody from מבצעים is proposed
    // for a post that excludes them — every standing post here does.
    await expect(proposal.getByText('משה אלימלך')).toHaveCount(0);
    await expect(proposal.getByText('רן ביתן')).toHaveCount(0);
    await expect(proposal.getByText('טל זהבי')).toHaveCount(0);

    await proposal.getByRole('button', { name: /אישור \d+ שיבוצים/ }).click();
    await expect(page.getByText(/שובצו \d+ אנשים/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('dialog')).toHaveCount(0);

    // And the sheet that comes out of it carries none of them either.
    await expect(page.getByText('משה אלימלך')).toHaveCount(0);
  });
});
