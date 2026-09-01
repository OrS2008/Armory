import { expect, test, type Page } from '@playwright/test';
import { login } from './helpers';

/*
 * Rearranging the sheet by hand.
 *
 * The page is a fixed three-column layout, and where a post sits on it is a
 * decision somebody makes once and then relies on. Dragging is how they make
 * it, so this checks the whole path: the gesture, the write, and the way back.
 *
 * Desktop only. The gesture is pointer events, which are the same on a phone —
 * what differs is the number of columns, and `sheetColumns` is unit-tested for
 * that. Driving a touch drag through Playwright adds no coverage here.
 */
const order = (page: Page) =>
  page.$$eval('.roster-column', (columns) =>
    columns.map((column) =>
      Array.from(column.querySelectorAll('[data-sheet-card]')).map((card) =>
        card.getAttribute('data-sheet-card'),
      ),
    ),
  );

/** A press, a travel past the threshold, and a release over the target. */
async function dragTo(page: Page, handle: string, target: string) {
  const from = await page.locator(handle).first().boundingBox();
  const to = await page.locator(target).first().boundingBox();
  if (!from || !to) throw new Error('nothing to drag');
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  // The first move only has to clear the threshold that tells a press from a
  // drag; the second is the one that decides where it lands.
  await page.mouse.move(from.x + from.width / 2 + 20, from.y + from.height / 2 + 20, { steps: 5 });
  await page.mouse.move(to.x + to.width / 2, to.y + 6, { steps: 12 });
  await page.mouse.up();
}

test.describe('arranging the duty sheet', () => {
  test('drags a post to another column, and puts it back', async ({ page, isMobile }) => {
    test.skip(isMobile, 'the gesture is the same; the column count is unit-tested');
    await login(page);

    // A day of shifts to arrange. Already laid out is fine — this is about the
    // page, not about what is on it.
    await page.goto('/schedule');
    await page.getByRole('button', { name: 'עוד' }).click();
    await page.getByRole('menuitem', { name: 'פריסת תקופה' }).click();
    const layout = page.locator('dialog[open]');
    const today = new Date().toISOString().slice(0, 10);
    await layout.getByLabel('מתאריך').fill(today);
    await layout.getByLabel('עד תאריך').fill(today);
    await layout.getByRole('button', { name: 'פריסה' }).click();
    await expect(page.getByText(/נוצרו \d+ משמרות|כל המשמרות בתקופה כבר קיימות/)).toBeVisible({
      timeout: 20_000,
    });
    if (await page.locator('dialog[open]').count()) await page.keyboard.press('Escape');

    // The sheet is redrawn from the server once the period lands, so wait for
    // the card rather than for the toast that announced it.
    await expect(page.locator('[data-sheet-card="atp_hamal"]')).toBeVisible({ timeout: 20_000 });
    const before = await order(page);
    expect(before[0]).toContain('atp_hamal');

    await dragTo(
      page,
      '[data-sheet-card="atp_hamal"] .sheet-title',
      '[data-sheet-card="atp_shag"]',
    );
    await expect(page.getByText('סדר הגיליון נשמר')).toBeVisible({ timeout: 15_000 });

    // The sheet redraws from the server, not from the gesture, so the new page
    // arrives a moment after the confirmation does.
    await expect
      .poll(async () => (await order(page))[2]?.[0], { timeout: 15_000 })
      .toBe('atp_hamal');
    expect((await order(page))[0]).not.toContain('atp_hamal');

    // The way back. One level is enough: the next drag is itself the way back
    // from the one before.
    await page.getByRole('button', { name: 'ביטול' }).click();
    await expect(page.getByText('הפעולה בוטלה')).toBeVisible({ timeout: 15_000 });
    await expect
      .poll(async () => (await order(page))[0]?.includes('atp_hamal'), { timeout: 15_000 })
      .toBe(true);
  });
});
