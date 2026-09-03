import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

// Read rather than imported: `tests/e2e/start-server.mjs` loads the same file
// the same way, so the suite and the server cannot drift apart, and neither
// side needs an ESM import attribute.
const credentials = JSON.parse(
  readFileSync(new URL('./credentials.json', import.meta.url), 'utf8'),
) as { email: string; password: string };

export const ADMIN_EMAIL = credentials.email;
export const ADMIN_PASSWORD = credentials.password;

export async function login(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'שם משתמש' }).fill(ADMIN_EMAIL);
  await page.getByLabel('סיסמה').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'כניסה' }).click();
  await expect(page.getByRole('heading', { name: 'לוח בקרה' })).toBeVisible();
}

/** Signs out through the account menu, the way a person would. */
export async function logout(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'החשבון שלי' }).click();
  await page.getByRole('menuitem', { name: 'התנתקות' }).click();
  await expect(page.getByRole('button', { name: 'כניסה' })).toBeVisible();
}

export async function loginAs(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'שם משתמש' }).fill(email);
  await page.getByLabel('סיסמה').fill(password);
  await page.getByRole('button', { name: 'כניסה' }).click();
}

export interface ApiResult {
  status: number;
  body: string;
}

/**
 * Straight at the API with the signed-in session, from inside the page.
 *
 * Several specs need to set up more than a screen offers, or to check that the
 * server refuses something the screen would never send.
 */
export function apiCall(
  page: Page,
  path: string,
  method = 'GET',
  body?: unknown,
): Promise<ApiResult> {
  return page.evaluate<ApiResult, { path: string; method: string; body?: unknown }>(
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
}

export function dataOf<T>(result: ApiResult): T {
  return (JSON.parse(result.body) as { data: T }).data;
}

/**
 * Somebody who exists only for this test.
 *
 * The suite shares one database, and by the time a spec runs the day may
 * already be fully booked — sixteen hours of rest then makes everyone on the
 * roster ineligible for anything else that day, which has nothing to do with
 * what the spec is checking. A person created here has stood nothing.
 */
export async function createTestPerson(
  page: Page,
  label: string,
  qualificationIds: string[] = [],
): Promise<{ id: string; name: string }> {
  const name = `${label} ${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
  const created = await apiCall(page, '/api/v1/personnel', 'POST', {
    displayName: name,
    qualificationIds,
  });
  expect(created.status, created.body).toBe(200);
  return { id: dataOf<{ id: string }>(created).id, name };
}

/** Archives them again, so the roster the next spec reads is the one it expected. */
export async function archivePeople(page: Page, ids: string[]): Promise<void> {
  for (const id of ids) await apiCall(page, `/api/v1/personnel/${id}`, 'DELETE');
}
