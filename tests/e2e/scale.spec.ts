import { expect, test } from '@playwright/test';
import { login } from './helpers';

/*
 * A fortnight of standing posts is roughly two hundred shifts.
 *
 * D1 refuses a statement carrying more than a hundred bound variables, and the
 * assignee lookup spent one per assignment. Nothing reached that while a
 * fortnight held a handful of shifts; laying out a whole period in one action
 * put the conflicts screen — which loads fourteen days — straight past it, and
 * it answered 500 while the board beside it, loading a single day, was fine.
 *
 * The test is the volume, so it lays the days out first.
 */
test.describe("a period's worth of shifts", () => {
  test('loads the conflicts screen once the fortnight is full', async ({ page, isMobile }) => {
    test.skip(isMobile, 'the desktop run has already laid these days out');
    test.setTimeout(120_000);

    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(
      new Date(),
    );
    const until = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(
      new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
    );

    await login(page);
    await page.goto('/schedule');
    await page.getByRole('button', { name: 'עוד' }).click();
    await page.getByRole('menuitem', { name: 'פריסת תקופה' }).click();
    const layout = page.locator('dialog[open]');
    await layout.getByLabel('מתאריך').fill(today);
    await layout.getByLabel('עד תאריך').fill(until);
    await layout.getByRole('button', { name: 'פריסה' }).click();
    await expect(page.getByText(/נוצרו \d+ משמרות|כל המשמרות בתקופה כבר קיימות/)).toBeVisible({
      timeout: 60_000,
    });
    if (await page.locator('dialog[open]').count()) await page.keyboard.press('Escape');

    // Well past the hundred the statement could carry — and a negative answer
    // is the status code, so an un-chunked build reads as "-500 is not > 100"
    // rather than as a JSON parse error somewhere in the test.
    const loaded = await page.evaluate(async () => {
      const from = Date.now() - 86_400_000;
      const to = from + 15 * 86_400_000;
      const response = await fetch(`/api/v1/assignments?from=${from}&to=${to}`);
      if (!response.ok) return -response.status;
      const body = (await response.json()) as { data: { assignments: unknown[] } };
      return body.data.assignments.length;
    });
    expect(loaded).toBeGreaterThan(100);

    await page.goto('/schedule/conflicts');
    await expect(page.getByRole('heading', { name: 'התנגשויות שיבוץ' })).toBeVisible();
    await expect(page.getByText('לא הצלחנו לטעון את המסך')).toHaveCount(0);
    // The counts on the filter chips only render once the request came back.
    await expect(page.getByRole('tab', { name: /חוסם/ })).toBeVisible();
  });
});
