import { expect, test } from '@playwright/test';
import { apiCall, archivePeople, createTestPerson, dataOf, login } from './helpers';

/*
 * "צוות שלם, בלי חריגות בכלל."
 *
 * A post stood by fixed crews is stood by one whole crew. That is checked at
 * the API rather than the screen, because that is where the guarantee has to
 * live: the assign dialog is one way in, a stale tab is another, and a rule
 * somebody switches off in settings must not reach it either.
 */
test.describe('a post stood by fixed crews', () => {
  test('takes one whole crew and refuses everybody else', async ({ page }, testInfo) => {
    await login(page);
    const stamp = `${testInfo.project.name}${Date.now().toString(36)}`;
    const a1 = await createTestPerson(page, 'סבב א ראשון');
    const a2 = await createTestPerson(page, 'סבב א שני');
    const b1 = await createTestPerson(page, 'סבב ב ראשון');
    const outsider = await createTestPerson(page, 'לא בסבב');
    let postId = '';

    try {
      const created = await apiCall(page, '/api/v1/assignment-types', 'POST', {
        name: `בדיקת סבבים ${stamp}`,
        category: 'תורנויות קבועות',
        defaultDurationMinutes: 480,
        requiredHeadcount: 2,
        priority: 5,
        color: 'slate',
      });
      expect(created.status, created.body).toBe(200);
      postId = dataOf<{ id: string }>(created).id;

      const crews = await apiCall(page, `/api/v1/assignment-types/${postId}/crews`, 'PUT', {
        crews: [
          {
            name: 'סבב א׳',
            position: 1,
            members: [{ personnelId: a1.id }, { personnelId: a2.id }],
          },
          { name: 'סבב ב׳', position: 2, members: [{ personnelId: b1.id }] },
        ],
      });
      expect(crews.status, crews.body).toBe(200);

      // Somebody in two crews of one post makes "which crew is this shift" a
      // question with no answer, so it is refused rather than resolved.
      const both = await apiCall(page, `/api/v1/assignment-types/${postId}/crews`, 'PUT', {
        crews: [
          { name: 'סבב א׳', position: 1, members: [{ personnelId: a1.id }] },
          { name: 'סבב ב׳', position: 2, members: [{ personnelId: a1.id }] },
        ],
      });
      expect(both.status).toBe(422);

      const startAt = Date.now() + 5 * 24 * 60 * 60 * 1000;
      const shift = await apiCall(page, '/api/v1/assignments', 'POST', {
        assignmentTypeId: postId,
        startAt,
        endAt: startAt + 8 * 60 * 60 * 1000,
        requiredHeadcount: 2,
      });
      expect(shift.status, shift.body).toBe(200);
      const assignmentId = dataOf<{ ids: string[] }>(shift).ids[0];

      const assign = (personnelId: string, overrideReason?: string) =>
        apiCall(page, `/api/v1/assignments/${assignmentId}/assign`, 'POST', {
          personnelId,
          ...(overrideReason ? { overrideReason } : {}),
        });

      // Nobody outside the crews stands it at all — and the override reason is
      // in the request precisely to prove it is ignored.
      const stranger = await assign(outsider.id, 'בכל זאת');
      expect(stranger.status).toBe(422);
      expect(stranger.body).toContain('אינו חבר באף סבב');

      const first = await assign(a1.id);
      expect(first.status, first.body).toBe(200);

      // One shift is one crew.
      const mixed = await assign(b1.id, 'בכל זאת');
      expect(mixed.status).toBe(422);
      expect(mixed.body).toContain('סבב אחד');

      const second = await assign(a2.id);
      expect(second.status, second.body).toBe(200);

      const board = dataOf<{ assignments: { id: string; assignees: { personnelId: string }[] }[] }>(
        await apiCall(
          page,
          `/api/v1/assignments?from=${startAt - 60_000}&to=${startAt + 9 * 60 * 60 * 1000}`,
        ),
      );
      const stood = board.assignments.find((one) => one.id === assignmentId);
      expect(stood?.assignees.map((one) => one.personnelId).sort()).toEqual([a1.id, a2.id].sort());
    } finally {
      if (postId) {
        await apiCall(page, `/api/v1/assignment-types/${postId}?shifts=delete`, 'DELETE');
      }
      await archivePeople(page, [a1.id, a2.id, b1.id, outsider.id]);
    }
  });
});
