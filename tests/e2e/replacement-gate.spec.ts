import { expect, test } from '@playwright/test';
import { apiCall, archivePeople, createTestPerson, dataOf, login } from './helpers';

/*
 * An approved replacement is a scheduling decision, and it goes through the
 * same gate as any other. Before this it did not: the swap was written
 * unchecked, so an approval could do what the board would have refused — put
 * someone in a מפקד seat they do not hold, or double-book them.
 *
 * Checked at the API rather than the screen, because that is where the
 * guarantee has to live: the approval button is one way in, and a stale tab is
 * another.
 */
interface Shift {
  id: string;
  title: string | null;
  requiredQualifications: { qualificationId: string; minCount: number }[];
  assignees: { personnelId: string; role: string | null }[];
}

test.describe('approving a replacement', () => {
  test('refuses a stand-in who does not hold the seat, and keeps the mark on the one who does', async ({
    page,
  }, testInfo) => {
    await login(page);

    const title = `בדיקת החלפה ${testInfo.project.name}-${Date.now()}`;
    await page.goto('/schedule');
    await page.getByRole('button', { name: 'משימה חדשה' }).click();
    const form = page.locator('dialog[open]');
    await form.getByRole('combobox', { name: 'סוג משימה' }).selectOption({ label: 'עיט' });
    await form.getByRole('textbox', { name: 'שעת התחלה' }).fill('02:00');
    await form.getByText('אפשרויות נוספות').click();
    await form.getByRole('textbox', { name: 'שם המשימה' }).fill(title);
    await form.getByRole('button', { name: 'יצירת משימה' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    const day = await page.evaluate(() => {
      const midnight = new Date();
      midnight.setHours(0, 0, 0, 0);
      return { from: midnight.getTime(), to: midnight.getTime() + 24 * 60 * 60 * 1000 - 1 };
    });
    const window = `/api/v1/assignments?from=${day.from}&to=${day.to}`;
    const read = async () => dataOf<{ assignments: Shift[] }>(await apiCall(page, window));

    const board = await read();
    /*
     * By its own name, not by "the first crewed post on the sheet" — that
     * finds כיתת כוננות, which is stood for twenty-four hours and so exceeds
     * MAX_CONTINUOUS before this test has said anything.
     */
    const shift = board.assignments.find((candidate) => candidate.title === title);
    expect(shift, 'the turn just created should be on the sheet').toBeTruthy();
    if (!shift) return;
    const seat = shift.requiredQualifications.find((item) => item.minCount > 0)?.qualificationId;
    expect(seat).toBeTruthy();
    if (!seat) return;

    /*
     * Three people who exist only for this test: two who hold the seat's mark
     * and one who does not. Picking them off the roster instead makes the test
     * depend on how much of the day earlier specs have already booked.
     */
    const standing = await createTestPerson(page, 'בעל הכשר א', [seat]);
    const standIn = await createTestPerson(page, 'בעל הכשר ב', [seat]);
    const outsider = await createTestPerson(page, 'ללא הכשר');

    try {
      const assigned = await apiCall(page, `/api/v1/assignments/${shift.id}/assign`, 'POST', {
        personnelId: standing.id,
        role: seat,
      });
      expect(assigned.status, assigned.body).toBe(200);

      const requested = await apiCall(page, '/api/v1/replacements', 'POST', {
        assignmentId: shift.id,
        personnelId: standing.id,
        reason: null,
      });
      expect(requested.status, requested.body).toBe(200);
      const requestId = dataOf<{ id: string }>(requested).id;

      // The override reason is in the request precisely to prove it is
      // ignored: a seat's mark is not a rule a reason can buy its way past.
      const refused = await apiCall(page, `/api/v1/replacements/${requestId}`, 'PATCH', {
        status: 'approved',
        replacementPersonnelId: outsider.id,
        overrideReason: 'בכל זאת',
      });
      expect(refused.status).toBe(422);
      expect(refused.body).toContain('אינו מחזיק בהכשיר');

      // Nothing moved: the original is still on the shift and still in the seat.
      const midway = (await read()).assignments.find((one) => one.id === shift.id);
      expect(midway?.assignees.some((one) => one.personnelId === outsider.id) ?? false).toBe(false);
      expect(
        midway?.assignees.some((one) => one.personnelId === standing.id && one.role === seat) ??
          false,
      ).toBe(true);

      // A stand-in who does hold it takes the seat, mark and all.
      const approved = await apiCall(page, `/api/v1/replacements/${requestId}`, 'PATCH', {
        status: 'approved',
        replacementPersonnelId: standIn.id,
      });
      expect(approved.status, approved.body).toBe(200);

      const after = (await read()).assignments.find((one) => one.id === shift.id);
      expect(after?.assignees.some((one) => one.personnelId === standing.id) ?? false).toBe(false);
      expect(
        after?.assignees.some((one) => one.personnelId === standIn.id && one.role === seat) ??
          false,
      ).toBe(true);
    } finally {
      await archivePeople(page, [standing.id, standIn.id, outsider.id]);
    }
  });
});
