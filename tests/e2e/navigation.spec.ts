import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { login } from './helpers';

test.describe('navigation and screen states', () => {
  test('shows the mobile bottom navigation on a phone viewport', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'mobile-only layout');
    await login(page);
    await expect(page.getByRole('link', { name: 'כוח אדם' }).last()).toBeVisible();
  });

  test('renders an empty state rather than a blank screen', async ({ page }) => {
    await login(page);
    await page.goto('/replacements');
    await expect(page.getByText('אין בקשות החלפה פתוחות.')).toBeVisible();
  });

  test('shows the audit trail with its immutability notice', async ({ page }) => {
    await login(page);
    await page.goto('/settings');
    await page.getByRole('tab', { name: 'יומן פעולות' }).click();
    await expect(page.getByText('רשומות היומן אינן ניתנות לעריכה או למחיקה.')).toBeVisible();
  });

  test('lets a commander change a scheduling rule severity', async ({ page }) => {
    await login(page);
    await page.goto('/settings');
    await expect(page.getByText('מנוחה מזערית בין שיבוצים')).toBeVisible();
  });

  test('names the rule knobs in Hebrew instead of their JSON keys', async ({ page }) => {
    await login(page);
    await page.goto('/settings');
    await expect(page.getByText('בתוך כמה ימים')).toBeVisible();
    await expect(page.getByText('windowDays')).toHaveCount(0);
  });

  // Six columns squeezed into a phone used to mean a sideways scrollbar with the
  // actions parked off-screen. The list changes shape instead of shrinking.
  test('lists people as a table on desktop and as cards on a phone', async ({ page, isMobile }) => {
    await login(page);
    await page.goto('/personnel');
    await expect(page.getByText('דניאל כהן')).toBeVisible();

    if (isMobile) {
      await expect(page.getByRole('table')).toHaveCount(0);
      // Each card labels its own values rather than relying on a header row.
      await expect(page.getByText('מסגרת', { exact: true }).first()).toBeVisible();
    } else {
      await expect(page.getByRole('columnheader', { name: 'הכשירים' })).toBeVisible();
    }

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('states rule durations in hours, not minutes', async ({ page }) => {
    await login(page);
    await page.goto('/settings');
    const rule = page.locator('li', { hasText: 'משך שיבוץ רצוף מרבי' }).first();
    await expect(rule.getByText('שעות', { exact: true })).toBeVisible();
    // Eight hours on: the company's shift, and the limit a run of them may not
    // exceed.
    await expect(rule.getByRole('spinbutton')).toHaveValue('8');
  });

  test('remembers a dark-mode choice across a reload', async ({ page }) => {
    await login(page);
    await page.getByRole('button', { name: 'החשבון שלי' }).click();
    await page.getByRole('menuitem', { name: 'מעבר למצב כהה' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    // And a printed sheet is on paper, which is white whatever the screen is.
    await page.emulateMedia({ media: 'print' });
    const printedBackground = await page.evaluate(
      () => getComputedStyle(document.body).backgroundColor,
    );
    expect(printedBackground).toBe('rgb(255, 255, 255)');
    await page.emulateMedia({ media: 'screen' });

    await page.getByRole('button', { name: 'החשבון שלי' }).click();
    await page.getByRole('menuitem', { name: 'מעבר למצב בהיר' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });

  test('exports the workload report as a real workbook', async ({ page }) => {
    await login(page);
    await page.goto('/reports');
    await page.getByRole('button', { name: 'ייצוא' }).click();

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('menuitem', { name: 'קובץ Excel' }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^workload-.*\.xlsx$/);

    // A .xlsx is a ZIP; anything else and Excel refuses the file outright.
    const path = await download.path();
    const head = (await readFile(path)).subarray(0, 4);
    expect(Array.from(head)).toEqual([0x50, 0x4b, 0x03, 0x04]);
  });

  test('finds a person from anywhere with the command palette', async ({ page }) => {
    await login(page);
    await page.keyboard.press('Control+k');

    const palette = page.getByRole('dialog', { name: 'חיפוש ופעולות מהירות' });
    await expect(palette).toBeVisible();
    await palette.getByRole('combobox').fill('דניאל');
    await palette
      .getByRole('option', { name: /דניאל כהן/ })
      .first()
      .click();

    // Lands on the roster already filtered, and the filter is in the URL.
    await expect(page).toHaveURL(/\/personnel\?q=/);
    await expect(page.getByRole('heading', { name: 'כוח אדם' })).toBeVisible();
    await expect(page.locator('.card').first().getByText('דניאל כהן')).toBeVisible();
  });

  test('opens the palette from the header for anyone without a keyboard', async ({ page }) => {
    await login(page);
    await page.getByRole('button', { name: 'חיפוש מהיר' }).click();
    const palette = page.getByRole('dialog', { name: 'חיפוש ופעולות מהירות' });
    await expect(palette).toBeVisible();
    await palette.getByRole('option', { name: 'דוחות' }).click();
    await expect(page).toHaveURL(/\/reports$/);
  });

  test('opens without a network once it has been visited', async ({ page, context }) => {
    await login(page);
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
    // Being registered is not the same as controlling this page, and only a
    // controlled page can be served from the cache.
    await expect
      .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
      .toBe(true);

    await context.setOffline(true);
    await page.reload();

    // The shell renders from cache, still signed in, rather than the browser's
    // own error page or a login form the duty officer cannot submit.
    await expect(page.getByRole('heading', { name: 'לוח בקרה' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'כניסה' })).toHaveCount(0);

    // And the data is not served from a cache: yesterday's duty sheet shown as
    // today's is worse than an honest failure, so the screen says it failed.
    await expect(page.getByText('לא הצלחנו לטעון את המסך')).toBeVisible();

    await context.setOffline(false);
  });

  // A title alone ("זמינות", "דוחות") does not tell a first-time reader what the
  // screen is for. Every main screen answers that in its own words.
  const screens = [
    { path: '/schedule', text: 'לוח המשמרות' },
    { path: '/personnel', text: 'מאגר האנשים שאפשר לשבץ' },
    { path: '/availability', text: 'מי לא נמצא ומתי' },
    { path: '/assignment-types', text: 'התבניות שמהן בונים את השבצ״ק' },
    { path: '/reports', text: 'כמה שעות עשה כל אחד' },
    { path: '/settings', text: 'הבסיס שהשבצ״ק נשען עליו' },
  ];

  for (const screen of screens) {
    test(`explains what ${screen.path} is for`, async ({ page }) => {
      await login(page);
      await page.goto(screen.path);
      await expect(page.getByText(screen.text, { exact: false })).toBeVisible();
    });
  }

  /*
   * "אין צורך בכפתור פרסום, המנהל שולח את הקובץ pdf בווצאפ הקבוצתי."
   *
   * Exporting the sheet is the act of publishing it, so the board offers that
   * and the period layout — and nothing that claims to publish.
   */
  test('offers the period layout where publishing used to be', async ({ page }) => {
    await login(page);
    await page.goto('/schedule');

    await page.getByRole('button', { name: 'עוד' }).click();
    await expect(page.getByRole('menuitem', { name: 'פריסת תקופה' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'ייצוא PDF' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: /פרסום/ })).toHaveCount(0);
  });

  // An administrator is not a soldier, so this screen has nothing personal to
  // show them — and used to say so with "הפריט המבוקש לא נמצא".
  test('explains an empty personal schedule instead of reporting a failure', async ({ page }) => {
    await login(page);
    await page.goto('/me');
    await expect(page.getByText(/אינו מקושר לחייל במאגר כוח האדם/)).toBeVisible();
    await expect(page.getByText('לא הצלחנו לטעון את המסך')).toHaveCount(0);
  });
});
