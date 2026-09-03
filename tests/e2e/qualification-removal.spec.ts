import { expect, test } from '@playwright/test';
import { apiCall, archivePeople, createTestPerson, dataOf, login } from './helpers';

/*
 * A mark could be created here and edited here and never removed, so a typo —
 * or a second copy of something that already existed — stayed on the list for
 * good. That is how the company came to have two marks called קצין מוצב.
 *
 * Every table that points at a mark cascades, so a plain delete would quietly
 * strip it from everyone holding it. The two halves checked here are that it
 * refuses to do that, and that a merge moves the holders across instead of
 * losing them.
 */
interface Mark {
  id: string;
  code: string;
  name: string;
}

test.describe('removing a mark', () => {
  test('refuses while anybody holds it, and carries them across on a merge', async ({
    page,
  }, testInfo) => {
    await login(page);
    const stamp = `${testInfo.project.name}${Date.now().toString(36)}`;

    const make = async (code: string, name: string) => {
      const created = await apiCall(page, '/api/v1/qualifications', 'POST', { code, name });
      expect(created.status, created.body).toBe(200);
      return dataOf<{ id: string }>(created).id;
    };
    const duplicate = await make(`DUP_${stamp}`, `כפול ${stamp}`);
    const survivor = await make(`KEEP_${stamp}`, `נשאר ${stamp}`);
    const person = await createTestPerson(page, 'מחזיק הכשיר', [duplicate]);

    try {
      // A plain delete is refused, and says what stands in the way — the count
      // is the whole reason it refused.
      const refused = await apiCall(page, `/api/v1/qualifications/${duplicate}`, 'DELETE');
      expect(refused.status).toBe(409);
      expect(refused.body).toContain('"heldBy":1');

      const merged = await apiCall(
        page,
        `/api/v1/qualifications/${duplicate}?merge=${survivor}`,
        'DELETE',
      );
      expect(merged.status, merged.body).toBe(200);

      const marks = dataOf<{ qualifications: Mark[] }>(
        await apiCall(page, '/api/v1/qualifications'),
      ).qualifications;
      expect(marks.some((mark) => mark.id === duplicate)).toBe(false);
      expect(marks.some((mark) => mark.id === survivor)).toBe(true);

      // Nobody lost a qualification: they hold the one that stayed.
      const roster = dataOf<{ personnel: { id: string; qualificationIds: string[] }[] }>(
        await apiCall(page, '/api/v1/personnel'),
      ).personnel;
      const holder = roster.find((one) => one.id === person.id);
      expect(holder?.qualificationIds).toContain(survivor);
      expect(holder?.qualificationIds).not.toContain(duplicate);
    } finally {
      await archivePeople(page, [person.id]);
      // Nobody holds the survivor once its only holder is archived away, so
      // the plain delete that was refused above now goes through.
      await apiCall(page, `/api/v1/qualifications/${survivor}?merge=${duplicate}`, 'DELETE');
      await apiCall(page, `/api/v1/qualifications/${survivor}`, 'DELETE');
    }
  });
});
