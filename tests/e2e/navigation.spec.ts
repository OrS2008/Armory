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
    await expect(rule.getByRole('spinbutton')).toHaveValue('12');
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

  test('asks which schedule to publish instead of a bare confirm box', async ({ page }) => {
    await login(page);
    await page.goto('/schedule');

    // Publishing is rare, so it lives behind the overflow menu rather than
    // competing with the two buttons used every day.
    await page.getByRole('button', { name: 'עוד' }).click();
    await page.getByRole('menuitem', { name: /פרסום שבצ״ק/ }).click();

    await expect(page.getByRole('heading', { name: 'פרסום שבצ״ק' })).toBeVisible();
    await expect(page.getByText('הפרסום הופך את השבצ״ק לרשמי')).toBeVisible();
  });
});
