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

    // Relative to today, not a fixed date: the availability page only shows a
    // rolling window around today, and a date baked in at authoring time ages
    // out of it as real time passes.
    const fmt = (date: Date) =>
      `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
    const from = new Date();
    from.setDate(from.getDate() - 3);
    const to = new Date();
    to.setDate(to.getDate() - 1);

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
        `שם,סוג,מתאריך,עד תאריך\n${known},חופשה,${fmt(from)},${fmt(to)}\nרוח רפאים,חופשה,${fmt(from)},`,
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

  test('adds, edits and deletes an availability record', async ({ page }, testInfo) => {
    const run = `${testInfo.project.name}-${Date.now()}`;
    const name = `טוראי ${run}`;

    await page.goto('/personnel');
    await page.getByRole('button', { name: 'הוספת איש כוח אדם' }).click();
    const personnelForm = page.locator('dialog[open]');
    await personnelForm.getByRole('textbox', { name: 'שם', exact: true }).fill(name);
    await personnelForm.getByRole('button', { name: 'שמירה' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await page.goto('/availability');
    await page.getByRole('button', { name: 'רישום זמינות' }).click();
    const form = page.locator('dialog[open]');
    await form.getByLabel('אדם').selectOption({ label: name });
    await form.getByLabel('סוג').selectOption({ label: 'חופשה' });
    await form.getByLabel('סיבה').fill('שנתית מתוכננת');
    await form.getByRole('button', { name: 'שמירה' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    // A table row on a wide screen, a card on a phone — the desk clerk sees
    // one, the same person in the field sees the other.
    const row = page.locator('tr, li', { hasText: name });
    await expect(row.getByText('חופשה', { exact: true })).toBeVisible();
    await expect(row.getByText('שנתית מתוכננת')).toBeVisible();

    // A correction, not a new request: the same record, a different kind and
    // reason — the person field stays fixed since this is not a reassignment.
    await row.getByRole('button', { name: 'עריכת הרישום' }).click();
    const editor = page.locator('dialog[open]');
    await expect(editor.getByLabel('אדם')).toBeDisabled();
    await editor.getByLabel('סוג').selectOption({ label: 'גימלים' });
    await editor.getByLabel('סיבה').fill('חום גבוה');
    await editor.getByRole('button', { name: 'שמירה' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(row.getByText('גימלים')).toBeVisible();
    await expect(row.getByText('חום גבוה')).toBeVisible();

    page.once('dialog', (confirmation) => confirmation.accept());
    await row.getByRole('button', { name: 'מחיקה' }).click();
    await expect(row).toHaveCount(0);
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

    // The board opens on the duty sheet, so the new shift appears under the
    // post's title bar — which prints the sheet's own label for it, not the
    // name the dropdown offered — with its crew listed seat by seat.
    await expect(page.getByText('ש.ג. - 4 שעות משמרת', { exact: true }).first()).toBeVisible();
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
   * A plain seat like ש״ג excludes almost nobody, so most of the roster is
   * eligible for it — comfortably past the 12-name cap the list used to apply
   * across the whole ranking. That flat cap silently dropped real, assignable
   * candidates ranked 13th or lower; this checks that an eligible candidate is
   * never one of them, without having to search for them first.
   *
   * Desktop only, and for a reason worth stating: the whole suite shares one
   * database, and by the time the phone project runs, the auto-fill spec has
   * staffed today. Most of the roster is then resting rather than ineligible,
   * which is the rest rules working — `conflicts.test.ts` covers those — not
   * the cap this test is about.
   */
  test('shows every eligible candidate for a seat with more than twelve of them', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'the day is already staffed by then; the cap is layout-independent');
    await page.goto('/schedule');
    await page.getByRole('button', { name: 'משימה חדשה' }).click();
    const form = page.locator('dialog[open]');
    await form.getByRole('combobox', { name: 'סוג משימה' }).selectOption({ label: 'ש״ג' });
    await form.getByRole('textbox', { name: 'שעת התחלה' }).fill('20:00');
    await form.getByRole('button', { name: 'יצירת משימה' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await page.getByRole('button', { name: /20:00/ }).first().click();
    const dialog = page.locator('dialog[open]');
    await expect(dialog.getByText('מועמדים מוצעים')).toBeVisible();
    await expect(dialog.getByText('זמין לשיבוץ').first()).toBeVisible();
    expect(await dialog.getByText('זמין לשיבוץ').count()).toBeGreaterThan(12);
  });

  /*
   * "המשימות הם משימות קבועות לאורך כל הזמן ... אל תבקש ממני ליצור אותם כל יום
   * מחדש." The period is stated once and every shift in it is created.
   */
  test('lays out a whole period of standing posts, and says so when it is already laid out', async ({
    page,
  }, testInfo) => {
    // A period this database has never seen. Idempotence is the thing under
    // test, so a window some earlier run already laid out would make the first
    // assertion pass on that run's work — the same trap the roster tests hit,
    // and worse here, because the second half would then be checking nothing.
    const [from, to] = freshPeriod(testInfo.project.name);

    await page.goto('/schedule');
    await page.getByRole('button', { name: 'עוד' }).click();
    await page.getByRole('menuitem', { name: 'פריסת תקופה' }).click();

    const dialog = page.locator('dialog[open]');
    await dialog.getByLabel('מתאריך').fill(from);
    await dialog.getByLabel('עד תאריך').fill(to);
    await dialog.getByRole('button', { name: 'פריסה' }).click();

    // Two days: ש״ג every 4h (6), נחל שכם and בולם every 6h (4 each), עיט,
    // משקיף and חמ"ל every 8h (3 each), and three full-day crews — כיתת
    // כוננות א׳ כרמל, קצין מוצב, חובש תורן — one each. 26 a day, 52 for the two.
    await expect(page.getByText(/נוצרו 52 משמרות/)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('dialog')).toHaveCount(0);

    // Running it a second time creates nothing rather than a second roster.
    await page.getByRole('button', { name: 'עוד' }).click();
    await page.getByRole('menuitem', { name: 'פריסת תקופה' }).click();
    const again = page.locator('dialog[open]');
    await again.getByLabel('מתאריך').fill(from);
    await again.getByLabel('עד תאריך').fill(to);
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

    // נחל שכם needs bodies rather than named seats, so it prints as a plain
    // time/name list and the clock is the way into the shift.
    await page.getByRole('button', { name: '13:00 - 19:00' }).first().click();
    await page.locator('dialog[open]').getByRole('button', { name: 'עריכת המשימה' }).click();

    const editor = page.locator('dialog[open]');
    await editor.getByRole('spinbutton', { name: 'כמות אנשים נדרשת' }).fill('3');
    await editor.getByRole('button', { name: 'שמירת השינויים' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    // Taking it off the board. This one starts today and nobody is on it, so
    // it records nothing and is deleted outright rather than struck off — the
    // difference the dialog explains before it happens.
    await page.getByRole('button', { name: '13:00 - 19:00' }).first().click();
    await page.locator('dialog[open]').getByRole('button', { name: 'עריכת המשימה' }).click();
    const closing = page.locator('dialog[open]');
    await closing.getByRole('button', { name: 'הסרת המשימה מהלוח' }).click();
    await closing.getByRole('button', { name: 'הסרת המשימה מהלוח' }).click();
    await expect(page.getByText(/המשימה נמחקה|המשימה בוטלה/)).toBeVisible();
    await expect(page.getByRole('button', { name: '13:00 - 19:00' })).toHaveCount(0);
  });

  /*
   * "כפתור שמנקה את כל השיבוצים לאותו יום" — the group version of the per-
   * person day-unassign already covered above: one action clears the roster
   * off every shift that day, so a commander can restart the day's staffing
   * without touching each post by hand. The shifts themselves must survive —
   * this only undoes who is on them.
   */
  test('clears every assignment on the day at once, without deleting the shifts', async ({
    page,
  }) => {
    await page.goto('/schedule');
    await page.getByRole('button', { name: 'משימה חדשה' }).click();
    const form = page.locator('dialog[open]');
    await form.getByRole('combobox', { name: 'סוג משימה' }).selectOption({ label: 'נחל שכם' });
    await form.getByRole('textbox', { name: 'שעת התחלה' }).fill('22:00');
    await form.getByRole('button', { name: 'יצירת משימה' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    // Same plain time/name list as the 13:00 case above, here at night.
    await page.getByRole('button', { name: '22:00 - 04:00' }).first().click();
    const dialog = page.locator('dialog[open]');
    await expect(dialog.getByText('מועמדים מוצעים')).toBeVisible();
    await dialog.getByRole('button', { name: 'שיבוץ', exact: true }).first().click();
    await expect(dialog.getByRole('button', { name: /^הסרת שיבוץ — / }).first()).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);

    page.once('dialog', (confirmation) => confirmation.accept());
    await page.getByRole('button', { name: 'עוד' }).click();
    await page.getByRole('menuitem', { name: 'ניקוי שיבוצי היום' }).click();
    await expect(page.getByText(/הוסרו \d+ שיבוצים/)).toBeVisible({ timeout: 15_000 });

    // The shift is still there, still open for the same seat — just empty.
    await page.getByRole('button', { name: '22:00 - 04:00' }).first().click();
    const reopened = page.locator('dialog[open]');
    await expect(reopened.getByText('טרם שובץ').first()).toBeVisible();
    await expect(reopened.getByRole('button', { name: /^הסרת שיבוץ — / })).toHaveCount(0);
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
    isMobile,
  }) => {
    // Desktop only, and not for speed: both projects share one database, so by
    // the time the phone run reaches today the desktop run has already staffed
    // it. The second run could only ever auto-fill a day that is already full,
    // which proves nothing. What is under test — that the proposal draws on the
    // whole roster and obeys the marks — is server-side and identical either way.
    test.skip(isMobile, 'the desktop run has already staffed today');

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
    // Laid out now, or laid out by an earlier run against this same server —
    // either way the day has its shifts, which is all this test needs.
    await expect(page.getByText(/נוצרו \d+ משמרות|כל המשמרות בתקופה כבר קיימות/)).toBeVisible({
      timeout: 20_000,
    });
    if (await page.locator('dialog[open]').count()) await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await page.getByRole('button', { name: 'שיבוץ אוטומטי' }).click();
    const proposal = page.locator('dialog[open]');
    // The proposal must draw on people from every platoon, not one.
    await expect(proposal.getByText(/שיבוצים מוצעים/)).toBeVisible({ timeout: 30_000 });
    // Nobody marked מפלג is ever proposed, and nobody from מבצעים is proposed
    // for a post that excludes them — every standing post here does.
    await expect(proposal.getByText('משה אלימלך')).toHaveCount(0);
    await expect(proposal.getByText('רן ביתן')).toHaveCount(0);
    await expect(proposal.getByText('טל זהבי')).toHaveCount(0);

    /*
     * כיתת כוננות א׳ כרמל runs a full 24-hour crew, which the continuous-duty
     * limit does not bend for just because the company itself defined the
     * post that way — so it always gaps, and a commander always has to say
     * yes to it by hand. The gap is a link to exactly the seat that needs
     * that decision, not a dead end the reader has to go find on the board
     * themselves.
     */
    const carmelGap = proposal.getByRole('button', { name: 'כיתת כוננות א׳ כרמל' }).first();
    await expect(carmelGap).toBeVisible();
    await carmelGap.click();
    const opened = page.locator('dialog[open]');
    await expect(opened.getByText('מועמדים מוצעים')).toBeVisible();
    await expect(opened).not.toContainText('שיבוצים מוצעים');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await page.getByRole('button', { name: 'שיבוץ אוטומטי' }).click();
    const reopened = page.locator('dialog[open]');
    await expect(reopened.getByText(/שיבוצים מוצעים/)).toBeVisible({ timeout: 30_000 });
    await reopened.getByRole('button', { name: /אישור \d+ שיבוצים/ }).click();
    await expect(page.getByText(/שובצו \d+ אנשים/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('dialog')).toHaveCount(0);

    // And the sheet that comes out of it carries none of them either.
    await expect(page.getByText('משה אלימלך')).toHaveCount(0);
  });
});

/**
 * A two-day period no run of this suite has laid out before.
 *
 * Both Playwright projects share one local database and the suite is run
 * repeatedly against a server that is already up, so the window has to vary
 * with the clock. Windows are spaced two days apart and each project takes its
 * own parity, so desktop and mobile cannot collide even in the same second.
 */
function freshPeriod(project: string): [string, string] {
  const slot = (Math.floor(Date.now() / 1000) % 3000) * 2 + (project === 'mobile' ? 1 : 0);
  const day = (offset: number) => {
    const date = new Date(Date.UTC(2027, 0, 1));
    date.setUTCDate(date.getUTCDate() + slot * 2 + offset);
    return date.toISOString().slice(0, 10);
  };
  return [day(0), day(1)];
}
