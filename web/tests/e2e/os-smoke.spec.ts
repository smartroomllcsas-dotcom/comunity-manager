import { test, expect } from '@playwright/test';

// These tests require the community-os flag active for the test user.
// For local: set FLAGS_TEST_MODE=1 or seed test user in FULL_ROLLOUT_EMAILS.
// For CI: skip if E2E_SKIP_OS_ROUTES=1.

const OS_ROUTES = [
  '/es/os',
  '/es/os/agents',
  '/es/os/goals',
  '/es/os/skills',
  '/es/os/funnel',
  '/es/os/content',
  '/es/os/social',
  '/es/os/workflows',
  '/es/os/integrations',
  '/es/os/command',
  '/es/os/brain',
];

test.describe('OS routes render (flag on)', () => {
  test.skip(!!process.env.E2E_SKIP_OS_ROUTES, 'OS routes skipped by env');

  for (const route of OS_ROUTES) {
    test(`route ${route} renders without 500`, async ({ page }) => {
      const response = await page.goto(route, { waitUntil: 'domcontentloaded' });
      // Allow 200 (flag on) or 404 (flag off / no auth); reject 500
      expect(response?.status()).toBeLessThan(500);
      // No visible error boundary
      await expect(page.locator('text=/500|internal server error|application error/i')).toHaveCount(0);
    });
  }
});

test.describe('Dashboard regression (must not break)', () => {
  test.skip(!!process.env.E2E_SKIP_DASHBOARD, 'dashboard tests skipped');

  const LEGACY_ROUTES = ['/', '/dashboard', '/inbox', '/contacts', '/broadcasts', '/analytics'];
  for (const route of LEGACY_ROUTES) {
    test(`legacy route ${route} still works`, async ({ page }) => {
      const response = await page.goto(route, { waitUntil: 'domcontentloaded' });
      expect(response?.status()).toBeLessThan(500);
    });
  }
});

test('sidebar has Community OS link when flag active', async ({ page }) => {
  test.skip(!process.env.E2E_LOGIN_USER, 'no login credentials — skipping');
  await page.goto('/');
  // TODO Sprint 4: implement login helper. Sprint 3: assumes already-logged session cookie.
  const osLink = page.locator('a[href*="/os"]:has-text("Community OS")');
  await expect(osLink).toBeVisible({ timeout: 5000 });
});
