import { expect, test, type Page } from '@playwright/test';
import { login } from './helpers';

/*
 * "תבדוק שכל הכפתורים עובדים."
 *
 * Every other spec checks a path somebody thought to write down. This one
 * presses everything on every screen and fails on what a reader would actually
 * see go wrong: an uncaught exception, an error logged to the console, or a 5xx
 * from the API. It is deliberately dumb — that is what makes it catch the
 * button nobody remembered.
 *
 * It found the personal-schedule screen answering an administrator with
 * "הפריט המבוקש לא נמצא", which no written test was looking for.
 */
const ROUTES = [
  '/',
  '/schedule',
  '/schedule/conflicts',
  '/personnel',
  '/availability',
  '/assignment-types',
  '/replacements',
  '/reports',
  '/notifications',
  '/me',
  '/settings',
];

/**
 * Buttons this sweep must not press.
 *
 * Signing out ends the session for every later click, and the print dialog is a
 * native window Playwright cannot close. Retiring a post is the same kind of
 * problem one step out: the whole suite shares one database, so a sweep that
 * switches ש״ג off leaves every later spec — and the phone project, which runs
 * after this one — with a roster that no longer offers it. Retiring is covered
 * directly, and deliberately, by `assignment-types.spec.ts`.
 */
const SKIP = /התנתקות|החשבון שלי|ייצוא PDF|השבתת סוג המשימה/;

/** A 401 on the login screen is the app asking who you are, not a failure. */
const EXPECTED = /Failed to load resource/;

test.describe.configure({ mode: 'parallel', timeout: 180_000 });

for (const route of ROUTES) {
  test(`presses every button on ${route}`, async ({ page, isMobile }) => {
    // Desktop only. The sweep is the slowest thing in the suite, and the phone
    // layout renders the same components behind the same handlers — what it
    // changes is where they sit, which `navigation.spec.ts` checks directly.
    test.skip(isMobile, 'the phone layout is covered by navigation.spec.ts');
    await sweep(page, route);
  });
}

async function sweep(page: Page, route: string): Promise<void> {
  const problems: string[] = [];
  page.on('pageerror', (error) => problems.push(`pageerror on ${page.url()}: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error' && !EXPECTED.test(message.text())) {
      problems.push(`console error on ${page.url()}: ${message.text()}`);
    }
  });
  page.on('response', (response) => {
    if (response.status() >= 500) problems.push(`HTTP ${response.status()}: ${response.url()}`);
  });

  await login(page);
  await page.goto(route);
  await page.waitForLoadState('networkidle');

  const buttons = page.locator('button:visible');
  const count = await buttons.count();
  for (let index = 0; index < count; index += 1) {
    const button = buttons.nth(index);
    const label = ((await button.textContent().catch(() => '')) ?? '').trim();
    if (SKIP.test(label)) continue;
    try {
      if (!(await button.isVisible()) || (await button.isDisabled())) continue;
      await button.click({ timeout: 3000 });
      await page.waitForTimeout(200);
    } catch (error) {
      problems.push(`clicking "${label}" on ${route}: ${String(error).split('\n')[0]}`);
    }
    // Put the screen back the way it was before pressing the next thing.
    if (await page.locator('dialog[open]').count()) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(150);
    }
    if (new URL(page.url()).pathname !== route) await page.goto(route);
  }

  expect(problems).toEqual([]);
}
