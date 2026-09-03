import { expect, test } from '@playwright/test';
import { login } from './helpers';

/*
 * "When am I next on duty?" is answered best by the calendar already on the
 * phone. A calendar app cannot sign in, so the token in the path is the whole
 * credential — which is exactly what has to be checked here: that the feed
 * opens without a session, and that anything else does not.
 */
test.describe('personal calendar feed', () => {
  test('publishes the shifts to a link that needs no session', async ({ page, request }) => {
    await login(page);

    const call = (path: string, method = 'GET', body?: unknown) =>
      page.evaluate<
        { status: number; body: string },
        { path: string; method: string; body?: unknown }
      >(
        async (input) => {
          const response = await fetch(input.path, {
            method: input.method,
            ...(input.body === undefined
              ? {}
              : {
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify(input.body),
                }),
          });
          return { status: response.status, body: await response.text() };
        },
        { path, method, body },
      );

    // A shift for the feed to carry.
    await page.goto('/schedule');
    await page.getByRole('button', { name: 'משימה חדשה' }).click();
    const form = page.locator('dialog[open]');
    await form.getByRole('combobox', { name: 'סוג משימה' }).selectOption({ label: 'ש״ג' });
    await form.getByRole('textbox', { name: 'שעת התחלה' }).fill('09:00');
    await form.getByRole('button', { name: 'יצירת משימה' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    const day = await page.evaluate(() => {
      const midnight = new Date();
      midnight.setHours(0, 0, 0, 0);
      return { from: midnight.getTime(), to: midnight.getTime() + 24 * 60 * 60 * 1000 - 1 };
    });
    const board = JSON.parse(
      (await call(`/api/v1/assignments?from=${day.from}&to=${day.to}`)).body,
    ) as { data: { assignments: { id: string; startAt: number }[] } };
    const shift = board.data.assignments.at(-1);
    expect(shift).toBeTruthy();
    if (!shift) return;

    /*
     * Whoever the engine says may stand it — the post bars anyone marked
     * מפקד, so picking the first name on the roster picks a refusal.
     */
    const ranked = JSON.parse((await call(`/api/v1/assignments/${shift.id}/candidates`)).body) as {
      data: { candidates: { personnelId: string; eligible: boolean }[] };
    };
    const person = ranked.data.candidates.find((candidate) => candidate.eligible);
    expect(person, 'somebody should be able to stand a gate').toBeTruthy();
    if (!person) return;

    const assigned = await call(`/api/v1/assignments/${shift.id}/assign`, 'POST', {
      personnelId: person.personnelId,
    });
    expect(assigned.status, assigned.body).toBe(200);

    // The bootstrap administrator stands for nobody, and a feed is one
    // person's duty times — so link the account to the person on the shift,
    // the way the users screen does.
    const me = JSON.parse((await call('/api/v1/auth/me')).body) as {
      data: { user: { id: string } };
    };
    const linked = await call(`/api/v1/users/${me.data.user.id}`, 'PATCH', {
      personnelId: person.personnelId,
    });
    expect(linked.status, linked.body).toBe(200);

    // Issue the link through the screen, the way a soldier would.
    await page.goto('/me');
    await expect(page.getByRole('heading', { name: 'יומן אישי' })).toBeVisible();
    await page.getByRole('button', { name: 'הפקת קישור' }).click();
    const field = page.getByRole('textbox', { name: 'יומן אישי' });
    await expect(field).toBeVisible();
    const url = await field.inputValue();
    expect(url).toMatch(/\/api\/v1\/calendar\/[0-9a-f]+\.ics$/);

    // `request` never signed in: this is a calendar app, not the browser.
    const feed = await request.get(url);
    expect(feed.status()).toBe(200);
    expect(feed.headers()['content-type']).toContain('text/calendar');
    const ics = await feed.text();
    expect(ics.startsWith('BEGIN:VCALENDAR')).toBe(true);
    expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true);
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain('TRIGGER:-PT60M');

    // A token nobody issued is answered exactly like a retired one.
    const wrong = await request.get(url.replace(/[0-9a-f]{6}\.ics$/, 'aaaaaa.ics'));
    expect(wrong.status()).toBe(404);

    // Revoking stops the feed, which is what "I shared it by mistake" needs.
    await page.getByRole('button', { name: 'ביטול הקישור' }).click();
    await expect.poll(async () => (await request.get(url)).status(), { timeout: 10_000 }).toBe(404);
  });
});
