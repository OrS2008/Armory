import { expect, test } from '@playwright/test';
import { login } from './helpers';

/*
 * "רק מי שיש לו הכשר נהג יכול להיות נהג. אין מצב שאתה מערבב לי את זה."
 *
 * A named seat belongs to its mark. That is checked on both sides here,
 * because they fail differently: the screen can only offer the right people,
 * and the API has to refuse the wrong ones however the request reached it — a
 * stale page, a second tab, a rule somebody switched off in settings.
 */
const DRIVERS = ['יוסי אברהם', 'רועי חדד', 'גיא סלע', 'איתי בר', 'בר אדרי'];
/** Holds מפקד and nothing else, so he may command and may not drive. */
const COMMANDER_ONLY = 'אורי פלד';

test.describe('who may fill a named seat', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('offers a named seat only to the people who hold its mark', async ({ page }, testInfo) => {
    /*
     * A crewed shift of its own, under a name nothing else uses. A crewed card
     * prints its turns by their place in the post's day — עיט בוקר, עיט ערב —
     * so a second shift of the same post renames the first, and a test that
     * found its own by the day-part would find a different one on the next run.
     */
    const title = `בדיקת מושב ${testInfo.project.name}-${Date.now()}`;
    await page.goto('/schedule');
    await page.getByRole('button', { name: 'משימה חדשה' }).click();
    const form = page.locator('dialog[open]');
    await form.getByRole('combobox', { name: 'סוג משימה' }).selectOption({ label: 'עיט' });
    await form.getByRole('textbox', { name: 'שעת התחלה' }).fill('03:00');
    await form.getByText('אפשרויות נוספות').click();
    await form.getByRole('textbox', { name: 'שם המשימה' }).fill(title);
    await form.getByRole('button', { name: 'יצירת משימה' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await page.getByRole('button', { name: title }).click();
    const dialog = page.locator('dialog[open]');
    await expect(dialog.getByText('מועמדים מוצעים')).toBeVisible();

    await dialog.getByRole('combobox').first().selectOption({ label: 'נהג' });
    await expect(dialog.getByText('רק מי שמחזיק בהכשיר נהג מוצג כאן.')).toBeVisible();

    // Search reaches the whole roster, so a name missing from the list is
    // missing because he may not stand the seat, not because it is capped.
    await dialog.getByRole('searchbox').fill(COMMANDER_ONLY);
    await expect(dialog.getByText(COMMANDER_ONLY)).toHaveCount(0);

    await dialog.getByRole('searchbox').fill('');
    // The candidate list by name: the dialog also lists the crew and the
    // conflicts, and reading those as candidates is how this first went wrong.
    const listed = await dialog.locator('[data-candidate-name]').allInnerTexts();
    expect(listed.length).toBeGreaterThan(0);
    for (const person of listed) expect(DRIVERS).toContain(person.trim());
  });

  test('refuses the assignment at the API, whatever the screen sent', async ({ page }) => {
    /*
     * Straight at the endpoint with the signed-in session — which is what a
     * stale tab, a second window, or a rule somebody switched off in settings
     * amounts to. The screen is not the guarantee; this is.
     */
    interface Seat {
      qualificationId: string;
      minCount: number;
    }
    interface Shift {
      id: string;
      requiredQualifications: Seat[];
      assignees: { personnelId: string }[];
    }
    interface Person {
      id: string;
      status: string;
      qualificationIds: string[];
    }

    // Its own crewed shift, so the test does not depend on what the sheet
    // happens to be carrying by the time it runs.
    await page.goto('/schedule');
    await page.getByRole('button', { name: 'משימה חדשה' }).click();
    const form = page.locator('dialog[open]');
    await form.getByRole('combobox', { name: 'סוג משימה' }).selectOption({ label: 'עיט' });
    await form.getByRole('textbox', { name: 'שעת התחלה' }).fill('04:00');
    await form.getByRole('button', { name: 'יצירת משימה' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    const read = <T>(path: string) =>
      page.evaluate<T, string>(async (url) => {
        const response = await fetch(url);
        return (await response.json()) as T;
      }, path);

    const day = await page.evaluate(() => {
      const midnight = new Date();
      midnight.setHours(0, 0, 0, 0);
      return { from: midnight.getTime(), to: midnight.getTime() + 24 * 60 * 60 * 1000 - 1 };
    });
    const board = await read<{ data: { assignments: Shift[] } }>(
      `/api/v1/assignments?from=${day.from}&to=${day.to}`,
    );
    const crewed = board.data.assignments.find((shift) =>
      shift.requiredQualifications.some((item) => item.minCount > 0),
    );
    expect(crewed, 'the sheet should carry a crewed post').toBeTruthy();
    if (!crewed) return;
    const seat = crewed.requiredQualifications.find((item) => item.minCount > 0)?.qualificationId;
    expect(seat).toBeTruthy();
    if (!seat) return;

    const roster = await read<{ data: { personnel: Person[] } }>('/api/v1/personnel');
    const outsider = roster.data.personnel.find(
      (person) =>
        person.status === 'active' &&
        !person.qualificationIds.includes(seat) &&
        !crewed.assignees.some((assignee) => assignee.personnelId === person.id),
    );
    expect(outsider, 'somebody on the roster should not hold that mark').toBeTruthy();
    if (!outsider) return;

    const refusal = await page.evaluate(
      async (input: { assignmentId: string; personnelId: string; role: string }) => {
        const response = await fetch(`/api/v1/assignments/${input.assignmentId}/assign`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            personnelId: input.personnelId,
            role: input.role,
            overrideReason: 'בכל זאת',
          }),
        });
        return { status: response.status, body: await response.text() };
      },
      { assignmentId: crewed.id, personnelId: outsider.id, role: seat },
    );

    // 422, not 409: this is not a conflict to be weighed and then overridden.
    // The override reason is in the request precisely to prove it is ignored.
    expect(refusal.status).toBe(422);
    expect(refusal.body).toContain('אינו מחזיק בהכשיר');

    // And nothing was written.
    const after = await read<{ data: { assignments: Shift[] } }>(
      `/api/v1/assignments?from=${day.from}&to=${day.to}`,
    );
    const reread = after.data.assignments.find((shift) => shift.id === crewed.id);
    expect(
      reread?.assignees.some((assignee) => assignee.personnelId === outsider.id) ?? false,
    ).toBe(false);
  });
});
