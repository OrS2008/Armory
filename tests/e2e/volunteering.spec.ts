import { expect, test } from '@playwright/test';
import { apiCall, archivePeople, createTestPerson, dataOf, login } from './helpers';

/*
 * A shift short of people is a hole the commander is trying to fill, and
 * somebody free who would take it is the answer — but a soldier had no way of
 * seeing the hole. What has to be right is that the seats offered can actually
 * be taken: offering a shift the roster would then refuse is worse than
 * offering nothing.
 */
test.describe('volunteering for an open seat', () => {
  test('offers only seats the engine would accept, and books one on approval', async ({
    page,
  }, testInfo) => {
    await login(page);
    const person = await createTestPerson(page, 'מתנדב');
    let unlink: (() => Promise<unknown>) | null = null;

    try {
      const types = dataOf<{ assignmentTypes: { id: string; name: string }[] }>(
        await apiCall(page, '/api/v1/assignment-types'),
      ).assignmentTypes;
      const gate = types.find((type) => type.name === 'ש״ג');
      expect(gate, 'the seeded gate post should exist').toBeTruthy();
      if (!gate) return;

      /*
       * Three days out and empty, so it is inside the week this screen looks
       * at and cannot collide with whatever the rest of the suite has done to
       * today.
       */
      const title = `בדיקת התנדבות ${testInfo.project.name}-${Date.now()}`;
      const startAt = Date.now() + 3 * 24 * 60 * 60 * 1000;
      const created = await apiCall(page, '/api/v1/assignments', 'POST', {
        assignmentTypeId: gate.id,
        title,
        startAt,
        endAt: startAt + 4 * 60 * 60 * 1000,
        requiredHeadcount: 1,
      });
      expect(created.status, created.body).toBe(200);
      const assignmentId = dataOf<{ ids: string[] }>(created).ids[0];

      const me = dataOf<{ user: { id: string } }>(await apiCall(page, '/api/v1/auth/me'));
      const linked = await apiCall(page, `/api/v1/users/${me.user.id}`, 'PATCH', {
        personnelId: person.id,
      });
      expect(linked.status, linked.body).toBe(200);
      unlink = () => apiCall(page, `/api/v1/users/${me.user.id}`, 'PATCH', { personnelId: null });

      /*
       * The filter, checked where it lives. This person holds no marks at all,
       * so every seat they are offered must be a plain one — a named seat
       * belongs to its mark here as everywhere.
       */
      const offered = dataOf<{ seats: { assignmentId: string; role: string | null }[] }>(
        await apiCall(page, '/api/v1/me/open-seats'),
      ).seats;
      expect(offered.length, 'a week of standing posts should have holes').toBeGreaterThan(0);
      for (const seat of offered) expect(seat.role).toBeNull();

      // And the same refusal if the offer is made anyway, however it arrives.
      const marks = dataOf<{ qualifications: { id: string; name: string }[] }>(
        await apiCall(page, '/api/v1/qualifications'),
      ).qualifications;
      const driver = marks.find((mark) => mark.name === 'נהג');
      expect(driver).toBeTruthy();
      if (!driver) return;
      const refused = await apiCall(page, '/api/v1/me/volunteer', 'POST', {
        assignmentId,
        role: driver.id,
        note: null,
      });
      expect(refused.status).toBe(422);
      expect(refused.body).toContain('אינו מחזיק בהכשיר');

      /*
       * The list a soldier sees is the nearest openings, and by the time this
       * runs the suite has laid out a fortnight of standing posts — so the
       * offer is made against the shift this test stood up rather than
       * whichever row the screen happens to be showing.
       */
      const made = await apiCall(page, '/api/v1/me/volunteer', 'POST', {
        assignmentId,
        note: null,
      });
      expect(made.status, made.body).toBe(200);

      await page.goto('/me');
      // It appears as mine, which is how a soldier knows the offer was made.
      await expect(
        page
          .locator('section')
          .filter({ has: page.getByRole('heading', { name: 'ההצעות שלי' }) })
          .getByText(title),
      ).toBeVisible();

      // The commander's side: accepting writes the assignment.
      await unlink();
      unlink = null;
      await page.goto('/replacements');
      const offers = page
        .locator('section')
        .filter({ has: page.getByRole('heading', { name: 'מתנדבים למשמרות' }) });
      const offer = offers.locator('li').filter({ hasText: person.name });
      await expect(offer).toHaveCount(1);
      await offer.getByRole('button', { name: 'אישור ושיבוץ' }).click();
      await expect(offer).toHaveCount(0);

      const board = dataOf<{ assignments: { id: string; assignees: { personnelId: string }[] }[] }>(
        await apiCall(
          page,
          `/api/v1/assignments?from=${startAt - 60_000}&to=${startAt + 5 * 60 * 60 * 1000}`,
        ),
      );
      const shift = board.assignments.find((one) => one.id === assignmentId);
      expect(shift?.assignees.some((one) => one.personnelId === person.id) ?? false).toBe(true);
    } finally {
      await unlink?.();
      await archivePeople(page, [person.id]);
    }
  });
});
