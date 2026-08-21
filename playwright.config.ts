import { defineConfig, devices } from '@playwright/test';

const PORT = 8788;
const baseURL = `http://127.0.0.1:${PORT}`;

/**
 * Escape hatch for sandboxes that ship a Chromium build Playwright did not
 * download itself. CI leaves it unset and uses the managed browser.
 */
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH;
const launchOptions = executablePath ? { launchOptions: { executablePath } } : {};

/**
 * E2E runs against the real stack: Vite build + Pages Functions + local D1.
 * `global-setup` resets the database so every run starts from known data.
 */
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL,
    locale: 'he-IL',
    timezoneId: 'Asia/Jerusalem',
    trace: 'retain-on-failure',
  },
  webServer: {
    // start-server.mjs applies migrations, reloads demo data and injects the
    // bootstrap credentials before wrangler binds the port.
    command: 'npm run build && node tests/e2e/start-server.mjs',
    url: `${baseURL}/api/v1/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
  projects: [
    {
      name: 'desktop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        ...launchOptions,
      },
    },
    // Chromium-based phone emulation: the mobile checks are about the RTL
    // layout and tap targets, and this keeps one browser download in CI.
    { name: 'mobile', use: { ...devices['Pixel 7'], ...launchOptions } },
  ],
});
