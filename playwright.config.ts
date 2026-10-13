import { defineConfig, devices } from '@playwright/test'

/**
 * E2E configuration.
 *
 * - `tests/e2e/public.spec.ts` runs against any build, with or without Supabase.
 * - `tests/e2e/flows.spec.ts` needs a Supabase project with migrations + seed applied,
 *   PAYMENTS_SANDBOX_ENABLED=true and the E2E_* accounts described in TESTING.md;
 *   it skips itself otherwise.
 *
 * By default a production server is started on :3100 (`npm run build` first).
 * Set E2E_BASE_URL to test an already running deployment instead.
 */
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3100'
// Use an installed browser (e.g. 'chrome' or 'msedge') when Playwright's bundled build is unavailable.
const channel = process.env.E2E_BROWSER_CHANNEL || undefined

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  timeout: 45_000,
  use: { baseURL, trace: 'retain-on-failure', locale: 'ar-EG', timezoneId: 'Africa/Cairo' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], channel } },
    { name: 'mobile', use: { ...devices['Pixel 7'], channel }, testMatch: /public\.spec\.ts/ },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: 'npx next start -p 3100', url: baseURL, reuseExistingServer: !process.env.CI, timeout: 120_000 },
})
