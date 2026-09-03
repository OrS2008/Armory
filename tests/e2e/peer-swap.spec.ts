import { expect, test } from '@playwright/test';
import { apiCall, archivePeople, createTestPerson, dataOf, login } from './helpers';

/*
 * Finding your own cover is the arrangement that already happens — in the group
 * chat, where nothing checks it and nothing records it. Bringing it here means
 * checking it and recording it, and the two things that has to get right are
 * the ones a chat cannot: that the roster would actually accept the person
 * being asked, and that only that person can answer for themselves.
 */
interface Shift {
  id: string;
  title: string | null;
  requiredQualifications: { qualificationId: string; minCount: number }[];
}
interface Request {
  id: string;
  replacementPersonnelId: string | null;
  status: string;
  acceptedAt: number | null;
}

test.describe('finding your own cover', () => {
  test('checks the stand-in before filing it, and lets only them answer', async ({
    page,
  }, testInfo) => {
    await login(page);

    const title = `בדיקת חילופים ${testInfo.project.name}-${Date.now()}`;
    await page.goto('/schedule');
    await page.getByRole('button', { name: 'משימה חדשה' }).click();
    const form = page.locator('dialog[open]');
    await form.getByRole('combobox', { name: 'סוג משימה' }).selectOption({ label: 'עיט' });
    await form.getByRole('textbox', { name: 'שעת התחלה' }).fill('01:00');
    await form.getByText('אפשרויות נוספות').click();
    await form.getByRole('textbox', { name: 'שם המשימה' }).fill(title);
    await form.getByRole('button', { name: 'יצירת משימה' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    const day = await page.evaluate(() => {
      const midnight = new Date();
      midnight.setHours(0, 0, 0, 0);
      return { from: midnight.getTime(), to: midnight.getTime() + 24 * 60 * 60 * 1000 - 1 };
    });
    const board = dataOf<{ assignments: Shift[] }>(
      await apiCall(page, `/api/v1/assignments?from=${day.from}&to=${day.to}`),
    );
    const shift = board.assignments.find((one) => one.title === title);
    expect(shift, 'the turn just created should be on the sheet').toBeTruthy();
    if (!shift) return;
    const seat = shift.requiredQualifications.find((item) => item.minCount > 0)?.qualificationId;
    expect(seat).toBeTruthy();
    if (!seat) return;

    const standing = await createTestPerson(page, 'מבקש החלפה', [seat]);
    const standIn = await createTestPerson(page, 'מחליף מוסמך', [seat]);
    const outsider = await createTestPerson(page, 'מחליף ללא הכשר');
    let unlink: (() => Promise<unknown>) | null = null;

    try {
      const assigned = await apiCall(page, `/api/v1/assignments/${shift.id}/assign`, 'POST', {
        personnelId: standing.id,
        role: seat,
      });
      expect(assigned.status, assigned.body).toBe(200);

      const me = dataOf<{ user: { id: string } }>(await apiCall(page, '/api/v1/auth/me'));
      const linkTo = async (personnelId: string | null) => {
        const patched = await apiCall(page, `/api/v1/users/${me.user.id}`, 'PATCH', {
          personnelId,
        });
        expect(patched.status, patched.body).toBe(200);
      };
      // The suite shares one database, so the account goes back to standing
      // for nobody however this test ends.
      unlink = () => apiCall(page, `/api/v1/users/${me.user.id}`, 'PATCH', { personnelId: null });
      await linkTo(standing.id);

      /*
       * The list a soldier is offered holds only people who could actually
       * take the shift — which is the part the group chat cannot do.
       */
      await page.goto('/me');
      const row = page.locator('li').filter({ hasText: title });
      await row.getByRole('button', { name: 'בקשת החלפה' }).click();
      const dialog = page.locator('dialog[open]');
      const picker = dialog.getByRole('combobox', { name: 'מי יחליף אותך' });
      await expect(picker.getByRole('option', { name: standIn.name })).toHaveCount(1);
      await expect(picker.getByRole('option', { name: outsider.name })).toHaveCount(0);
      await dialog.getByRole('button', { name: 'ביטול' }).click();
      await expect(page.getByRole('dialog')).toHaveCount(0);

      // Refused now rather than at approval: nobody should spend an evening
      // arranging cover the roster was never going to take.
      const badProposal = await apiCall(page, '/api/v1/replacements', 'POST', {
        assignmentId: shift.id,
        personnelId: standing.id,
        reason: null,
        replacementPersonnelId: outsider.id,
      });
      expect(badProposal.status).toBe(422);
      expect(badProposal.body).toContain('אינו מחזיק בהכשיר');

      const proposal = await apiCall(page, '/api/v1/replacements', 'POST', {
        assignmentId: shift.id,
        personnelId: standing.id,
        reason: 'בדיקה',
        replacementPersonnelId: standIn.id,
      });
      expect(proposal.status, proposal.body).toBe(200);
      const requestId = dataOf<{ id: string; status: string }>(proposal).id;
      expect(dataOf<{ status: string }>(proposal).status).toBe('proposed');

      /*
       * Still signed in as the person who asked — who has every permission
       * there is, and still may not answer on the stand-in's behalf. Consent
       * is not a permission.
       */
      const notYours = await apiCall(page, `/api/v1/replacements/${requestId}/respond`, 'POST', {
        accept: true,
      });
      expect(notYours.status).toBe(403);

      await linkTo(standIn.id);
      const agreed = await apiCall(page, `/api/v1/replacements/${requestId}/respond`, 'POST', {
        accept: true,
      });
      expect(agreed.status, agreed.body).toBe(200);

      const listed = dataOf<{ replacements: Request[] }>(
        await apiCall(page, '/api/v1/replacements?status=proposed'),
      ).replacements.find((one) => one.id === requestId);
      expect(listed?.acceptedAt, 'the answer should be on the record').toBeTruthy();

      // Agreeing settles the arrangement; it does not approve it.
      expect(listed?.status).toBe('proposed');

      /*
       * And the person who asked can withdraw it. Plans change, and a request
       * that can only be closed by a commander stands until somebody notices.
       */
      await linkTo(standing.id);
      const withdrawn = await apiCall(page, `/api/v1/replacements/${requestId}`, 'PATCH', {
        status: 'cancelled',
      });
      expect(withdrawn.status, withdrawn.body).toBe(200);
      const stillOpen = dataOf<{ replacements: Request[] }>(
        await apiCall(page, '/api/v1/replacements?status=open'),
      ).replacements.some((one) => one.id === requestId);
      expect(stillOpen).toBe(false);
    } finally {
      await unlink?.();
      await archivePeople(page, [standing.id, standIn.id, outsider.id]);
    }
  });
});
