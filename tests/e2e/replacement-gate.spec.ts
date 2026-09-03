import { expect, test } from '@playwright/test';
import { login } from './helpers';

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
interface Seat {
  qualificationId: string;
  minCount: number;
}
interface Shift {
  id: string;
  requiredQualifications: Seat[];
  assignees: { personnelId: string; role: string | null }[];
}
interface Person {
  id: string;
  status: string;
  qualificationIds: string[];
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

    const read = <T>(path: string) =>
      page.evaluate<T, string>(async (url) => {
        const response = await fetch(url);
        return (await response.json()) as T;
      }, path);
    const send = (path: string, method: string, body: unknown) =>
      page.evaluate<
        { status: number; body: string },
        { path: string; method: string; body: unknown }
      >(
        async (input) => {
          const response = await fetch(input.path, {
            method: input.method,
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(input.body),
          });
          return { status: response.status, body: await response.text() };
        },
        { path, method, body },
      );

    const day = await page.evaluate(() => {
      const midnight = new Date();
      midnight.setHours(0, 0, 0, 0);
      return { from: midnight.getTime(), to: midnight.getTime() + 24 * 60 * 60 * 1000 - 1 };
    });
    const window = `/api/v1/assignments?from=${day.from}&to=${day.to}`;

    const board = await read<{ data: { assignments: Shift[] } }>(window);
    const shift = board.data.assignments.find((candidate) =>
      candidate.requiredQualifications.some((item) => item.minCount > 0),
    );
    expect(shift, 'the sheet should carry a crewed post').toBeTruthy();
    if (!shift) return;
    const seat = shift.requiredQualifications.find((item) => item.minCount > 0)?.qualificationId;
    expect(seat).toBeTruthy();
    if (!seat) return;

    const roster = (
      await read<{ data: { personnel: Person[] } }>('/api/v1/personnel')
    ).data.personnel.filter((person) => person.status === 'active');
    const holders = roster.filter((person) => person.qualificationIds.includes(seat));
    const outsider = roster.find((person) => !person.qualificationIds.includes(seat));
    expect(holders.length, 'two holders are needed to swap one for the other').toBeGreaterThan(1);
    expect(outsider).toBeTruthy();
    if (holders.length < 2 || !outsider) return;
    const [standing, standIn] = holders;

    const assigned = await send(`/api/v1/assignments/${shift.id}/assign`, 'POST', {
      personnelId: standing.id,
      role: seat,
    });
    expect(assigned.status, assigned.body).toBe(200);

    const requested = await send('/api/v1/replacements', 'POST', {
      assignmentId: shift.id,
      personnelId: standing.id,
      reason: null,
    });
    expect(requested.status, requested.body).toBe(200);
    const requestId = (JSON.parse(requested.body) as { data: { id: string } }).data.id;

    // The override reason is in the request precisely to prove it is ignored:
    // a seat's mark is not a rule that a reason can buy its way past.
    const refused = await send(`/api/v1/replacements/${requestId}`, 'PATCH', {
      status: 'approved',
      replacementPersonnelId: outsider.id,
      overrideReason: 'בכל זאת',
    });
    expect(refused.status).toBe(422);
    expect(refused.body).toContain('אינו מחזיק בהכשיר');

    // Nothing moved: the original is still on the shift and still in the seat.
    const midway = (await read<{ data: { assignments: Shift[] } }>(window)).data.assignments.find(
      (candidate) => candidate.id === shift.id,
    );
    expect(midway?.assignees.some((one) => one.personnelId === outsider.id) ?? false).toBe(false);
    expect(
      midway?.assignees.some((one) => one.personnelId === standing.id && one.role === seat) ??
        false,
    ).toBe(true);

    // A stand-in who does hold it takes the seat, mark and all.
    const approved = await send(`/api/v1/replacements/${requestId}`, 'PATCH', {
      status: 'approved',
      replacementPersonnelId: standIn.id,
    });
    expect(approved.status, approved.body).toBe(200);

    const after = (await read<{ data: { assignments: Shift[] } }>(window)).data.assignments.find(
      (candidate) => candidate.id === shift.id,
    );
    expect(after?.assignees.some((one) => one.personnelId === standing.id) ?? false).toBe(false);
    expect(
      after?.assignees.some((one) => one.personnelId === standIn.id && one.role === seat) ?? false,
    ).toBe(true);
  });
});
