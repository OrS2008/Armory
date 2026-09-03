import { expect, test } from '@playwright/test';
import { apiCall, archivePeople, createTestPerson, dataOf, login } from './helpers';

/*
 * A duty officer walks in with one question — who is at a gate right now — and
 * before this the answer was a column of times to read against the clock.
 */
test.describe('the control board', () => {
  test('names who is on duty at this minute, and when they hand over', async ({
    page,
  }, testInfo) => {
    await login(page);
    const person = await createTestPerson(page, 'תורן בדיקה');
    const title = `משמרת עכשיו ${testInfo.project.name}-${Date.now()}`;

    try {
      /*
       * A turn that began an hour ago. ש״ג runs four hours, so it is still
       * being stood now — which is the only property this screen is about.
       */
      const startedAt = await page.evaluate(() => {
        const hour = new Date();
        hour.setHours(hour.getHours() - 1, 0, 0, 0);
        return `${String(hour.getHours()).padStart(2, '0')}:00`;
      });

      await page.goto('/schedule');
      await page.getByRole('button', { name: 'משימה חדשה' }).click();
      const form = page.locator('dialog[open]');
      await form.getByRole('combobox', { name: 'סוג משימה' }).selectOption({ label: 'ש״ג' });
      await form.getByRole('textbox', { name: 'שעת התחלה' }).fill(startedAt);
      await form.getByText('אפשרויות נוספות').click();
      await form.getByRole('textbox', { name: 'שם המשימה' }).fill(title);
      await form.getByRole('button', { name: 'יצירת משימה' }).click();
      await expect(page.getByRole('dialog')).toHaveCount(0);

      const day = await page.evaluate(() => {
        const midnight = new Date();
        midnight.setHours(0, 0, 0, 0);
        return { from: midnight.getTime(), to: midnight.getTime() + 24 * 60 * 60 * 1000 - 1 };
      });
      const board = dataOf<{
        assignments: { id: string; title: string | null; startAt: number; endAt: number }[];
      }>(await apiCall(page, `/api/v1/assignments?from=${day.from}&to=${day.to}`));
      /*
       * By its own name. Several standing posts run the full day, so anything
       * that merely covers this minute finds one of those — and קצין מוצב is
       * both twenty-four hours long and open to one person only.
       */
      const shift = board.assignments.find((one) => one.title === title);
      expect(shift, 'the turn just created should be in progress').toBeTruthy();
      if (!shift) return;

      const assigned = await apiCall(page, `/api/v1/assignments/${shift.id}/assign`, 'POST', {
        personnelId: person.id,
      });
      expect(assigned.status, assigned.body).toBe(200);

      await page.goto('/dashboard');
      const card = page
        .locator('section')
        .filter({ has: page.getByRole('heading', { name: 'מי בתפקיד עכשיו' }) });
      await expect(card.getByText(person.name)).toBeVisible();
      await expect(card.getByText(/החלפה בעוד/).first()).toBeVisible();
    } finally {
      await archivePeople(page, [person.id]);
    }
  });

  test('says whether the load is spread evenly, not only how much each did', async ({ page }) => {
    await login(page);
    await page.goto('/reports');

    const panel = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: 'מאזן עומסים' }) });
    await expect(panel.getByText('החציון')).toBeVisible();
    await expect(panel.getByText('הפער בין הקצוות')).toBeVisible();
    await expect(panel.getByText('החמישית העליונה')).toBeVisible();

    // Nights are measurable in their own right: that is where an uneven roster
    // is felt first, and a total hides them.
    await panel.getByRole('combobox', { name: 'נמדד לפי' }).selectOption({ label: 'שעות לילה' });
    await expect(panel.getByText('החציון')).toBeVisible();
  });
});
