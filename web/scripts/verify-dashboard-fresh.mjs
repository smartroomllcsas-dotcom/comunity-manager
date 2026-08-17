import { chromium } from '@playwright/test';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, bypassCSP: true });
// Force no-cache
await ctx.route('**/*', (route) => {
  const headers = { ...route.request().headers(), 'cache-control': 'no-cache, no-store, must-revalidate', 'pragma': 'no-cache' };
  route.continue({ headers });
});
const page = await ctx.newPage();
await page.goto('https://www.comunitymanager.io/login', { waitUntil: 'networkidle' });
await page.fill('input[type=email]', 'leonelzc2005@gmail.com');
await page.fill('input[type=password]', '123456789');
await Promise.all([page.waitForNavigation({timeout: 15000}).catch(()=>null), page.click('button[type=submit]')]);
await page.waitForTimeout(2000);
await page.goto('https://www.comunitymanager.io/dashboard', { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
// Expand sidebar
await page.click('button[aria-label="Expandir menú"]', { timeout: 3000 }).catch(()=>{});
await page.waitForTimeout(500);
await page.screenshot({ path: 'F:/comunity manager/community-manager-platform/web/tmp-debug/verify-dashboard.png', fullPage: false });
const hasOs = await page.locator('a[href="/es/os"]').count();
const hasText = await page.locator('text="Community OS"').count();
const deployId = await page.getAttribute('html', 'data-dpl-id').catch(()=>null);
console.log(`os link count: ${hasOs}`);
console.log(`Community OS text: ${hasText}`);
console.log(`deploy id: ${deployId}`);
await browser.close();
